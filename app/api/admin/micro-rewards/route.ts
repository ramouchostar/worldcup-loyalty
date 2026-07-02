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
    .from("micro_reward_claims")
    .select(`
      id,
      reward_type,
      proof_url,
      status,
      claimed_at,
      user_id,
      profiles!micro_reward_claims_user_id_fkey (display_name, email)
    `)
    .eq("restaurant_id", restaurantId)
    .order("claimed_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, action, restaurantId } = body;

  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  if (!id || !["validate", "reject"].includes(action)) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("micro_reward_claims")
    .update({ status: action === "validate" ? "validated" : "rejected" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  return NextResponse.json({ success: true });
}
