import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { validateOrderNumber, validateOrderDate, validateAmount } from "@/lib/orders";
import { getRestaurantId } from "@/lib/restaurant";
import { getSoloReward, getCommunityBonus, getAdvancementBonus } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";

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

type TeamScoreRow = {
  score: number;
  teams: { round_reached: string; is_active: boolean } | null;
};

async function createPendingReward(
  orderId: string,
  userId: string,
  teamId: string,
  restaurantId: string,
  amount: number
) {
  const adminClient = createAdminClient();

  const [{ data: scoreData }, restaurantUnlocked] = await Promise.all([
    adminClient
      .from("community_scores")
      .select("score, teams(round_reached, is_active)")
      .eq("team_id", teamId)
      .eq("restaurant_id", restaurantId)
      .single(),
    isRestaurantThresholdUnlocked(),
  ]);

  const row = scoreData as unknown as TeamScoreRow | null;
  const teamScore = row?.score ?? 0;
  const roundReached = row?.teams?.round_reached ?? "group_stage";
  const isEliminated = !(row?.teams?.is_active ?? true);

  const solo = getSoloReward(amount);
  const community = getCommunityBonus(teamScore, restaurantUnlocked);
  const advancement = getAdvancementBonus(roundReached, isEliminated);

  if (!solo.item && !community.item && !advancement.item) return;

  await adminClient.from("pending_rewards").insert({
    user_id: userId,
    restaurant_id: restaurantId,
    order_id: orderId,
    solo_item: solo.item,
    solo_cost: solo.cost > 0 ? solo.cost : null,
    community_item: community.item,
    community_cost: community.cost > 0 ? community.cost : null,
    advancement_item: advancement.item,
    advancement_cost: advancement.cost > 0 ? advancement.cost : null,
    status: "pending",
  });
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
  } else {
    // Legacy JSON path (backward compat for admin tools)
    const body = await request.json();
    if (!body.order_number || body.amount === undefined) {
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
    }
    orderNumber = String(body.order_number).trim();
    amount = parseFloat(String(body.amount));
  }

  const orderNumberError = validateOrderNumber(orderNumber);
  if (orderNumberError) return NextResponse.json({ error: orderNumberError }, { status: 400 });

  const amountError = validateAmount(amount);
  if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });

  const orderDate = orderNumber.split("/")[0];
  const dateError = validateOrderDate(orderDate);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

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

  // Upload receipt to storage (service role bypasses bucket RLS)
  let receiptUrl: string | null = null;
  if (receiptFile) {
    if (!ALLOWED_TYPES.includes(receiptFile.type as typeof ALLOWED_TYPES[number])) {
      return NextResponse.json({ error: "Format de ticket non supporté." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const fileExt = receiptFile.type.split("/")[1] ?? "jpg";
    const safeName = orderNumber.replace(/\//g, "-");
    const storagePath = `${restaurantId}/${user.id}/${safeName}.${fileExt}`;
    const bytes = await receiptFile.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(storagePath, bytes, { contentType: receiptFile.type, upsert: false });

    if (uploadError && !uploadError.message.includes("already exists")) {
      return NextResponse.json({ error: "Erreur lors de l'upload du ticket." }, { status: 500 });
    }

    const { data: { publicUrl } } = adminClient.storage.from("receipts").getPublicUrl(storagePath);
    receiptUrl = publicUrl;
  }

  // Determine auto-validate vs pending
  const autoValidateEnabled = process.env.AUTO_VALIDATE !== "false";
  let status = "pending";

  if (autoValidateEnabled && parsedAmount >= 8 && parsedAmount <= 200) {
    const todayCount = await countTodayOrders(supabase, user.id, restaurantId);
    if (todayCount < 3) {
      status = "validated";
    }
  }

  const { data: insertedOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      team_id: profile.team_id,
      amount: parsedAmount,
      order_number: orderNumber,
      order_date: orderDate,
      order_time: null,
      receipt_url: receiptUrl,
      duplicate_key: orderNumber,
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
