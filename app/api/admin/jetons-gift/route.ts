import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getJetonsGift, suggestJetonsGift } from "@/lib/jetons-gift";

// ADR 0017 §2 — Cadeau des 4 jetons : lecture (cadeau courant + suggestion +
// plafond) et configuration. Surface admin uniquement (données euros).

// GET /api/admin/jetons-gift?restaurantId=...
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const [current, { suggestion, costCap, avgBasket }] = await Promise.all([
    getJetonsGift(restaurantId),
    suggestJetonsGift(restaurantId),
  ]);

  return NextResponse.json({ current, suggestion, costCap, avgBasket });
}

// PUT /api/admin/jetons-gift — Body : { restaurantId, menu_item_id }.
// Plafond dur (ADR 0017) : coût réel ≤ panier moyen × BUDGET_PCT — un jeton
// n'a aucune recette en face, le cadeau doit rester léger pour l'établissement.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  const menuItemId = body?.menu_item_id;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }
  if (typeof menuItemId !== "string" || !menuItemId) {
    return NextResponse.json({ error: "menu_item_id requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("menu_items")
    .select("id, name, cost_price, is_active, reward_eligible")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!item || !item.is_active || !item.reward_eligible) {
    return NextResponse.json({ error: "Article introuvable ou non éligible aux cadeaux." }, { status: 400 });
  }

  const { costCap } = await suggestJetonsGift(restaurantId);
  if (Number(item.cost_price) > costCap) {
    return NextResponse.json(
      {
        error:
          `« ${item.name} » coûte €${Number(item.cost_price).toFixed(2)}, au-dessus du plafond de ` +
          `€${costCap.toFixed(2)} pour un cadeau sans commande en face. Choisis un article moins cher.`,
      },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("restaurants")
    .update({ jetons_gift_menu_item_id: menuItemId })
    .eq("id", restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
