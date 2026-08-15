import { createAdminClient } from "./supabase";
import { selectRestaurantsWithDemo } from "./demo";
import { fetchAllRows } from "./paged-select";
import type { Plan } from "./entitlements";

// ADR 0033 §2 — chiffres réseau de la console plateforme (/platform/stats).
//
// Surface super-admin exclusivement : c'est le seul endroit du produit où les
// données de TOUS les établissements sont agrégées ensemble. Rien n'en sort
// vers un membre ni vers un restaurateur (ADR 0007 : le client ne voit ni
// euros ni CA ; ADR 0015 §7 : un restaurateur ne voit que son établissement).
//
// Par défaut, les établissements démo (ADR 0033 §1) sont EXCLUS : un chiffre
// de traction qui compte des restos fictifs ne sert à aucune décision. Le
// commutateur `includeDemo` les réintègre pour vérifier une démo.

const TZ = "Europe/Brussels";
const MONTH_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });
// Abscisse volontairement courte (« août ») : douze colonnes sur un écran de
// téléphone n'ont pas la place d'un « août 26 ». L'année est portée par la clé
// (`2026-08`), reprise dans la vue tableau de chaque graphique.
const MONTH_LABEL = new Intl.DateTimeFormat("fr-BE", { timeZone: TZ, month: "short" });

/** Profondeur des séries mensuelles — borne aussi le volume de commandes chargé. */
export const WINDOW_MONTHS = 12;

const DAY_MS = 86_400_000;
// Garde-fou volume : le réseau est petit (dizaines d'établissements, milliers
// de tickets), mais la pagination doit s'arrêter quelque part. Plafond atteint
// → mention « chiffres partiels » affichée sur la page, jamais un total
// tronqué présenté comme complet.
const ORDERS_HARD_LIMIT = 50_000;

export type MonthPoint = { key: string; label: string; value: number };

export type FunnelStep = { label: string; value: number; hint: string };

export type RestaurantStatRow = {
  id: string;
  name: string;
  sector: string | null;
  status: "pending" | "active" | "disabled";
  isDemo: boolean;
  plan: Plan;
  hasOwner: boolean;
  menuItems: number;
  activatedAt: string | null;
  members: number;
  newMembers30d: number;
  activeMembers30d: number;
  orders12m: number;
  orders30d: number;
  revenue12m: number;
  lastOrderDate: string | null;
};

export type PlatformStats = {
  includeDemo: boolean;
  demoCount: number;
  /** m56 pas encore appliquée : la page le dit au lieu d'afficher des chiffres faux. */
  demoColumnMissing: boolean;
  /** Fenêtre de commandes saturée — les séries sont incomplètes. */
  truncated: boolean;
  windowStart: string;

  restaurants: {
    total: number;
    active: number;
    pending: number;
    disabled: number;
    activatedThisMonth: number;
    activatedPrevMonth: number;
  };
  members: {
    memberships: number;
    people: number;
    new30d: number;
    active30d: number;
    active90d: number;
    withTeam: number;
  };
  orders: {
    count12m: number;
    count30d: number;
    revenue12m: number;
    revenue30d: number;
    avgBasket30d: number;
  };

  activationsByMonth: MonthPoint[];
  joinsByMonth: MonthPoint[];
  activeMembersByMonth: MonthPoint[];
  ordersByMonth: MonthPoint[];
  revenueByMonth: MonthPoint[];

  funnel: FunnelStep[];
  rows: RestaurantStatRow[];
};

type RestaurantRow = {
  id: string;
  name: string;
  sector: string | null;
  status: "pending" | "active" | "disabled";
  owner_id: string | null;
  created_at: string;
  activated_at?: string | null;
  is_demo?: boolean | null;
};

const FULL_COLUMNS = "id, name, sector, status, owner_id, created_at, activated_at, is_demo";
const LEGACY_COLUMNS = "id, name, sector, status, owner_id, created_at";

/** Clé de mois d'un horodatage (`2026-08`), calée sur l'heure belge. */
function monthKeyOf(iso: string): string {
  return MONTH_KEY.format(new Date(iso));
}

/** `orders.order_date` est une DATE nue : sa clé de mois est un simple préfixe. */
function monthKeyOfDate(date: string): string {
  return date.slice(0, 7);
}

/** Les `WINDOW_MONTHS` derniers mois, du plus ancien au plus récent, trous compris. */
function monthAxis(now: Date): { key: string; label: string }[] {
  const axis: { key: string; label: string }[] = [];
  for (let i = WINDOW_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
    axis.push({ key: MONTH_KEY.format(d), label: MONTH_LABEL.format(d) });
  }
  return axis;
}

function series(axis: { key: string; label: string }[], counts: Map<string, number>): MonthPoint[] {
  return axis.map((m) => ({ ...m, value: counts.get(m.key) ?? 0 }));
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/**
 * Tous les chiffres de /platform/stats en une passe.
 *
 * Le réseau tient en mémoire (dizaines d'établissements, milliers de
 * commandes) : on charge les lignes brutes et on agrège en JS plutôt que de
 * multiplier les `count: exact` par établissement — c'est une requête au lieu
 * de 5 × N, et ça permet des agrégats croisés (membres actifs = distinct
 * user_id sur la période) qu'un COUNT ne donne pas.
 */
export async function getPlatformStats(includeDemo: boolean): Promise<PlatformStats> {
  const admin = createAdminClient();
  const now = new Date();
  const axis = monthAxis(now);
  const windowStart = axis[0].key + "-01";
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const since30Date = since30.slice(0, 10);
  const since90Date = new Date(now.getTime() - 90 * DAY_MS).toISOString().slice(0, 10);

  // 1. Établissements — tolérant à m56 non appliquée (colonnes is_demo /
  //    activated_at absentes → repli sur les colonnes historiques).
  const { rows: restaurantsRaw, demoColumnMissing } = await selectRestaurantsWithDemo<RestaurantRow>(
    admin,
    FULL_COLUMNS,
    LEGACY_COLUMNS
  );

  const demoCount = restaurantsRaw.filter((r) => r.is_demo).length;
  const restaurants = includeDemo ? restaurantsRaw : restaurantsRaw.filter((r) => !r.is_demo);
  const scopeIds = restaurants.map((r) => r.id);

  // Réseau vide dans le périmètre demandé : rien à agréger, on rend la page
  // dans son état vide plutôt que d'émettre des `.in()` sur une liste vide.
  if (scopeIds.length === 0) {
    return emptyStats({ includeDemo, demoCount, demoColumnMissing, axis, windowStart, restaurantsRaw });
  }

  // 2. Adhésions, commandes de la fenêtre, catalogue, plans — en parallèle.
  //    Les trois premières tables sont paginées : PostgREST tronque en silence
  //    au-delà de `max_rows`, et un agrégat tronqué ne se voit pas.
  const [membershipsRes, ordersRes, menuRes, subsRes] = await Promise.all([
    fetchAllRows<{ user_id: string; restaurant_id: string; team_id: string | null; joined_at: string }>(
      (from, to) =>
        admin
          .from("memberships")
          .select("user_id, restaurant_id, team_id, joined_at")
          .in("restaurant_id", scopeIds)
          .range(from, to)
    ),
    fetchAllRows<{ user_id: string; restaurant_id: string; order_date: string; amount: number }>(
      (from, to) =>
        admin
          .from("orders")
          .select("user_id, restaurant_id, order_date, amount")
          .eq("status", "validated")
          .in("restaurant_id", scopeIds)
          .gte("order_date", windowStart)
          .range(from, to),
      { maxRows: ORDERS_HARD_LIMIT }
    ),
    fetchAllRows<{ restaurant_id: string }>((from, to) =>
      admin.from("menu_items").select("restaurant_id").in("restaurant_id", scopeIds).range(from, to)
    ),
    admin.from("restaurant_subscriptions").select("restaurant_id, plan, status"),
  ]);

  const memberships = membershipsRes.rows;
  const orders = ordersRes.rows;
  const menuItems = menuRes.rows;
  const subs = (subsRes.data as { restaurant_id: string; plan: Plan; status: string }[] | null) ?? [];

  const planById = new Map(subs.filter((s) => s.status === "active").map((s) => [s.restaurant_id, s.plan]));
  const menuCountById = new Map<string, number>();
  for (const m of menuItems) bump(menuCountById, m.restaurant_id);

  // 3. Séries mensuelles.
  const activationCounts = new Map<string, number>();
  for (const r of restaurants) {
    // activated_at absent (m56 non appliquée, ou resto activé avant m56) :
    // created_at est la meilleure approximation — même repli que le backfill.
    const at = r.activated_at ?? (r.status === "active" ? r.created_at : null);
    if (at) bump(activationCounts, monthKeyOf(at));
  }

  const joinCounts = new Map<string, number>();
  const membersById = new Map<string, number>();
  const newMembers30dById = new Map<string, number>();
  const people = new Set<string>();
  let withTeam = 0;
  let new30d = 0;
  for (const m of memberships) {
    bump(joinCounts, monthKeyOf(m.joined_at));
    bump(membersById, m.restaurant_id);
    people.add(m.user_id);
    if (m.team_id) withTeam++;
    if (m.joined_at >= since30) {
      new30d++;
      bump(newMembers30dById, m.restaurant_id);
    }
  }

  // « Membre actif » = a fait valider au moins une commande sur la période.
  // C'est la seule définition qui distingue un compte créé d'un client fidélisé.
  const orderCounts = new Map<string, number>();
  const revenueCounts = new Map<string, number>();
  const activeByMonth = new Map<string, Set<string>>();
  const ordersById = new Map<string, number>();
  const orders30dById = new Map<string, number>();
  const revenueById = new Map<string, number>();
  const activeMembers30dById = new Map<string, Set<string>>();
  const lastOrderById = new Map<string, string>();
  const active30d = new Set<string>();
  const active90d = new Set<string>();
  let orders30d = 0;
  let revenue30d = 0;
  let revenue12m = 0;

  for (const o of orders) {
    const key = monthKeyOfDate(o.order_date);
    const amount = Number(o.amount) || 0;
    bump(orderCounts, key);
    bump(revenueCounts, key, amount);
    revenue12m += amount;

    const set = activeByMonth.get(key) ?? new Set<string>();
    set.add(o.user_id);
    activeByMonth.set(key, set);

    bump(ordersById, o.restaurant_id);
    bump(revenueById, o.restaurant_id, amount);
    const previousLast = lastOrderById.get(o.restaurant_id);
    if (!previousLast || o.order_date > previousLast) lastOrderById.set(o.restaurant_id, o.order_date);

    if (o.order_date >= since90Date) active90d.add(o.user_id);
    if (o.order_date >= since30Date) {
      active30d.add(o.user_id);
      orders30d++;
      revenue30d += amount;
      bump(orders30dById, o.restaurant_id);
      const restoSet = activeMembers30dById.get(o.restaurant_id) ?? new Set<string>();
      restoSet.add(o.user_id);
      activeMembers30dById.set(o.restaurant_id, restoSet);
    }
  }

  const activeCounts = new Map<string, number>();
  for (const [key, set] of activeByMonth) activeCounts.set(key, set.size);

  // 4. Entonnoir d'activation — où le réseau perd les établissements.
  const active = restaurants.filter((r) => r.status === "active");
  const funnel: FunnelStep[] = [
    { label: "Créés", value: restaurants.length, hint: "établissements en base" },
    { label: "Actifs", value: active.length, hint: "validés et visibles" },
    {
      label: "Restaurateur rattaché",
      value: active.filter((r) => r.owner_id).length,
      hint: "un compte tient la console",
    },
    {
      label: "Catalogue prêt",
      value: active.filter((r) => (menuCountById.get(r.id) ?? 0) > 0).length,
      hint: "au moins un article",
    },
    {
      label: "Premiers membres",
      value: active.filter((r) => (membersById.get(r.id) ?? 0) > 0).length,
      hint: "au moins une adhésion",
    },
    {
      label: "Programme vivant",
      value: active.filter((r) => (ordersById.get(r.id) ?? 0) > 0).length,
      hint: "au moins un ticket validé",
    },
  ];

  const activationsByMonth = series(axis, activationCounts);
  const thisMonth = activationsByMonth[activationsByMonth.length - 1]?.value ?? 0;
  const prevMonth = activationsByMonth[activationsByMonth.length - 2]?.value ?? 0;

  const rows: RestaurantStatRow[] = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    sector: r.sector,
    status: r.status,
    isDemo: !!r.is_demo,
    plan: planById.get(r.id) ?? "gratuit",
    hasOwner: !!r.owner_id,
    menuItems: menuCountById.get(r.id) ?? 0,
    activatedAt: r.activated_at ?? (r.status === "active" ? r.created_at : null),
    members: membersById.get(r.id) ?? 0,
    newMembers30d: newMembers30dById.get(r.id) ?? 0,
    activeMembers30d: activeMembers30dById.get(r.id)?.size ?? 0,
    orders12m: ordersById.get(r.id) ?? 0,
    orders30d: orders30dById.get(r.id) ?? 0,
    revenue12m: revenueById.get(r.id) ?? 0,
    lastOrderDate: lastOrderById.get(r.id) ?? null,
  }));

  return {
    includeDemo,
    demoCount,
    demoColumnMissing,
    truncated: ordersRes.truncated,
    windowStart,
    restaurants: {
      total: restaurants.length,
      active: active.length,
      pending: restaurants.filter((r) => r.status === "pending").length,
      disabled: restaurants.filter((r) => r.status === "disabled").length,
      activatedThisMonth: thisMonth,
      activatedPrevMonth: prevMonth,
    },
    members: {
      memberships: memberships.length,
      people: people.size,
      new30d,
      active30d: active30d.size,
      active90d: active90d.size,
      withTeam,
    },
    orders: {
      count12m: orders.length,
      count30d: orders30d,
      revenue12m,
      revenue30d,
      avgBasket30d: orders30d > 0 ? revenue30d / orders30d : 0,
    },
    activationsByMonth,
    joinsByMonth: series(axis, joinCounts),
    activeMembersByMonth: series(axis, activeCounts),
    ordersByMonth: series(axis, orderCounts),
    revenueByMonth: series(axis, revenueCounts),
    funnel,
    rows: rows.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name)),
  };
}

function emptyStats(args: {
  includeDemo: boolean;
  demoCount: number;
  demoColumnMissing: boolean;
  axis: { key: string; label: string }[];
  windowStart: string;
  restaurantsRaw: RestaurantRow[];
}): PlatformStats {
  const empty = series(args.axis, new Map());
  return {
    includeDemo: args.includeDemo,
    demoCount: args.demoCount,
    demoColumnMissing: args.demoColumnMissing,
    truncated: false,
    windowStart: args.windowStart,
    restaurants: {
      total: 0,
      active: 0,
      pending: 0,
      disabled: 0,
      activatedThisMonth: 0,
      activatedPrevMonth: 0,
    },
    members: { memberships: 0, people: 0, new30d: 0, active30d: 0, active90d: 0, withTeam: 0 },
    orders: { count12m: 0, count30d: 0, revenue12m: 0, revenue30d: 0, avgBasket30d: 0 },
    activationsByMonth: empty,
    joinsByMonth: empty,
    activeMembersByMonth: empty,
    ordersByMonth: empty,
    revenueByMonth: empty,
    funnel: [],
    rows: [],
  };
}
