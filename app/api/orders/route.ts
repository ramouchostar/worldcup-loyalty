import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { validateOrderDate, validateAmount } from "@/lib/orders";
import { getReceiptConfig, validateOrderKey, extractDateFromKey } from "@/lib/receipt-config";
import { createPendingReward, LEGACY_RESTAURANT_ID } from "@/lib/rewards";
import { incrementProgramRevenue } from "@/lib/budget";
import { analyzeReceipt, type ReceiptAnalysis } from "@/lib/receipt-ocr";
import { insertOrderItems } from "@/lib/order-items";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export const maxDuration = 30;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

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

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let orderNumber: string;
  let amount: number;
  let receiptFile: File | null = null;
  let restaurantId: string;

  if (isMultipart) {
    const formData = await request.formData();
    const rawOrderNumber = formData.get("order_number");
    const rawAmount = formData.get("amount");
    const rawRestaurantId = formData.get("restaurantId");
    receiptFile = formData.get("receipt") as File | null;

    // order_number vide autorisé : c'est le chemin « pas de numéro lisible »
    // (clé synthétique + file admin, ADR 0019) — seule son absence totale
    // du formulaire est une erreur.
    if (rawOrderNumber === null || rawAmount === null || !receiptFile || !rawRestaurantId) {
      return NextResponse.json({ error: "Champs manquants (order_number, amount, receipt, restaurantId)." }, { status: 400 });
    }

    orderNumber = String(rawOrderNumber).trim();
    amount = parseFloat(String(rawAmount));
    restaurantId = String(rawRestaurantId);

    // Les champs OCR du formData (ocr_amount, ocr_confidence,
    // no_restaurant_header) ne sont volontairement PAS lus : le serveur
    // ré-analyse le ticket lui-même plus bas. Aucune donnée client ne
    // doit influencer l'auto-validation.
  } else {
    // Legacy JSON path (backward compat for admin tools)
    const body = await request.json().catch(() => null);
    if (!body || !body.order_number || body.amount === undefined || !body.restaurantId) {
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
    }
    orderNumber = String(body.order_number).trim();
    amount = parseFloat(String(body.amount));
    restaurantId = String(body.restaurantId);
  }

  // ADR 0019 — la clé de commande est définie par l'établissement
  // (restaurant_receipt_config, fallback Bestelnummer legacy).
  const receiptConfig = await getReceiptConfig(restaurantId);
  const hasOrderKey = receiptConfig.has_reliable_key && orderNumber.trim().length > 0;

  if (hasOrderKey) {
    const orderKeyError = validateOrderKey(orderNumber, receiptConfig);
    if (orderKeyError) return NextResponse.json({ error: orderKeyError }, { status: 400 });
    orderNumber = orderNumber.trim();
  }

  const amountError = validateAmount(amount);
  if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });

  // Date dérivée de la clé quand le format l'encapsule (date_group),
  // sinon date du jour.
  const keyDate = hasOrderKey ? extractDateFromKey(orderNumber, receiptConfig) : null;
  const orderDate = keyDate ?? new Date().toISOString().split("T")[0];

  if (keyDate) {
    const dateError = validateOrderDate(orderDate);
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

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

  if (!membership?.team_id) {
    return NextResponse.json({ error: "Tu dois choisir une équipe avant de soumettre une commande." }, { status: 400 });
  }

  const parsedAmount = parseFloat(amount.toFixed(2));

  // OCR serveur — seule source de vérité pour le flagging anti-fraude
  let serverOcr: ReceiptAnalysis | null = null;
  let ocrFailed = false;
  if (receiptFile) {
    try {
      serverOcr = await analyzeReceipt(receiptFile, await getRestaurantDisplayName(restaurantId), receiptConfig);
    } catch {
      ocrFailed = true;
    }
  }

  // Upload receipt to storage (service role bypasses bucket RLS)
  // receipt_url stocke le CHEMIN storage, jamais une URL publique —
  // le bucket est privé (ADR 0003), l'admin génère des URLs signées.
  let receiptPath: string | null = null;
  if (receiptFile) {
    if (!ALLOWED_TYPES.includes(receiptFile.type as typeof ALLOWED_TYPES[number])) {
      return NextResponse.json({ error: "Format de ticket non supporté." }, { status: 400 });
    }

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
  if (!receiptFile)       flagReasons.push("no_receipt");
  if (ocrFailed)          flagReasons.push("ocr_failed");
  if (serverOcr) {
    if (serverOcr.confidence < 70) flagReasons.push("low_confidence");
    if (serverOcr.amount !== null && parsedAmount > 0) {
      const mismatch = Math.abs(serverOcr.amount - parsedAmount) / parsedAmount;
      if (mismatch > 0.05) flagReasons.push("amount_mismatch");
    }
    if (!serverOcr.has_restaurant_header) flagReasons.push("no_restaurant_header");
  }

  // Auto-validate only when no flags and amount in normal range
  const autoValidateEnabled = process.env.AUTO_VALIDATE !== "false";
  let status = "pending";

  if (autoValidateEnabled && flagReasons.length === 0 && parsedAmount >= 8) {
    status = "validated";
  }

  const { data: insertedOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      team_id: membership.team_id,
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
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Cette commande a déjà été soumise (numéro de ticket en double)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur. Réessaie." }, { status: 500 });
  }

  // Create 3-layer pending reward for validated orders — awaited pour
  // garantir la création dans la même requête. Un échec est loggé mais
  // ne fait pas échouer la soumission (la commande est déjà validée).
  if (status === "validated" && insertedOrder?.id) {
    // CA programme incrémenté AVANT la récompense : le budget du mois
    // (ADR 0012) inclut ainsi cette commande au moment du calcul
    await incrementProgramRevenue(restaurantId, parsedAmount);
    try {
      await createPendingReward(
        insertedOrder.id,
        user.id,
        membership.team_id,
        restaurantId,
        parsedAmount
      );
    } catch (err) {
      console.error("[orders] createPendingReward failed:", err);
    }
  }

  // Lignes d'articles lues par l'OCR (ADR 0020) — best effort, après le
  // chemin critique commande + récompense, n'échoue jamais la soumission.
  if (insertedOrder?.id && serverOcr && serverOcr.items.length > 0) {
    await insertOrderItems(insertedOrder.id, restaurantId, serverOcr.items);
  }

  return NextResponse.json({ success: true, status }, { status: 201 });
}

// GET supprimé (audit 2026-07-23) : aucun appelant — les pages membres sont
// des Server Components qui lisent directement — et le select("*") exposait
// les internes anti-fraude (flag_reasons, ocr_confidence, duplicate_key).
