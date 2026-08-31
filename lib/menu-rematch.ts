import { createAdminClient } from "./supabase";
import { getMenuAliases } from "./menu-aliases";
import { buildTicketMatcher } from "./menu-match";

// ADR 0046, lot 2 — rétro-rattachement : le matching historique ne tournait
// qu'à l'insertion, donc un catalogue créé/corrigé APRÈS coup laissait les
// lignes orphelines pour toujours (kraainem : 83 %). À chaque modification du
// catalogue ou des alias, on redonne leur chance aux lignes jamais rattachées.
//
// Best-effort strict : ne throw JAMAIS, ne bloque jamais l'action d'origine
// (import de menu, formulaire) ; on ne retouche jamais une ligne déjà
// rattachée ou déjà ignorée.
export async function rematchOrderItems(
  restaurantId: string
): Promise<{ examined: number; matched: number; ignored: number }> {
  const out = { examined: 0, matched: 0, ignored: 0 };
  try {
    const admin = createAdminClient();
    const [{ data: menu }, aliases] = await Promise.all([
      admin.from("menu_items").select("id, name").eq("restaurant_id", restaurantId),
      getMenuAliases(restaurantId),
    ]);
    const match = buildTicketMatcher((menu ?? []) as { id: string; name: string }[], aliases);

    const { data: orders } = await admin
      .from("orders")
      .select("id")
      .eq("restaurant_id", restaurantId);
    const orderIds = ((orders ?? []) as { id: string }[]).map((o) => o.id);

    type Row = { id: string; raw_name: string; is_ignored?: boolean | null };
    for (let i = 0; i < orderIds.length; i += 150) {
      const slice = orderIds.slice(i, i + 150);
      let rows: Row[] = [];
      const withFlag = await admin
        .from("order_items")
        .select("id, raw_name, is_ignored")
        .in("order_id", slice)
        .is("menu_item_id", null);
      if (withFlag.error) {
        // colonne is_ignored absente (migration pas appliquée) → variante minimale
        const bare = await admin
          .from("order_items")
          .select("id, raw_name")
          .in("order_id", slice)
          .is("menu_item_id", null);
        rows = (bare.data ?? []) as Row[];
      } else {
        rows = (withFlag.data ?? []) as Row[];
      }

      const toMatch = new Map<string, string[]>(); // menu_item_id → ids de lignes
      const toIgnore: string[] = [];
      for (const r of rows) {
        if (r.is_ignored) continue;
        out.examined++;
        const m = match(r.raw_name);
        if (m.menuItemId) {
          (toMatch.get(m.menuItemId) ?? toMatch.set(m.menuItemId, []).get(m.menuItemId))!.push(r.id);
        } else if (m.ignored) {
          toIgnore.push(r.id);
        }
      }

      for (const [menuItemId, ids] of toMatch) {
        const { error } = await admin.from("order_items").update({ menu_item_id: menuItemId }).in("id", ids);
        if (!error) out.matched += ids.length;
      }
      if (toIgnore.length > 0) {
        const { error } = await admin.from("order_items").update({ is_ignored: true }).in("id", toIgnore);
        if (!error) out.ignored += toIgnore.length;
      }
    }
  } catch (err) {
    console.error("[menu-rematch] rétro-rattachement best-effort échoué:", err);
  }
  return out;
}
