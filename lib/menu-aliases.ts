import { createAdminClient } from "./supabase";
import { normalizeItemName, type TicketAlias } from "./menu-match";

// ADR 0046 — alias de rapprochement par resto. Fail-open partout : la
// migration 20260831-2335 pas encore appliquée ne doit rien casser
// (aucun alias = comportement historique).

export async function getMenuAliases(restaurantId: string): Promise<TicketAlias[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("menu_item_aliases")
      .select("alias, menu_item_id")
      .eq("restaurant_id", restaurantId);
    if (error) return [];
    return (data ?? []) as TicketAlias[];
  } catch {
    return [];
  }
}

/**
 * Pose un alias durable : libellé de ticket → article du catalogue, ou
 * `null` = « à ignorer ». L'alias est stocké NORMALISÉ.
 */
export async function upsertMenuAlias(
  restaurantId: string,
  rawLabel: string,
  menuItemId: string | null
): Promise<boolean> {
  const alias = normalizeItemName(rawLabel);
  if (alias === "") return false;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("menu_item_aliases")
      .upsert(
        { restaurant_id: restaurantId, alias, menu_item_id: menuItemId },
        { onConflict: "restaurant_id,alias" }
      );
    return !error;
  } catch {
    return false;
  }
}
