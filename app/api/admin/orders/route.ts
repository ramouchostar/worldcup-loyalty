import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("orders")
    .select(`
      id,
      amount,
      order_date,
      order_time,
      duplicate_key,
      status,
      rejection_reason,
      submitted_at,
      validated_at,
      user_id,
      team_id,
      profiles!orders_user_id_fkey (display_name, email),
      teams!orders_team_id_fkey (name, flag_emoji)
    `)
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, action, rejection_reason } = body;

  if (!id || !["validate", "reject"].includes(action)) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }
  if (action === "reject" && !rejection_reason?.trim()) {
    return NextResponse.json({ error: "Motif de rejet requis." }, { status: 400 });
  }

  const admin = createAdminClient();

  const update =
    action === "validate"
      ? { status: "validated", validated_at: new Date().toISOString(), rejection_reason: null }
      : { status: "rejected", rejection_reason: rejection_reason.trim() };

  const { error } = await admin.from("orders").update(update).eq("id", id);

  if (error) return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  return NextResponse.json({ success: true });
}
