import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { soloCostCap } from "@/lib/reward-sizing";
import { getRestaurantBudgetPct } from "@/lib/budget";
import { suggestJetonsGift } from "@/lib/jetons-gift";

// ADR 0013 — correction d'un article en un geste depuis l'écran Menu & coûts :
// prix de vente et prix de revient, sans re-téléverser tout le CSV. Même garde
// que l'import (requireAdmin) et l'article doit appartenir à l'établissement
// (ADR 0015 §7).
//
// Le prix de revient pilote les plafonds de l'ADR 0017 : un coût relevé ne doit
// pas faire passer en douce un cadeau au-dessus du plafond que l'écran des
// paliers refuse en dur. Même règle ici, même message.
//
// PATCH /api/admin/menu/item — { restaurantId, menuItemId, menuPrice, costPrice }

const MAX_EUR = 1000;

function readAmount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_EUR) return null;
  return Math.round(v * 100) / 100;
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const menuItemId = typeof body?.menuItemId === "string" ? body.menuItemId : "";
  const menuPrice = readAmount(body?.menuPrice);
  const costPrice = readAmount(body?.costPrice);
  if (!restaurantId || !menuItemId) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (menuPrice === null || costPrice === null) {
    return NextResponse.json(
      { error: `Prix invalide : un montant entre 0 et ${MAX_EUR} €, ex. 9,50.` },
      { status: 400 }
    );
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("menu_items")
    .select("id, name, menu_price, cost_price")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });

  // Plafonds ADR 0017 — seulement si le coût monte : le baisser ne peut
  // jamais faire dépasser un plafond.
  const before = item as { id: string; name: string; menu_price: number; cost_price: number | null };
  if (costPrice > Number(before.cost_price ?? 0)) {
    const [pct, { data: tiers }, { data: resto }] = await Promise.all([
      getRestaurantBudgetPct(restaurantId),
      admin
        .from("reward_tiers")
        .select("min_threshold")
        .eq("restaurant_id", restaurantId)
        .eq("layer", "solo")
        .eq("is_active", true)
        .eq("menu_item_id", menuItemId),
      admin.from("restaurants").select("jetons_gift_menu_item_id").eq("id", restaurantId).maybeSingle(),
    ]);
    const violations = (tiers ?? [])
      .map((t: { min_threshold: number }) => Number(t.min_threshold))
      .filter((threshold) => costPrice > soloCostCap(threshold, pct))
      .map(
        (threshold) =>
          `Palier €${threshold} : « ${before.name} » coûterait €${costPrice.toFixed(2)}, ` +
          `au-dessus du plafond de €${soloCostCap(threshold, pct).toFixed(2)} ` +
          `(${Math.round(pct * 100)} % de la commande). Change d'abord le cadeau de ce palier.`
      );
    if ((resto as { jetons_gift_menu_item_id: string | null } | null)?.jetons_gift_menu_item_id === menuItemId) {
      const { costCap } = await suggestJetonsGift(restaurantId);
      if (costPrice > costCap) {
        violations.push(
          `Cadeau des 4 jetons : « ${before.name} » coûterait €${costPrice.toFixed(2)}, ` +
          `au-dessus du plafond de €${costCap.toFixed(2)}. Change d'abord le cadeau des jetons.`
        );
      }
    }
    if (violations.length > 0) {
      return NextResponse.json(
        { error: "Ce coût dépasse le plafond d'un cadeau qui l'utilise.", details: violations },
        { status: 400 }
      );
    }
  }

  const { data, error } = await admin
    .from("menu_items")
    .update({ menu_price: menuPrice, cost_price: costPrice })
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .select("id, menu_price, cost_price")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });

  // Trace : pas de journal d'édition en base, l'avant/après part dans les logs
  // Vercel pour pouvoir dire qui a changé quoi et quand.
  console.info(
    `[menu-item-edit] restaurant=${restaurantId} item=${menuItemId} user=${guard.userId} ` +
    `prix ${before.menu_price}→${menuPrice} coût ${before.cost_price ?? "null"}→${costPrice}`
  );
  return NextResponse.json(data);
}
