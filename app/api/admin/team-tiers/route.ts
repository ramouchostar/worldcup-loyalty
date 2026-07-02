import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

type TierInput = {
  threshold_spent: unknown;
  reward_kind: unknown;
  percent_value: unknown;
  menu_item_id: unknown;
};

// GET /api/admin/team-tiers?restaurantId=... — paliers d'équipe (ADR 0014).
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_tiers")
    .select("id, threshold_spent, reward_kind, percent_value, menu_item_id, is_active")
    .eq("restaurant_id", restaurantId)
    .order("threshold_spent");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PUT /api/admin/team-tiers — remplace l'ensemble des paliers.
// Body : { restaurantId, tiers: { threshold_spent, reward_kind, percent_value, menu_item_id }[] }.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const raw: TierInput[] = Array.isArray(body?.tiers) ? body.tiers : [];
  const admin = createAdminClient();

  const { data: items } = await admin.from("menu_items").select("id").eq("restaurant_id", restaurantId);
  const validIds = new Set((items ?? []).map((r: { id: string }) => r.id));

  const seen = new Set<number>();
  const errors: string[] = [];
  const rows = [] as {
    restaurant_id: string;
    threshold_spent: number;
    reward_kind: "percent" | "free_item";
    percent_value: number | null;
    menu_item_id: string | null;
    is_active: boolean;
  }[];

  for (const t of raw) {
    const threshold = Number(t.threshold_spent);
    if (!Number.isFinite(threshold) || threshold <= 0) { errors.push("Seuil invalide — ignoré."); continue; }
    if (seen.has(threshold)) { errors.push(`Seuil ${threshold} en double — ignoré.`); continue; }

    if (t.reward_kind === "percent") {
      const pv = Number(t.percent_value);
      if (!Number.isFinite(pv) || pv <= 0 || pv > 100) { errors.push(`Pourcentage invalide (seuil ${threshold}) — ignoré.`); continue; }
      seen.add(threshold);
      rows.push({ restaurant_id: restaurantId, threshold_spent: threshold, reward_kind: "percent", percent_value: pv, menu_item_id: null, is_active: true });
    } else if (t.reward_kind === "free_item") {
      const mid = typeof t.menu_item_id === "string" && validIds.has(t.menu_item_id) ? t.menu_item_id : null;
      if (!mid) { errors.push(`Article manquant ou invalide (seuil ${threshold}) — ignoré.`); continue; }
      seen.add(threshold);
      rows.push({ restaurant_id: restaurantId, threshold_spent: threshold, reward_kind: "free_item", percent_value: null, menu_item_id: mid, is_active: true });
    } else {
      errors.push(`Type de récompense invalide (seuil ${threshold}) — ignoré.`);
    }
  }

  // Remplace l'ensemble : on vide puis on réinsère
  const { error: delErr } = await admin.from("team_tiers").delete().eq("restaurant_id", restaurantId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (rows.length > 0) {
    const { error: insErr } = await admin.from("team_tiers").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.length, warnings: errors });
}
