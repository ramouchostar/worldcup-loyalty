import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_rewards")
    .select(`
      *,
      profiles:user_id (display_name, email),
      orders:order_id (amount, order_date)
    `)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
  const { id, restaurantId } = await req.json();
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_rewards")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
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
