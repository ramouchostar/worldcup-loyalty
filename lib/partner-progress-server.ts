import { createAdminClient } from "@/lib/supabase";
import { getAdminRestaurantIds } from "@/lib/restaurant-admins";
import type { EstablishmentProgress } from "@/lib/partner-progress";

// ADR 0075 §3 — l'avancement lu en base (règles dans lib/partner-progress.ts).

export async function loadProgress(restaurantIds: string[]): Promise<EstablishmentProgress[]> {
  if (restaurantIds.length === 0) return [];
  const admin = createAdminClient();
  const [{ data: restaurants }, { data: configs }, menuCounts] = await Promise.all([
    admin.from("restaurants").select("id, name, sector, status, created_at").in("id", restaurantIds).order("created_at"),
    admin.from("restaurant_receipt_config").select("restaurant_id, confirmed_at").in("restaurant_id", restaurantIds),
    Promise.all(
      restaurantIds.map(async (id) => {
        const { count } = await admin
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", id)
          .eq("is_active", true);
        return [id, count ?? 0] as const;
      }),
    ),
  ]);
  const menus = new Map(menuCounts);
  const tickets = new Set(
    ((configs ?? []) as { restaurant_id: string; confirmed_at: string | null }[])
      .filter((c) => !!c.confirmed_at)
      .map((c) => c.restaurant_id),
  );
  return ((restaurants ?? []) as { id: string; name: string; sector: string | null; status: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
    sector: r.sector,
    status: r.status,
    hasMenu: (menus.get(r.id) ?? 0) > 0,
    hasTicket: tickets.has(r.id),
  }));
}

/** Les établissements d'un restaurateur et leur avancement. */
export async function loadUserProgress(userId: string): Promise<EstablishmentProgress[]> {
  return loadProgress(await getAdminRestaurantIds(userId));
}
