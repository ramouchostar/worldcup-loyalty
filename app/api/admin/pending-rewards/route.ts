import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

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

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await req.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_rewards")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", getRestaurantId())
    .eq("status", "available")  // idempotency — ne peut être marqué qu'une seule fois
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Récompense déjà récupérée ou introuvable." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
