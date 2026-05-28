import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const restaurantId = getRestaurantId();

  const { data, error } = await admin
    .from("referral_submissions")
    .select(`
      id,
      referral_email,
      status,
      submitted_at,
      user_id,
      profiles!referral_submissions_user_id_fkey (display_name, email)
    `)
    .eq("restaurant_id", restaurantId)
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, action } = body;

  if (!id || !["validate", "reject"].includes(action)) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("referral_submissions")
    .update({ status: action === "validate" ? "validated" : "rejected" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  return NextResponse.json({ success: true });
}
