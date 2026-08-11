import { createAdminClient } from "./supabase";

// ADR 0029 §7 (Phase 4) — Repères secteur : agrégats ANONYMISÉS de la donnée
// de TOUS les établissements (Gratuit inclus contribue), consultables
// uniquement en plan Pro. Règles absolues :
// - JAMAIS de chiffre brut identifiable d'un autre resto, JAMAIS de nom —
//   seules des MÉDIANES de cohorte franchissent la frontière inter-restos ;
// - seuil plancher (≥ SECTOR_MIN_RESTAURANTS) anti-ré-identification, même
//   logique « pas assez de données » que le forecast (ADR 0027) ;
// - le resto voit SON chiffre (sa donnée) face à la médiane, rien d'autre.
// Source v1 : les commandes scannées (ADR 0020) — la donnée que tous les
// restos du réseau génèrent, même biais partout donc comparable. Les ventes
// caisse (m45) viendront enrichir quand assez de restos importeront.

// ⚠️ À CALER avant lancement : plancher d'anonymisation (≥ N restos dans la
// cohorte) et volume minimal de commandes pour qu'un resto soit comparable.
export const SECTOR_MIN_RESTAURANTS = 5;
export const MIN_ORDERS_PER_RESTO = 10;
const PERIOD_DAYS = 90;

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type RestoStats = {
  avgBasket: number;
  // Indice par jour de semaine : part du CA du jour ÷ (1/7). 1 = jour moyen,
  // 1.18 = +18 % vs la moyenne du resto. Comparable entre restos (sans €).
  weekdayIndex: number[]; // longueur 7, Lun..Dim
};

export type SectorBenchmarks =
  | { status: "insufficient"; cohortSize: number; needed: number }
  | {
      status: "ok";
      scope: "secteur" | "réseau";
      sector: string | null;
      cohortSize: number; // nb d'établissements agrégés (le mien exclu)
      mine: RestoStats | null; // null = pas encore assez de commandes chez moi
      median: RestoStats;
    };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function statsFromOrders(orders: { amount: number; order_date: string }[]): RestoStats | null {
  if (orders.length < MIN_ORDERS_PER_RESTO) return null;
  const total = orders.reduce((s, o) => s + Number(o.amount), 0);
  if (total <= 0) return null;

  const byWeekday = new Array(7).fill(0);
  for (const o of orders) {
    // getUTCDay : 0=Dim..6=Sam → index 0=Lun..6=Dim
    const d = new Date(`${o.order_date}T00:00:00Z`).getUTCDay();
    byWeekday[(d + 6) % 7] += Number(o.amount);
  }
  return {
    avgBasket: total / orders.length,
    weekdayIndex: byWeekday.map((v) => v / total / (1 / 7)),
  };
}

export async function computeSectorBenchmarks(restaurantId: string): Promise<SectorBenchmarks> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [{ data: restosRaw }, { data: ordersRaw }] = await Promise.all([
    admin.from("restaurants").select("id, sector").eq("status", "active"),
    admin
      .from("orders")
      .select("restaurant_id, amount, order_date")
      .eq("status", "validated")
      .gte("order_date", since)
      .limit(50000),
  ]);

  const restos = ((restosRaw as { id: string; sector: string | null }[] | null) ?? []);
  const orders = ((ordersRaw as { restaurant_id: string; amount: number; order_date: string }[] | null) ?? []);

  const byResto = new Map<string, { amount: number; order_date: string }[]>();
  for (const o of orders) {
    const list = byResto.get(o.restaurant_id) ?? [];
    list.push(o);
    byResto.set(o.restaurant_id, list);
  }

  // Stats par resto — seuls les restos avec assez de commandes sont comparables.
  const statsById = new Map<string, RestoStats>();
  for (const r of restos) {
    const st = statsFromOrders(byResto.get(r.id) ?? []);
    if (st) statsById.set(r.id, st);
  }

  const mySector = (restos.find((r) => r.id === restaurantId)?.sector ?? "").trim().toLowerCase();
  const others = restos.filter((r) => r.id !== restaurantId && statsById.has(r.id));

  // Cohorte : le secteur si le plancher y est atteint, sinon le réseau entier.
  const sameSector = mySector
    ? others.filter((r) => (r.sector ?? "").trim().toLowerCase() === mySector)
    : [];
  const useSector = sameSector.length >= SECTOR_MIN_RESTAURANTS;
  const cohort = useSector ? sameSector : others;

  if (cohort.length < SECTOR_MIN_RESTAURANTS) {
    return { status: "insufficient", cohortSize: cohort.length, needed: SECTOR_MIN_RESTAURANTS };
  }

  const cohortStats = cohort.map((r) => statsById.get(r.id)!);
  return {
    status: "ok",
    scope: useSector ? "secteur" : "réseau",
    sector: useSector ? (restos.find((r) => r.id === restaurantId)?.sector ?? null) : null,
    cohortSize: cohort.length,
    mine: statsById.get(restaurantId) ?? statsFromOrders(byResto.get(restaurantId) ?? []),
    median: {
      avgBasket: median(cohortStats.map((s) => s.avgBasket)),
      weekdayIndex: WEEKDAY_LABELS.map((_, i) => median(cohortStats.map((s) => s.weekdayIndex[i]))),
    },
  };
}
