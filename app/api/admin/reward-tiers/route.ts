import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

type TierInput = { layer: unknown; min_threshold: unknown; menu_item_id: unknown };

// GET /api/admin/reward-tiers — paliers configurés de l'établissement.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reward_tiers")
    .select("id, layer, min_threshold, menu_item_id, is_active")
    .eq("restaurant_id", getRestaurantId())
    .order("layer")
    .order("min_threshold");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PUT /api/admin/reward-tiers — enregistre les assignations palier → article.
// Body : { tiers: { layer, min_threshold, menu_item_id|null }[] }.
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const tiers: TierInput[] = Array.isArray(body?.tiers) ? body.tiers : [];
  if (tiers.length === 0) {
    return NextResponse.json({ error: "Aucun palier fourni." }, { status: 400 });
  }

  const restaurantId = getRestaurantId();
  const admin = createAdminClient();

  // Articles valides de l'établissement (anti-assignation croisée)
  const { data: validItems } = await admin
    .from("menu_items")
    .select("id")
    .eq("restaurant_id", restaurantId);
  const validIds = new Set((validItems ?? []).map((r: { id: string }) => r.id));

  const rows = tiers
    .filter((t) => (t.layer === "solo" || t.layer === "community") && typeof t.min_threshold === "number")
    .map((t) => ({
      restaurant_id: restaurantId,
      layer: t.layer as string,
      min_threshold: t.min_threshold as number,
      menu_item_id:
        typeof t.menu_item_id === "string" && validIds.has(t.menu_item_id) ? t.menu_item_id : null,
      is_active: true,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Paliers invalides." }, { status: 400 });
  }

  const { error } = await admin
    .from("reward_tiers")
    .upsert(rows, { onConflict: "restaurant_id,layer,min_threshold" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}
