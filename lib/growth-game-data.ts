import { createAdminClient } from "./supabase";
import { fetchAllRows } from "./paged-select";
import { addDays, brusselsDay } from "./console-journey";
import { MACHINE_WINDOW_DAYS, salesByDay, type GrowthRaw } from "./growth-game";

// Lecture des chiffres du jeu de la croissance (ADR 0081) — service-role,
// borné à UN établissement, jamais exposé à un membre.
//
// Fail-open comme le reste de la console : une panne donne un zéro prudent,
// jamais une page cassée. Chaque compteur vient d'une colonne écrite par un
// geste réel : `orders.order_date` (ticket validé), `memberships.joined_at`
// (adhésion = contact), `restaurant_sales.sold_on` (CA du jour noté ou importé).

export async function loadGrowthRaw(restaurantId: string, today: string): Promise<GrowthRaw & { salesIncomplete: boolean }> {
  const admin = createAdminClient();
  const windowStart = addDays(today, -MACHINE_WINDOW_DAYS);
  const weekStart = addDays(today, -7);
  // Les adhésions sont horodatées : la fenêtre part de minuit UTC du jour de
  // début, écart d'une heure ou deux sans effet sur un seuil à 200.
  const joinedSince = (day: string) => `${day}T00:00:00Z`;

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    try {
      const { count: c, error } = await q;
      return error ? 0 : c ?? 0;
    } catch {
      return 0;
    }
  };
  const validated = () =>
    admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "validated");
  const joined = () => admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId);

  // Le tout premier ticket et la toute première adhésion : un établissement
  // lancé il y a 2 jours se mesure sur 2 jours, pas sur 7 (activeDays).
  const first = <T,>(q: PromiseLike<{ data: T[] | null; error: unknown }>, pick: (row: T) => string | null) =>
    Promise.resolve(q).then(
      (r) => (r.error || !r.data?.[0] ? null : pick(r.data[0])),
      () => null
    );

  const [tickets90, ticketsWeek, contacts90, contactsWeek, firstTicketDay, firstContactDay, sales] = await Promise.all([
    count(validated().gte("order_date", windowStart)),
    count(validated().gte("order_date", weekStart)),
    count(joined().gte("joined_at", joinedSince(windowStart))),
    count(joined().gte("joined_at", joinedSince(weekStart))),
    first(
      admin.from("orders").select("order_date").eq("restaurant_id", restaurantId).eq("status", "validated").order("order_date", { ascending: true }).limit(1),
      (r: { order_date: string | null }) => (r.order_date ? String(r.order_date).slice(0, 10) : null)
    ),
    first(
      admin.from("memberships").select("joined_at").eq("restaurant_id", restaurantId).order("joined_at", { ascending: true }).limit(1),
      (r: { joined_at: string | null }) => (r.joined_at ? brusselsDay(r.joined_at) : null)
    ),
    // Tout l'historique : le départ se calcule sur les 28 PREMIERS jours notés.
    // Un import CSV a une ligne par ticket, d'où la lecture par pages.
    fetchAllRows<{ sold_on: string; amount: number }>((from, to) =>
      admin
        .from("restaurant_sales")
        .select("sold_on, amount")
        .eq("restaurant_id", restaurantId)
        .order("sold_on", { ascending: true })
        .range(from, to)
    ).catch((e) => {
      console.error("[growth-game] restaurant_sales :", (e as Error).message);
      return { rows: [] as { sold_on: string; amount: number }[], truncated: true };
    }),
  ]);

  if (sales.truncated) console.error(`[growth-game] ventes incomplètes pour ${restaurantId} — paliers non fiables`);

  return {
    today,
    tickets90,
    ticketsWeek,
    contacts90,
    contactsWeek,
    firstTicketDay,
    firstContactDay,
    sales: salesByDay(sales.rows),
    salesIncomplete: sales.truncated,
  };
}
