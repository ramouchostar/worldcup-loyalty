import { createAdminClient } from "./supabase";
import { computeForecast, type ForecastResult, type LocalEventRow, type RefCalRow, type SaleRow } from "./forecast";
import { getSchoolCalendars } from "./school-calendar";

// Lecture des entrées de la prévision (ADR 0027), partagée par la page
// Prévisions et l'aperçu des 7 prochains jours de l'accueil (ADR 0087 §5).
// Mêmes requêtes, même moteur : l'accueil ne peut pas annoncer un autre chiffre
// que la page. SERVEUR UNIQUEMENT.

export type ForecastEventRow = { id: string; label: string; starts_on: string; ends_on: string; expected_effect: "up" | "down" };

export type ForecastInputs = {
  daily: { sold_on: string; total: number }[];
  sales: SaleRow[];
  referenceCalendar: RefCalRow[];
  events: ForecastEventRow[];
  promoDates: string[];
  communities: ("FR" | "NL" | "DE")[];
};

export async function loadForecastInputs(restaurantId: string, now = new Date()): Promise<ForecastInputs> {
  const admin = createAdminClient();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 182 * 86_400_000).toISOString().slice(0, 10); // ~26 semaines
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const [communities, dailyRes, refCalRes, eventsRes, promoRes] = await Promise.all([
    getSchoolCalendars(admin, restaurantId),
    admin.rpc("daily_sales_totals", { p_restaurant_id: restaurantId, p_since: since }),
    admin
      .from("reference_calendar")
      .select("kind, community, starts_on, ends_on, label, expected_effect")
      // Les `exam_session` (signal blocus) ne sont pas des facteurs du forecast.
      .in("kind", ["school_holiday", "national_event"])
      .gte("ends_on", since),
    admin
      .from("restaurant_events")
      .select("id, label, starts_on, ends_on, expected_effect")
      .eq("restaurant_id", restaurantId)
      .gte("ends_on", since)
      .order("starts_on", { ascending: true }),
    admin
      .from("scheduled_broadcasts")
      .select("promo_on")
      .eq("restaurant_id", restaurantId)
      .not("promo_on", "is", null)
      .gte("promo_on", today)
      .lte("promo_on", in7),
  ]);

  const daily = (dailyRes.data ?? []) as { sold_on: string; total: number }[];
  return {
    daily,
    sales: daily.map((r) => ({ sold_on: r.sold_on, sold_at: null, amount: Number(r.total) })),
    referenceCalendar: (refCalRes.data ?? []) as RefCalRow[],
    events: (eventsRes.data ?? []) as ForecastEventRow[],
    promoDates: ((promoRes.data ?? []) as { promo_on: string }[]).map((p) => p.promo_on),
    communities,
  };
}

export function forecastFrom(inputs: ForecastInputs, today: string): ForecastResult {
  return computeForecast({
    today,
    sales: inputs.sales,
    referenceCalendar: inputs.referenceCalendar,
    localEvents: inputs.events.map<LocalEventRow>((e) => ({
      starts_on: e.starts_on,
      ends_on: e.ends_on,
      label: e.label,
      expected_effect: e.expected_effect,
    })),
    promoDates: inputs.promoDates,
    schoolCommunities: inputs.communities,
  });
}
