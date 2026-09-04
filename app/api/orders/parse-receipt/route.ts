import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { analyzeReceipt, isAllowedReceiptType } from "@/lib/receipt-ocr";
import { getReceiptConfig } from "@/lib/receipt-config";
import { getRestaurantDisplayName } from "@/lib/restaurant";
import { checkRateLimit, checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { recordScan } from "@/lib/scan-meter";
import { storeScan } from "@/lib/receipt-scans";
import { MAX_UPLOAD_BYTES, describeUploadFailure } from "@/lib/receipt-upload-errors";
import { loadRewardGrid, resolveSoloReward, nextSoloTier, type NextSoloTier } from "@/lib/rewards";

export const maxDuration = 30;

// ADR 0045 — anti-abus du visiteur anonyme (pas de user_id à rate-limiter) :
// plafond plus serré qu'authentifié, c'est un aperçu "preuve du scan" avant
// tout engagement, pas un usage répété.
const VISITOR_MAX_SCANS = 8;
const VISITOR_WINDOW_SECONDS = 3600;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Aperçu UX temps réel uniquement ("Montant détecté : €X").
// La source de vérité anti-fraude est la ré-analyse serveur dans
// app/api/orders/route.ts — les valeurs retournées ici ne sont
// jamais utilisées pour le flagging.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // F8 (sécurité) — anti-abus de l'OCR (appels Claude Vision FACTURÉS).
  // ADR 0045 — ouvert aux visiteurs (preuve du scan avant la création de
  // compte) : sans session, pas de user_id à rate-limiter, on bride par IP
  // à la place. Fail-open tant que la migration correspondante n'est pas
  // appliquée (voir lib/rate-limit.ts).
  if (user) {
    if (!(await checkRateLimit(user.id, "ocr_parse_receipt", 20, 3600))) {
      return NextResponse.json(
        { error: "Trop de scans en peu de temps. Réessaie dans quelques minutes." },
        { status: 429 }
      );
    }
  } else {
    const ipHash = hashIp(clientIp(request));
    if (!(await checkIpRateLimit(ipHash, "ocr_parse_receipt_visitor", VISITOR_MAX_SCANS, VISITOR_WINDOW_SECONDS))) {
      return NextResponse.json(
        { error: "Trop de scans en peu de temps. Réessaie dans quelques minutes." },
        { status: 429 }
      );
    }
  }

  const formData = await request.formData();
  const file = formData.get("receipt") as File | null;
  const rawRestaurantId = formData.get("restaurantId");

  if (!file) return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
  if (!rawRestaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  // Au-delà de ~4,5 Mo, Vercel répond 413 AVANT ce code (corps texte, pas
  // JSON) ; ici on couvre la bande 4–4,5 Mo avec un message vrai. Le client
  // allège les photos avant envoi (lib/receipt-image-client.ts) — ce garde ne
  // devrait plus se déclencher que sur un vieux navigateur.
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: describeUploadFailure(413, null) }, { status: 413 });
  if (!isAllowedReceiptType(file.type))
    return NextResponse.json(
      { error: "Format non supporté. Utilise JPG, PNG ou WebP." },
      { status: 400 }
    );

  const [restaurantName, receiptConfig] = await Promise.all([
    getRestaurantDisplayName(String(rawRestaurantId)),
    getReceiptConfig(String(rawRestaurantId)),
  ]);

  let analysis;
  try {
    analysis = await analyzeReceipt(file, restaurantName, receiptConfig);
  } catch (err) {
    console.error("[parse-receipt] Claude vision error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de l'image. Réessaie avec une photo plus nette." },
      { status: 502 }
    );
  }

  // ADR 0029 §6 (Phase 3) — métering du volume OCR par resto/mois. L'appel
  // Vision vient d'être facturé, on le compte — best-effort, ne bloque JAMAIS
  // le scan du membre (le plafond Gratuit ne déclenche qu'un nudge admin).
  await recordScan(String(rawRestaurantId));

  // ADR 0036 — l'image et ce que le modèle en a lu sont conservés 30 jours,
  // y compris quand le scan n'aboutit pas : un ticket refusé à l'entête est
  // justement ce qu'on veut pouvoir regarder. Best-effort, jamais bloquant.
  // ADR 0045 — suppose un membre (receipt_scans.user_id NOT NULL) : un
  // visiteur anonyme n'a pas encore de compte, cet aperçu-là n'est donc pas
  // archivé (il le sera à la vraie soumission, authentifiée).
  // Incident 2026-09-02 (49 refus sur 70 scans à Kraainem) : la clé de
  // commande lue par l'OCR est une preuve d'identité PLUS FORTE que le nom du
  // resto en haut du ticket — elle matche le format propre à l'établissement
  // (ADR 0019), sa date est vérifiée (receipt-key-sanity) et elle ne peut
  // servir qu'une fois (duplicate_key). Le Bestelnummer étant imprimé EN BAS
  // des tickets de borne, exiger l'en-tête punissait exactement le bon
  // cadrage (total + numéro). En-tête absent + clé absente → refus, sinon on
  // laisse passer.
  const receiptProven = analysis.has_restaurant_header || analysis.order_number !== null;

  const scanId = user
    ? await storeScan({
        restaurantId: String(rawRestaurantId),
        userId: user.id,
        file,
        analysis,
        outcome: receiptProven ? "parsed" : "header_rejected",
      })
    : null;

  if (!receiptProven) {
    const keyLabel = receiptConfig.key_label ?? "numéro de commande";
    return NextResponse.json(
      {
        error: `On n'a pas reconnu de ticket ${restaurantName} sur cette photo. Cadre la zone du total et du ${keyLabel}, de près et bien à plat — pas besoin de tout le ticket.`,
      },
      { status: 422 }
    );
  }

  // Le GAIN, dès l'aperçu et AVANT toute demande de compte (parcours cible,
  // 2026-09-04) : le montant seul ne dit rien à un client debout au comptoir —
  // ce qui le retient, c'est « tu repars avec X », ou « il te manque un rien
  // pour X ». Les deux viennent du catalogue réel de l'établissement.
  //
  // Ce qui sort : des NOMS d'articles, rien d'autre. Jamais un seuil, jamais un
  // euro, jamais un coût de revient (ADR 0007 amendé par ADR 0028, ADR 0017).
  // Best-effort : une grille non configurée ou une panne renvoie null, et
  // l'écran retombe sur le montant détecté — jamais d'erreur pour un aperçu.
  let reward: string | null = null;
  let nextTier: NextSoloTier | null = null;
  if (analysis.amount !== null) {
    try {
      const grid = await loadRewardGrid(String(rawRestaurantId));
      reward = resolveSoloReward(grid, analysis.amount).item;
      nextTier = nextSoloTier(grid, analysis.amount);
    } catch (err) {
      console.error("[parse-receipt] aperçu du cadeau indisponible:", err);
    }
  }

  // key_label / key_example / has_reliable_key : métadonnées non sensibles
  // pour libeller le champ côté client (le pattern reste service-role —
  // ADR 0019). scan_id : jeton opaque renvoyé tel quel à la soumission, qui
  // réutilise l'image déjà stockée au lieu de la déposer une seconde fois.
  return NextResponse.json({
    ...analysis, // inclut key_corrected (année de la clé réparée → à vérifier)
    key_label: receiptConfig.key_label,
    key_example: receiptConfig.key_examples[0] ?? null,
    has_reliable_key: receiptConfig.has_reliable_key,
    scan_id: scanId,
    reward,
    next_tier: nextTier,
  });
}
