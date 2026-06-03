import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json();
  const { endpoint, keys } = body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  }

  const admin = createAdminClient();
  const restaurantId = getRestaurantId();

  await admin.from("push_subscriptions").upsert(
    { user_id: user.id, restaurant_id: restaurantId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "user_id, endpoint" }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { endpoint } = await request.json();
  if (!endpoint) return NextResponse.json({ error: "Endpoint manquant." }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
