import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { soloCostCap, DEFAULT_BUDGET_PCT } from "@/lib/reward-sizing";

const BUDGET_PCT = parseFloat(process.env.REWARD_BUDGET_PCT ?? String(DEFAULT_BUDGET_PCT));

type TierInput = { layer: unknown; min_threshold: unknown; menu_item_id: unknown };

// GET /api/admin/reward-tiers?restaurantId=... — paliers configurés de l'établissement.
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reward_tiers")
    .select("id, layer, min_threshold, menu_item_id, is_active")
    .eq("restaurant_id", restaurantId)
    .order("layer")
    .order("min_threshold");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PUT /api/admin/reward-tiers — enregistre les assignations palier → article.
// Body : { restaurantId, tiers: { layer, min_threshold, menu_item_id|null }[] }.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const tiers: TierInput[] = Array.isArray(body?.tiers) ? body.tiers : [];
  if (tiers.length === 0) {
    return NextResponse.json({ error: "Aucun palier fourni." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Articles valides de l'établissement (anti-assignation croisée) + coûts
  // pour le plafond de palier (ADR 0017)
  const { data: validItems } = await admin
    .from("menu_items")
    .select("id, name, cost_price")
    .eq("restaurant_id", restaurantId);
  const itemById = new Map(
    (validItems ?? []).map((r: { id: string; name: string; cost_price: number }) => [r.id, r])
  );

  const rows = tiers
    .filter((t) => (t.layer === "solo" || t.layer === "community") && typeof t.min_threshold === "number")
    .map((t) => ({
      restaurant_id: restaurantId,
      layer: t.layer as string,
      min_threshold: t.min_threshold as number,
      menu_item_id:
        typeof t.menu_item_id === "string" && itemById.has(t.menu_item_id) ? t.menu_item_id : null,
      is_active: true,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Paliers invalides." }, { status: 400 });
  }

  // Plafond de palier solo (ADR 0017) : le coût réel du cadeau ne doit pas
  // dépasser BUDGET_PCT du montant de commande qui le déclenche. Rejet dur —
  // c'est la protection de rentabilité de l'établissement, pas un avertissement.
  const violations = rows
    .filter((r) => r.layer === "solo" && r.menu_item_id)
    .map((r) => ({ row: r, item: itemById.get(r.menu_item_id!)! }))
    .filter(({ row, item }) => Number(item.cost_price) > soloCostCap(row.min_threshold, BUDGET_PCT))
    .map(
      ({ row, item }) =>
        `Palier €${row.min_threshold} : « ${item.name} » coûte €${Number(item.cost_price).toFixed(2)}, ` +
        `au-dessus du plafond de €${soloCostCap(row.min_threshold, BUDGET_PCT).toFixed(2)} ` +
        `(${Math.round(BUDGET_PCT * 100)} % de la commande). Choisis un article moins cher ou un palier plus haut.`
    );

  if (violations.length > 0) {
    return NextResponse.json(
      { error: "Certains paliers dépassent le plafond de coût.", details: violations },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("reward_tiers")
    .upsert(rows, { onConflict: "restaurant_id,layer,min_threshold" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Les paliers absents du payload (ex. bandes recalculées après un nouvel
  // upload de catalogue, ADR 0017) sont désactivés, pas supprimés.
  const sentKeys = new Set(rows.map((r) => `${r.layer}:${r.min_threshold}`));
  const { data: existing } = await admin
    .from("reward_tiers")
    .select("id, layer, min_threshold")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  const stale = (existing ?? [])
    .filter((r: { layer: string; min_threshold: number }) => !sentKeys.has(`${r.layer}:${Number(r.min_threshold)}`))
    .map((r: { id: string }) => r.id);
  if (stale.length > 0) {
    await admin.from("reward_tiers").update({ is_active: false }).in("id", stale);
  }

  return NextResponse.json({ ok: true, saved: rows.length });
}
