import { NextResponse } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? user : null;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_rewards")
    .select(`
      *,
      profiles:user_id (display_name, email),
      orders:order_id (amount, order_date)
    `)
    .eq("restaurant_id", getRestaurantId())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_rewards")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", getRestaurantId())
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
