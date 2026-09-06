// ============================================================
// Chiffres d'en-tête de /platform/members — quatre mesures, chacune
// comparée à la SEMAINE PRÉCÉDENTE (issue : « les stats en haut »).
//
// Même contrat que lib/program-value.ts et le forecast (ADR 0027) : la date
// « aujourd'hui » est INJECTÉE, le moteur est pur (aucune requête), chaque
// chiffre est recalculable à la main depuis les lignes sources. Les tests
// (lib/member-stats.test.ts) rejouent des scénarios écrits à la main.
//
// Semaines GLISSANTES de 7 jours finissant aujourd'hui (jamais des semaines
// calendaires) : la « semaine en cours » d'une semaine calendaire est
// tronquée un mardi, et la comparer à une semaine complète invente une
// baisse. Ici les deux fenêtres comparées font toujours 7 jours pleins.
//
// Dates en UTC, comparaisons lexicographiques sur ISO — même convention que
// lib/program-value.ts (`joined_at.slice(0, 10)` donne le jour UTC).
//
// AUCUN euro ici (ADR 0007) : des comptages et un ratio de tickets. Surface
// super-admin exclusivement (ADR 0025 — la plateforme est l'unique
// responsable de traitement).
// ============================================================

import { createAdminClient } from "./supabase";
import { fetchAllRows } from "./paged-select";
import { getAppInstallsByUser } from "./app-install";

/** Nombre de semaines glissantes rendues pour les courbes (≈ 3 mois). */
export const TREND_WEEKS = 12;

export type StatsMembershipRow = { user_id: string; joined_at: string };
export type StatsTeamRow = { created_at: string; created_by: string | null };
export type StatsInstallRow = { user_id: string; installed_at: string };
export type StatsOrderRow = { user_id: string; order_date: string };

export type TrendWeek = {
  /** Premier jour de la fenêtre (AAAA-MM-JJ, inclus). */
  start: string;
  /** Dernier jour de la fenêtre (AAAA-MM-JJ, inclus). */
  end: string;
  value: number;
};

export type Trend = {
  /** De la plus ancienne à la plus récente ; la dernière finit aujourd'hui. */
  weeks: TrendWeek[];
  /** Les 7 derniers jours. */
  current: number;
  /** Les 7 jours d'avant. */
  previous: number;
};

export type MemberStats = {
  /** Fenêtre couverte par les courbes — affichée en pied de page. */
  window: { start: string; end: string };
  members: {
    /** Comptes distincts du périmètre (un membre de deux établissements = 1). */
    total: number;
    /** Lignes d'adhésion — ce que compte le tableau (1 par établissement rejoint). */
    memberships: number;
    /** Nouveaux membres par semaine (PREMIÈRE adhésion dans le périmètre). */
    joined: Trend;
  };
  teams: {
    total: number;
    created: Trend;
  };
  installs: {
    total: number;
    /** Part des membres du périmètre ayant ouvert l'app installée — null si aucun membre. */
    sharePct: number | null;
    installed: Trend;
  };
  /**
   * Tickets validés ÷ membres actifs, sur 7 jours glissants. « Membre actif »
   * = a fait valider au moins un ticket sur la fenêtre (définition ADR 0033).
   * Le dénominateur bouge d'une semaine à l'autre : les deux comptages bruts
   * sont exposés pour que le ratio ne flotte jamais seul à l'écran.
   */
  ordersPerActiveMember: {
    ratio: number | null;
    orders: number;
    activeMembers: number;
    trend: Trend;
  };
  /** Vrai si une lecture a atteint le plafond de pagination : chiffres partiels. */
  truncated: boolean;
};

// ── Dates ───────────────────────────────────────────────────────────────────

const dayOf = (isoDateOrTs: string): string => isoDateOrTs.slice(0, 10);

function addDays(isoDay: string, n: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Index de la semaine glissante d'un jour, 0 = les 7 derniers jours.
 * `null` si le jour est hors fenêtre (trop ancien) ou dans le futur.
 */
function weekIndex(day: string, today: string, weeks: number): number | null {
  const age = daysBetween(day, today);
  if (age < 0) return null; // horodatage futur (décalage d'horloge) — jamais compté
  const idx = Math.floor(age / 7);
  return idx < weeks ? idx : null;
}

function emptyWeeks(today: string, weeks: number): TrendWeek[] {
  // De la plus ancienne à la plus récente : l'index i part de la fin.
  return Array.from({ length: weeks }, (_, pos) => {
    const idx = weeks - 1 - pos;
    const end = addDays(today, -7 * idx);
    return { start: addDays(end, -6), end, value: 0 };
  });
}

function toTrend(weeks: TrendWeek[]): Trend {
  return {
    weeks,
    current: weeks[weeks.length - 1]?.value ?? 0,
    previous: weeks[weeks.length - 2]?.value ?? 0,
  };
}

/** Compte les lignes par semaine glissante à partir de leur date. */
function countByWeek(days: string[], today: string, weeks: number): Trend {
  const buckets = emptyWeeks(today, weeks);
  for (const day of days) {
    const idx = weekIndex(day, today, weeks);
    if (idx === null) continue;
    buckets[weeks - 1 - idx].value += 1;
  }
  return toTrend(buckets);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Moteur ──────────────────────────────────────────────────────────────────

export function computeMemberStats(input: {
  today: string; // AAAA-MM-JJ (injecté)
  memberships: StatsMembershipRow[]; // périmètre déjà appliqué par l'appelant
  teams: StatsTeamRow[];
  installs: StatsInstallRow[];
  orders: StatsOrderRow[]; // tickets VALIDÉS du périmètre
  weeks?: number;
  truncated?: boolean;
}): MemberStats {
  const { today, memberships, teams, installs, orders } = input;
  const weeks = input.weeks ?? TREND_WEEKS;

  // Membres : un compte peut avoir plusieurs adhésions (un établissement
  // chacune). Le « nouveau membre » de la semaine est la PREMIÈRE adhésion du
  // compte dans le périmètre — sinon rejoindre un 2e resto compterait comme
  // une nouvelle personne.
  const firstJoinByUser = new Map<string, string>();
  for (const m of memberships) {
    const day = dayOf(m.joined_at);
    const known = firstJoinByUser.get(m.user_id);
    if (!known || day < known) firstJoinByUser.set(m.user_id, day);
  }

  const memberTotal = firstJoinByUser.size;
  const joined = countByWeek([...firstJoinByUser.values()], today, weeks);
  const created = countByWeek(teams.map((t) => dayOf(t.created_at)), today, weeks);
  const installed = countByWeek(installs.map((i) => dayOf(i.installed_at)), today, weeks);

  // Tickets par membre actif, semaine par semaine : deux passes sur les mêmes
  // commandes (nombre de tickets, et comptes distincts).
  const ordersPerWeek = emptyWeeks(today, weeks);
  const activePerWeek: Set<string>[] = Array.from({ length: weeks }, () => new Set<string>());
  for (const o of orders) {
    const idx = weekIndex(o.order_date, today, weeks);
    if (idx === null) continue;
    const pos = weeks - 1 - idx;
    ordersPerWeek[pos].value += 1;
    activePerWeek[pos].add(o.user_id);
  }
  const ratioWeeks: TrendWeek[] = ordersPerWeek.map((w, pos) => {
    const actives = activePerWeek[pos].size;
    return { start: w.start, end: w.end, value: actives > 0 ? round1(w.value / actives) : 0 };
  });
  const lastPos = weeks - 1;
  const currentOrders = ordersPerWeek[lastPos]?.value ?? 0;
  const currentActives = activePerWeek[lastPos]?.size ?? 0;

  return {
    window: {
      start: ordersPerWeek[0]?.start ?? today,
      end: today,
    },
    members: { total: memberTotal, memberships: memberships.length, joined },
    teams: { total: teams.length, created },
    installs: {
      total: installs.length,
      sharePct: memberTotal > 0 ? Math.round((installs.length / memberTotal) * 100) : null,
      installed,
    },
    ordersPerActiveMember: {
      ratio: currentActives > 0 ? round1(currentOrders / currentActives) : null,
      orders: currentOrders,
      activeMembers: currentActives,
      trend: toTrend(ratioWeeks),
    },
    truncated: input.truncated ?? false,
  };
}

// ── Lecture ─────────────────────────────────────────────────────────────────

/**
 * Charge et calcule les chiffres pour un périmètre d'établissements.
 *
 * Les comptes super-admin sont EXCLUS : on teste en prod sur le réseau réel
 * (pas de resto démo dédié), nos propres adhésions et tickets gonfleraient
 * chaque mesure. Même raison et même source (`profiles.is_super_admin`) que
 * lib/health-metrics.ts — jamais une liste d'emails en dur.
 *
 * Jette en cas d'erreur SQL : la page affiche un bandeau explicite plutôt que
 * des zéros silencieux. Seules les installations d'app sont fail-open
 * (lib/app-install.ts) — la migration peut ne pas être appliquée.
 */
export async function getMemberStats(
  restaurantIds: string[],
  today: string = new Date().toISOString().slice(0, 10)
): Promise<MemberStats> {
  const empty = computeMemberStats({ today, memberships: [], teams: [], installs: [], orders: [] });
  if (restaurantIds.length === 0) return empty;

  const admin = createAdminClient();

  const { data: superAdmins, error: superAdminsError } = await admin
    .from("profiles")
    .select("id")
    .eq("is_super_admin", true);
  if (superAdminsError) throw new Error(`profiles(super_admin): ${superAdminsError.message}`);
  const excluded = new Set(((superAdmins as { id: string }[] | null) ?? []).map((p) => p.id));

  // Les commandes ne sont chargées que sur la fenêtre des courbes ; les
  // adhésions et les équipes le sont depuis le début (les tuiles montrent
  // aussi un cumul).
  const windowStart = addDays(today, -7 * TREND_WEEKS + 1);

  const [membershipsPage, teamsPage, ordersPage] = await Promise.all([
    fetchAllRows<StatsMembershipRow>((from, to) =>
      admin
        .from("memberships")
        .select("user_id, joined_at")
        .in("restaurant_id", restaurantIds)
        .range(from, to)
    ),
    fetchAllRows<StatsTeamRow>((from, to) =>
      admin
        .from("teams")
        .select("created_at, created_by")
        .in("restaurant_id", restaurantIds)
        .range(from, to)
    ),
    fetchAllRows<StatsOrderRow>((from, to) =>
      admin
        .from("orders")
        .select("user_id, order_date")
        .eq("status", "validated")
        .in("restaurant_id", restaurantIds)
        .gte("order_date", windowStart)
        .range(from, to)
    ),
  ]);

  const memberships = membershipsPage.rows.filter((m) => !excluded.has(m.user_id));
  const teams = teamsPage.rows.filter((t) => !t.created_by || !excluded.has(t.created_by));
  const orders = ordersPage.rows.filter((o) => !excluded.has(o.user_id));

  // Installations : la table est GLOBALE (une ligne par compte, pas par
  // établissement) — on la ramène au périmètre par les membres qu'il contient.
  const userIds = [...new Set(memberships.map((m) => m.user_id))];
  const installMap = await getAppInstallsByUser(userIds);
  const installs: StatsInstallRow[] = [...installMap.values()].map((i) => ({
    user_id: i.user_id,
    installed_at: i.installed_at,
  }));

  return computeMemberStats({
    today,
    memberships,
    teams,
    installs,
    orders,
    truncated: membershipsPage.truncated || teamsPage.truncated || ordersPage.truncated,
  });
}
