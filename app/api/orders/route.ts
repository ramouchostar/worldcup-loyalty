import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { validateOrderNumber, validateOrderDate, validateAmount } from "@/lib/orders";
import { getRestaurantId } from "@/lib/restaurant";
import { createPendingReward } from "@/lib/rewards";
import { analyzeReceipt, type ReceiptAnalysis } from "@/lib/receipt-ocr";

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

  if (isMultipart) {
    const formData = await request.formData();
    const rawOrderNumber = formData.get("order_number");
    const rawAmount = formData.get("amount");
    receiptFile = formData.get("receipt") as File | null;

    if (!rawOrderNumber || rawAmount === null || !receiptFile) {
      return NextResponse.json({ error: "Champs manquants (order_number, amount, receipt)." }, { status: 400 });
    }

    orderNumber = String(rawOrderNumber).trim();
    amount = parseFloat(String(rawAmount));

    // Les champs OCR du formData (ocr_amount, ocr_confidence,
    // no_restaurant_header) ne sont volontairement PAS lus : le serveur
    // ré-analyse le ticket lui-même plus bas. Aucune donnée client ne
    // doit influencer l'auto-validation.
  } else {
    // Legacy JSON path (backward compat for admin tools)
    const body = await request.json();
    if (!body.order_number || body.amount === undefined) {
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
    }
    orderNumber = String(body.order_number).trim();
    amount = parseFloat(String(body.amount));
  }

  const hasBestelnummer = orderNumber.trim().length > 0;

  if (hasBestelnummer) {
    const orderNumberError = validateOrderNumber(orderNumber);
    if (orderNumberError) return NextResponse.json({ error: orderNumberError }, { status: 400 });
  }

  const amountError = validateAmount(amount);
  if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });

  const orderDate = hasBestelnummer
    ? orderNumber.split("/")[0]
    : new Date().toISOString().split("T")[0];

  if (hasBestelnummer) {
    const dateError = validateOrderDate(orderDate);
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (!profile?.team_id) {
    return NextResponse.json({ error: "Tu dois choisir une équipe avant de soumettre une commande." }, { status: 400 });
  }

  const restaurantId = getRestaurantId();
  const parsedAmount = parseFloat(amount.toFixed(2));

  // OCR serveur — seule source de vérité pour le flagging anti-fraude
  let serverOcr: ReceiptAnalysis | null = null;
  let ocrFailed = false;
  if (receiptFile) {
    try {
      serverOcr = await analyzeReceipt(receiptFile);
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
    const safeName = hasBestelnummer
      ? orderNumber.replace(/\//g, "-")
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

  if (!hasBestelnummer)   flagReasons.push("no_bestelnummer");
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
      team_id: profile.team_id,
      amount: parsedAmount,
      order_number: hasBestelnummer ? orderNumber : null,
      order_date: orderDate,
      order_time: null,
      receipt_url: receiptPath,
      ocr_amount: serverOcr?.amount ?? null,
      ocr_confidence: serverOcr?.confidence ?? null,
      flag_reasons: flagReasons,
      duplicate_key: hasBestelnummer ? orderNumber : `NOBN_${user.id}_${Date.now()}`,
      status,
      restaurant_id: restaurantId,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Cette commande a déjà été soumise (Bestelnummer en double)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur. Réessaie." }, { status: 500 });
  }

  // Create 3-layer pending reward for validated orders
  if (status === "validated" && insertedOrder?.id) {
    // Fire-and-forget — reward creation failure doesn't fail the order submission
    createPendingReward(
      insertedOrder.id,
      user.id,
      profile.team_id,
      restaurantId,
      parsedAmount
    ).catch(() => { /* logged silently */ });
  }

  return NextResponse.json({ success: true, status }, { status: 201 });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data);
}
