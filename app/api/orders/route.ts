import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { validateOrderDate } from "@/lib/orders";
import { getReceiptConfig, validateOrderKey, extractDateFromKey } from "@/lib/receipt-config";
import { createPendingReward, LEGACY_RESTAURANT_ID } from "@/lib/rewards";
import { incrementProgramRevenue } from "@/lib/budget";
import { recordFunnelStep } from "@/lib/funnel";
import { analyzeReceipt, type ReceiptAnalysis } from "@/lib/receipt-ocr";
import { insertOrderItems } from "@/lib/order-items";
import { claimScanImage, linkScanToOrder, storeScan } from "@/lib/receipt-scans";
import { getRestaurantDisplayName } from "@/lib/restaurant";
import { guardAgainstDuplicates, recordDuplicateReview } from "@/lib/duplicate-guard";
import { DUPLICATE_MEMBER_MESSAGE } from "@/lib/duplicate-detection";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordScan } from "@/lib/scan-meter";
import { MAX_UPLOAD_BYTES, describeUploadFailure } from "@/lib/receipt-upload-errors";
import { POSTER_MEMBER_MESSAGE } from "@/lib/poster-detect";
import { judgeReceipt, notAReceiptMessage } from "@/lib/receipt-proof";
import { missingReceiptParts } from "@/lib/ticket-auto-send";
import { personalPointsForOrder, type PointsGoal } from "@/lib/catalogue";
import { getPointsGoal } from "@/lib/points";
import { amountBand } from "@/lib/analytics";

export const maxDuration = 30;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// ADR 0058 — refus « reprends la photo » : la lecture serveur ne donne pas le
// total ou la clé. `missing` permet à l'écran ticket de dire QUOI recadrer.
function reframe(missing: { total: boolean; key: boolean }, error?: string) {
  return NextResponse.json(
    {
      error: error ?? "On voit mal ton ticket : reprends la photo en cadrant bien le total et le numéro.",
      missing,
    },
    { status: 422 }
  );
}

async function countTodayOrders(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, restaurantId: string) {
  const today = new Date().toISOString().split("T")[0];
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .gte("submitted_at", `${today}T00:00:00Z`);
  return count ?? 0;
}


export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // ADR 0058 — un ticket est une PHOTO, rien d'autre. Le montant et la clé de
  // commande ne viennent JAMAIS du client : ils sont lus plus bas par l'OCR
  // serveur, seule source de vérité. Tout champ `amount` / `order_number`
  // envoyé est ignoré. L'ancien chemin JSON (montant + numéro sans photo,
  // « outils admin ») n'avait plus aucun appelant : c'était une porte ouverte
  // à la fraude, il est retiré.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "La photo du ticket est requise." }, { status: 400 });
  }
  const formData = await request.formData();
  const receiptFile = formData.get("receipt") as File | null;
  const rawRestaurantId = formData.get("restaurantId");
  const rawScanId = formData.get("scan_id");
  if (!receiptFile || !rawRestaurantId) {
    return NextResponse.json({ error: "Champs manquants (receipt, restaurantId)." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(receiptFile.type as typeof ALLOWED_TYPES[number])) {
    return NextResponse.json({ error: "Format de ticket non supporté." }, { status: 400 });
  }
  // Même garde qu'à l'aperçu : au-delà de ~4,5 Mo, Vercel coupe avant ce code.
  if (receiptFile.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: describeUploadFailure(413, null) }, { status: 413 });
  const restaurantId = String(rawRestaurantId);
  const scanId = rawScanId ? String(rawScanId) : null;

  // F8 (sécurité) — chaque envoi paie un appel Vision. Le membre n'ayant plus
  // d'aperçu (ADR 0058 §4), c'est ici que l'OCR se plafonne : même compteur
  // que l'aperçu, 20 lectures par heure.
  if (!(await checkRateLimit(user.id, "ocr_parse_receipt", 20, 3600))) {
    return NextResponse.json(
      { error: "Trop de scans en peu de temps. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  // ADR 0019 — la clé de commande est définie par l'établissement
  // (restaurant_receipt_config, fallback Bestelnummer legacy).
  const receiptConfig = await getReceiptConfig(restaurantId);

  // ADR 0058 — sans lecture serveur, pas de commande (plus de repli en revue
  // sur des valeurs tapées) : on demande de réessayer.
  const restaurantName = await getRestaurantDisplayName(restaurantId);
  let serverOcr: ReceiptAnalysis;
  try {
    serverOcr = await analyzeReceipt(receiptFile, restaurantName, receiptConfig);
  } catch {
    return NextResponse.json(
      { error: "On n'a pas pu lire ton ticket. Réessaie dans un instant." },
      { status: 502 }
    );
  }

  // ADR 0029 §6 — l'appel Vision vient d'être facturé : on le compte.
  await recordScan(restaurantId);

  // ADR 0058 §4 — lecture unique : ce que faisait l'aperçu du membre se fait
  // ici, avec la même règle que l'aperçu du visiteur (lib/receipt-proof).
  const verdict = judgeReceipt(serverOcr);

  // ADR 0036 — chaque lecture est conservée 30 jours, refus compris : c'est
  // l'outil de contrôle qualité de l'OCR. Un jeton d'aperçu encore valide
  // réutilise l'image déjà rangée.
  const readingScanId =
    scanId ??
    (await storeScan({
      restaurantId,
      userId: user.id,
      file: receiptFile,
      analysis: serverOcr,
      outcome: verdict === "receipt" ? "parsed" : "header_rejected",
    }));

  if (verdict === "poster") {
    await recordFunnelStep(restaurantId, "ticket_rejected", "qr_detected");
    return NextResponse.json({ error: POSTER_MEMBER_MESSAGE }, { status: 422 });
  }
  if (verdict === "not_a_receipt") {
    await recordFunnelStep(
      restaurantId,
      "ticket_rejected",
      serverOcr.amount === null ? "unreadable" : "header_rejected"
    );
    return NextResponse.json(
      { error: notAReceiptMessage(restaurantName, receiptConfig.key_label) },
      { status: 422 }
    );
  }

  // Lecture incomplète : total absent ou hors bornes, ou — là où
  // l'établissement a une clé fiable — clé absente ou à l'année réparée. Rien
  // n'est créé : le membre reprend la photo, `missing` dit quoi recadrer.
  // Aucune saisie ne comble le trou (ADR 0058).
  const missing = missingReceiptParts({
    amount: serverOcr.amount,
    order_number: serverOcr.order_number,
    key_corrected: serverOcr.key_corrected,
    has_reliable_key: receiptConfig.has_reliable_key,
  });
  if (missing) {
    await recordFunnelStep(restaurantId, "ticket_rejected", "unreadable");
    return reframe(missing);
  }

  let orderNumber = serverOcr.order_number ?? "";
  const amount = serverOcr.amount as number;
  const hasOrderKey = receiptConfig.has_reliable_key && orderNumber.trim().length > 0;

  if (hasOrderKey) {
    // Défensif : analyzeReceipt ne rend qu'une clé conforme au pattern.
    if (validateOrderKey(orderNumber, receiptConfig)) return reframe({ total: false, key: true });
    orderNumber = orderNumber.trim();
  }

  // Date dérivée de la clé quand le format l'encapsule (date_group),
  // sinon date du jour.
  const keyDate = hasOrderKey ? extractDateFromKey(orderNumber, receiptConfig) : null;
  const orderDate = keyDate ?? new Date().toISOString().split("T")[0];

  if (keyDate) {
    const dateError = validateOrderDate(orderDate);
    // La date vient du NUMÉRO lu sur le ticket : si elle est refusée, c'est
    // presque toujours une année mal lue (incident Kasia). Plus de correction
    // à la main (ADR 0058) : on redemande une photo, en disant pourquoi.
    if (dateError)
      return reframe(
        { total: false, key: true },
        `${dateError} La date ${keyDate} vient du numéro lu sur ton ticket : reprends la photo en cadrant bien le numéro.`
      );

    // Plancher par établissement : un ticket ne peut pas être antérieur à
    // l'arrivée du resto dans le programme (restaurants.created_at). Le resto
    // legacy garde le plancher global NEXT_PUBLIC_PROGRAM_START_DATE — sa
    // ligne restaurants a été créée après son vrai lancement (m27).
    if (restaurantId !== LEGACY_RESTAURANT_ID) {
      const { data: resto } = await createAdminClient()
        .from("restaurants")
        .select("created_at")
        .eq("id", restaurantId)
        .maybeSingle();
      const restaurantStart = resto?.created_at ? String(resto.created_at).slice(0, 10) : null;
      if (restaurantStart && orderDate < restaurantStart) {
        return NextResponse.json(
          { error: `Les commandes sont comptabilisées à partir du ${restaurantStart}.` },
          { status: 400 }
        );
      }
    }
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("team_id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  // ADR 0034 — l'équipe n'est plus un préalable à l'envoi d'un ticket. Le
  // membre doit avoir rejoint l'établissement (l'adhésion porte le lien
  // membre ↔ resto), mais il peut scanner sans équipe : seule la couche 1
  // (palier solo) lui est due, les couches 2 et 3 reprennent dès qu'il en
  // rejoint une (lib/rewards.ts).
  if (!membership) {
    return NextResponse.json({ error: "Rejoins d'abord cet établissement pour envoyer un ticket." }, { status: 400 });
  }

  const teamId = membership.team_id ?? null;

  const parsedAmount = parseFloat(amount.toFixed(2));

  // Upload receipt to storage (service role bypasses bucket RLS)
  // receipt_url stocke le CHEMIN storage, jamais une URL publique —
  // le bucket est privé (ADR 0003), l'admin génère des URLs signées.
  let receiptPath: string | null = null;
  if (receiptFile) {
    if (!ALLOWED_TYPES.includes(receiptFile.type as typeof ALLOWED_TYPES[number])) {
      return NextResponse.json({ error: "Format de ticket non supporté." }, { status: 400 });
    }

    // ADR 0036 — la lecture ci-dessus (ou un aperçu) a déjà rangé cette
    // photo : on pointe dessus plutôt que d'en garder deux exemplaires. Le
    // scan est vérifié côté serveur (même membre, même établissement, moins
    // de deux heures) — un jeton forgé retombe simplement sur l'upload normal.
    receiptPath = readingScanId ? await claimScanImage(readingScanId, user.id, restaurantId) : null;
  }

  if (receiptFile && !receiptPath) {
    const adminClient = createAdminClient();
    const fileExt = receiptFile.type.split("/")[1] ?? "jpg";
    const safeName = hasOrderKey
      ? orderNumber.replace(/[^a-zA-Z0-9._-]/g, "-")
      : `nobn-${Date.now()}`;
    const storagePath = `${restaurantId}/${user.id}/${safeName}.${fileExt}`;
    const bytes = await receiptFile.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(storagePath, bytes, { contentType: receiptFile.type, upsert: false });

    if (uploadError && !uploadError.message.includes("already exists")) {
      return NextResponse.json({ error: "Erreur lors de l'upload du ticket." }, { status: 500 });
    }

    receiptPath = storagePath;
  }

  // Compute flag_reasons — uniquement à partir de la lecture OCR serveur
  const flagReasons: string[] = [];
  const todayCount = await countTodayOrders(supabase, user.id, restaurantId);

  // no_order_key remplace no_bestelnummer (ADR 0019) — les deux libellés
  // restent mappés côté admin pour l'historique. Un resto sans clé fiable
  // déclarée passe toujours par la file admin.
  if (!hasOrderKey)       flagReasons.push("no_order_key");
  if (parsedAmount > 200) flagReasons.push("high_amount");
  if (todayCount >= 3)    flagReasons.push("too_many_today");
  // ADR 0058 — plus de `no_receipt` ni `ocr_failed` (photo et lecture sont
  // obligatoires), plus d'`amount_mismatch` : le montant EST la lecture
  // serveur. Ces libellés restent mappés côté admin pour l'historique.
  if (serverOcr) {
    if (serverOcr.confidence < 70) flagReasons.push("low_confidence");
    // `no_restaurant_header` et `looks_like_poster` ne se lèvent plus : ces
    // photos sont refusées plus haut (judgeReceipt, ADR 0058 §4). Les
    // libellés restent mappés côté admin pour l'historique.
  }

  // Dédoublonnage par empreinte de contenu (ADR 0052). Le numéro de commande
  // ne suffit pas : un chiffre mal lu par l'OCR produit une clé différente,
  // donc deux commandes pour un seul ticket (cas prouvé le 2026-09-03 :
  // 02299 relu 02209). On confronte ici l'établissement, le montant, l'heure
  // (±2 min), les lignes d'articles et la photo elle-même. Fail-open de bout
  // en bout : en cas de panne, le verdict est `ok` et l'index UNIQUE sur
  // `duplicate_key` reste le filet historique.
  const guard = await guardAgainstDuplicates({
    restaurantId,
    userId: user.id,
    orderDate,
    orderTime: serverOcr?.order_time ?? null,
    amount: parsedAmount,
    orderNumber: hasOrderKey ? orderNumber : null,
    items: serverOcr?.items ?? [],
    receiptFile,
  });

  if (guard.verdict.decision === "duplicate") {
    await recordDuplicateReview({
      restaurantId,
      userId: user.id,
      orderId: null, // aucune commande n'est créée
      verdict: guard.verdict,
      status: "auto_rejected",
    });
    // Entonnoir (ADR 0037) : le doublon est un motif de refus à part entière.
    await recordFunnelStep(restaurantId, "ticket_rejected", "duplicate");
    // Message unique et sans détail technique : la mécanique anti-fraude ne
    // s'explique pas au membre (ADR 0008 / 0019 / 0052 §6).
    return NextResponse.json({ error: DUPLICATE_MEMBER_MESSAGE }, { status: 409 });
  }

  // Cas ambigu : ni crédité automatiquement, ni rejeté — il rejoint la file de
  // revue, où un admin voit les deux tickets côte à côte (ADR 0052 §5).
  const needsDuplicateReview = guard.verdict.decision === "review";
  if (needsDuplicateReview) flagReasons.push("duplicate_review");

  // Auto-validate only when no flags and amount in normal range
  const autoValidateEnabled = process.env.AUTO_VALIDATE !== "false";
  let status = "pending";

  if (autoValidateEnabled && flagReasons.length === 0 && parsedAmount >= 8) {
    status = "validated";
  }

  const orderRow = {
    user_id: user.id,
    team_id: teamId,
    amount: parsedAmount,
    order_number: hasOrderKey ? orderNumber : null,
    order_date: orderDate,
    order_time: serverOcr?.order_time ?? null,
    receipt_url: receiptPath,
    ocr_amount: serverOcr?.amount ?? null,
    ocr_confidence: serverOcr?.confidence ?? null,
    flag_reasons: flagReasons,
    // duplicate_key scopé par établissement (m32) : l'index UNIQUE est
    // global, deux restos aux numéros séquentiels simples collisionneraient.
    duplicate_key: hasOrderKey
      ? `${restaurantId}:${orderNumber}`
      : `${restaurantId}:NOBN_${user.id}_${Date.now()}`,
    status,
    restaurant_id: restaurantId,
  };

  // Les deux colonnes de l'ADR 0052 arrivent par une migration appliquée à la
  // main (docs/migrations/README.md). Tant qu'elle ne l'est pas, l'insertion
  // les refuserait et bloquerait TOUTES les soumissions : on retente donc sans
  // elles plutôt que d'imposer un ordre de déploiement.
  let insertedOrder: { id: string } | null = null;
  let insertError = null;
  for (const row of [
    { ...orderRow, content_fingerprint: guard.fingerprint, image_phash: guard.imagePhash },
    orderRow,
  ]) {
    const result = await supabase.from("orders").insert(row).select("id").single();
    insertedOrder = result.data as { id: string } | null;
    insertError = result.error;
    // 42703 / PGRST204 = colonne inconnue : c'est le seul cas où le second
    // essai a un sens. Toute autre erreur est définitive.
    if (!insertError || (insertError.code !== "42703" && insertError.code !== "PGRST204")) break;
  }

  if (insertError) {
    if (insertError.code === "23505") {
      // Entonnoir (ADR 0037) : le doublon est un motif de refus à part
      // entière — c'est le seul qui grandit quand l'anti-doublon devient plus
      // strict, et il ne doit pas se confondre avec un ticket illisible.
      await recordFunnelStep(restaurantId, "ticket_rejected", "duplicate");
      return NextResponse.json({ error: DUPLICATE_MEMBER_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur. Réessaie." }, { status: 500 });
  }

  if (needsDuplicateReview && insertedOrder?.id) {
    await recordDuplicateReview({
      restaurantId,
      userId: user.id,
      orderId: insertedOrder.id,
      verdict: guard.verdict,
      status: "pending",
    });
  }

  // Entonnoir (ADR 0037) — deux faits SERVEUR, constatés là où ils se
  // produisent : le serveur a le ticket, et il l'a validé ou mis en file
  // d'arbitrage (ADR 0008). Best-effort, jamais bloquant.
  await recordFunnelStep(restaurantId, "ticket_submitted");
  if (status === "validated") await recordFunnelStep(restaurantId, "ticket_validated");

  // ADR 0036 — le scan sait désormais ce qu'il est devenu : c'est ce lien qui
  // permet de comparer, côté plateforme, la lecture OCR et l'encodage final.
  if (readingScanId && insertedOrder?.id) {
    await linkScanToOrder(readingScanId, user.id, insertedOrder.id);
  }

  // Create 3-layer pending reward for validated orders — awaited pour
  // garantir la création dans la même requête. Un échec est loggé mais
  // ne fait pas échouer la soumission (la commande est déjà validée).
  // ADR 0061 — l'écran de succès annonce les points du ticket, ce qu'ils
  // permettent (catalogue), et le cadeau d'accueil s'il s'agit du premier
  // ticket. Noms + proportion de barre — jamais de seuil ni d'euro (ADR 0007).
  let rewardName: string | null = null;
  let pointsGoal: PointsGoal | null = null;
  // A distinguer de `rewardName` : un cadeau peut déjà être disponible
  // (ADR 0011, créé par une commande précédente) sans que CETTE commande en
  // ait créé un nouveau — l'écran de succès a besoin des deux pour savoir
  // si "Voir mes cadeaux" a un sens (un cadeau existe) et si le titre doit
  // annoncer une nouveauté (rewardName).
  let hasReward = false;
  if (status === "validated" && insertedOrder?.id) {
    // CA programme incrémenté AVANT la récompense : le budget du mois
    // (ADR 0012) inclut ainsi cette commande au moment du calcul
    await incrementProgramRevenue(restaurantId, parsedAmount);
    try {
      const rewardResult = await createPendingReward(
        insertedOrder.id,
        user.id,
        teamId,
        restaurantId,
        parsedAmount
      );
      if (rewardResult.created) rewardName = rewardResult.soloItem;
    } catch (err) {
      console.error("[orders] createPendingReward failed:", err);
    }
    // Les points du ticket viennent d'être crédités par la base (déclencheur
    // on_order_validated_points, en attente 4 h) : l'objectif les inclut.
    try {
      pointsGoal = await getPointsGoal(user.id, restaurantId);
    } catch (err) {
      console.error("[orders] objectif de points indisponible:", err);
    }
    const { data: activeReward } = await supabase
      .from("pending_rewards")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "available")
      .maybeSingle();
    hasReward = !!activeReward;
  }

  // Lignes d'articles lues par l'OCR (ADR 0020) — best effort, après le
  // chemin critique commande + récompense, n'échoue jamais la soumission.
  if (insertedOrder?.id && serverOcr && serverOcr.items.length > 0) {
    await insertOrderItems(insertedOrder.id, restaurantId, serverOcr.items);
  }

  // has_team : l'écran de succès adapte son message (pas de score d'équipe
  // à annoncer sans équipe) et propose d'en rejoindre une — ADR 0034.
  return NextResponse.json(
    {
      success: true,
      status,
      has_team: teamId !== null,
      reward: rewardName,
      has_reward: hasReward,
      // ADR 0058 §4 / 0061 — les points de l'écran de succès viennent de
      // CETTE lecture (points personnels, 10 par euro) ; la mesure reçoit une
      // tranche, jamais le montant.
      points: personalPointsForOrder(parsedAmount),
      points_goal: pointsGoal,
      amount_band: amountBand(parsedAmount),
    },
    { status: 201 }
  );
}

// GET supprimé (audit 2026-07-23) : aucun appelant — les pages membres sont
// des Server Components qui lisent directement — et le select("*") exposait
// les internes anti-fraude (flag_reasons, ocr_confidence, duplicate_key).
