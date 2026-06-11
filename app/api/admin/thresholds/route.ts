import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getBudgetStatus } from "@/lib/budget";
import { getRestaurantId } from "@/lib/restaurant";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const [{ data, error }, budget] = await Promise.all([
    admin
      .from("restaurant_thresholds")
      .select("*")
      .order("created_at", { ascending: false }),
    getBudgetStatus(getRestaurantId()),
  ]);

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  // Budget en euros : route admin uniquement (ADR 0007)
  return NextResponse.json({ thresholds: data ?? [], budget });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, current_revenue, is_unlocked, period_label, target_revenue } = body;

  if (!id) return NextResponse.json({ error: "ID seuil manquant." }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (current_revenue !== undefined) update.current_revenue = Number(current_revenue);
  if (typeof is_unlocked === "boolean") {
    update.is_unlocked = is_unlocked;
    update.unlocked_at = is_unlocked ? new Date().toISOString() : null;
  }
  if (period_label) update.period_label = period_label;
  if (target_revenue !== undefined) update.target_revenue = Number(target_revenue);
  if (body.baseline_weekly_revenue !== undefined) {
    update.baseline_weekly_revenue = body.baseline_weekly_revenue === null
      ? null
      : Number(body.baseline_weekly_revenue);
  }
  if (body.growth_target_pct !== undefined) update.growth_target_pct = Number(body.growth_target_pct);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("restaurant_thresholds").update(update).eq("id", id);

  if (error) return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { period_label, target_revenue } = body;

  if (!period_label?.trim() || !target_revenue || Number(target_revenue) <= 0) {
    return NextResponse.json({ error: "Label et objectif CA requis." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("restaurant_thresholds").insert({
    period_label: period_label.trim(),
    target_revenue: Number(target_revenue),
  });

  if (error) return NextResponse.json({ error: "Erreur lors de la création." }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}
