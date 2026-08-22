import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { analyzeReceipt, isAllowedReceiptType } from "@/lib/receipt-ocr";
import { getReceiptConfig } from "@/lib/receipt-config";
import { getRestaurantDisplayName } from "@/lib/restaurant";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordScan } from "@/lib/scan-meter";
import { storeScan } from "@/lib/receipt-scans";
import { MAX_UPLOAD_BYTES, describeUploadFailure } from "@/lib/receipt-upload-errors";

export const maxDuration = 30;

// Aperçu UX temps réel uniquement ("Montant détecté : €X").
// La source de vérité anti-fraude est la ré-analyse serveur dans
// app/api/orders/route.ts — les valeurs retournées ici ne sont
// jamais utilisées pour le flagging.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  // F8 (sécurité) — anti-abus de l'OCR (appels Claude Vision FACTURÉS) : au plus
  // 20 analyses par heure et par membre. Fail-open tant que m44 n'est pas
  // appliquée (voir lib/rate-limit.ts).
  if (!(await checkRateLimit(user.id, "ocr_parse_receipt", 20, 3600))) {
    return NextResponse.json(
      { error: "Trop de scans en peu de temps. Réessaie dans quelques minutes." },
      { status: 429 }
    );
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
  const scanId = await storeScan({
    restaurantId: String(rawRestaurantId),
    userId: user.id,
    file,
    analysis,
    outcome: analysis.has_restaurant_header ? "parsed" : "header_rejected",
  });

  if (!analysis.has_restaurant_header) {
    return NextResponse.json(
      {
        error: `Cette image ne ressemble pas à un ticket ${restaurantName}. Prends en photo le reçu papier de ta commande directe.`,
      },
      { status: 422 }
    );
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
  });
}
