// ADR 0108 §6 — le rapport de la semaine de l'espace de commande, écrit par Nina pour le gérant. Logique PURE et testée ; les
// lectures sont dans `report-db.ts`, l'affichage dans la console. Aucune table nouvelle : tout sort de `site_orders`, de
// `site_order_refusals` et de `memberships`.
//
// Le gérant le voit en euros : l'ADR 0007 ne protège que le client. Rien d'inventé : un chiffre qu'on ne sait pas mesurer vaut
// `null` (la page le dit), et un problème n'est « réglé » que si la base le prouve.

import { addDays } from "../console-journey";
import { brusselsInstant } from "../mission-cancellation";
import { CARD_REASONS, OUTAGE_REASONS, READY_FORGOTTEN_MINUTES, RESCUE_REASON, WAITING_MINUTES } from "./nina-alerts";
import { brusselsDay, minutesToReady } from "./order";
import type { OrderLine, OrderStatus } from "./order";

/** Le rapport couvre les 7 derniers jours belges, aujourd'hui compris (un défaut de produit : il n'est jamais vide un lundi matin). */
export const REPORT_DAYS = 7;
/**
 * Une adhésion créée dans ce délai APRÈS une commande du site vient de l'espace : la route l'écrit juste après la commande, avec
 * l'horloge de la base (`ensureSiteMembership`). Quelqu'un entré par le QR avant de commander n'est donc pas compté.
 */
export const JOINED_BY_ORDER_MINUTES = 5;
export const TOP_DISHES = 3;

/** Les motifs de refus qui sont des PROBLÈMES (la connexion demandée ou une faute de saisie du client n'en sont pas). */
export const REPORT_REASONS: readonly string[] = [...OUTAGE_REASONS, ...CARD_REASONS, RESCUE_REASON];

const CARD_LABELS: Record<(typeof CARD_REASONS)[number], string> = {
  plat_inconnu: "plat retiré de la carte",
  plat_indisponible: "plat indisponible",
  choix_invalide: "choix impossible",
  plafond: "commande au-dessus du plafond",
};

export type ReportOrder = {
  id: string; status: OrderStatus; createdAt: string; readyAt: string | null; totalCents: number; lines: readonly OrderLine[];
  /** `null` : commande sans compte (avant les comptes, ou compte supprimé). */
  memberId: string | null;
};
export type ReportRefusal = { reason: string; createdAt: string };
export type ReportMembership = { userId: string; joinedAt: string };

export type ReportInput = {
  orders: readonly ReportOrder[];
  refusals: readonly ReportRefusal[];
  /** `null` : le lien entre commande et compte n'est pas lisible (migration absente) — les nouveaux membres ne se mesurent pas. */
  memberships: readonly ReportMembership[] | null;
  now: Date;
};

/** « regle » : la base le prouve. « a_regler » : une commande attend un geste. « a_verifier » : rien ne dit comment ça a fini. */
export type ProblemState = "regle" | "a_regler" | "a_verifier";
export type ReportProblem = { day: string; text: string; state: ProblemState };

export type WeeklyReport = {
  fromDay: string;
  toDay: string;
  received: number;
  pickedUp: number;
  cancelled: number;
  /** Le total des seules commandes retirées (payées au comptoir). */
  pickedUpCents: number;
  newMembers: number | null;
  /** `null` : aucune commande passée « prête » cette semaine. */
  avgReadyMinutes: number | null;
  topDishes: { name: string; qty: number }[];
  /** De la première à la dernière heure qui a reçu une commande, sans trou ; vide sans commande. Heures belges. */
  hours: { hour: number; count: number }[];
  problems: ReportProblem[];
};

/** La fenêtre lue et affichée : de minuit (heure belge) il y a six jours à maintenant. */
export function reportWindow(now: Date): { fromDay: string; toDay: string; sinceIso: string } {
  const toDay = brusselsDay(now);
  const fromDay = addDays(toDay, -(REPORT_DAYS - 1));
  return { fromDay, toDay, sinceIso: brusselsInstant(fromDay, "00:00").toISOString() };
}

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" });
const brusselsHourOf = (iso: string): number => Number(hourFormat.format(new Date(iso)));
const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

function newMembersFrom(orders: readonly ReportOrder[], memberships: readonly ReportMembership[]): number {
  const joined = new Map(memberships.map((m) => [m.userId, Date.parse(m.joinedAt)]));
  const found = new Set<string>();
  for (const o of orders) {
    if (o.memberId === null) continue;
    const at = joined.get(o.memberId);
    if (at === undefined) continue;
    const delay = at - Date.parse(o.createdAt);
    if (delay >= 0 && delay <= JOINED_BY_ORDER_MINUTES * 60000) found.add(o.memberId);
  }
  return found.size;
}

/** Les plats les plus commandés, par quantité ; à égalité, par nom. Le nom affiché est le plus récent (un plat renommé reste un plat). */
function topDishesFrom(orders: readonly ReportOrder[]): { name: string; qty: number }[] {
  const dishes = new Map<string, { name: string; qty: number; at: number }>();
  for (const o of orders) {
    const at = Date.parse(o.createdAt);
    for (const l of o.lines) {
      const d = dishes.get(l.articleId) ?? { name: l.name, qty: 0, at };
      d.qty += l.qty;
      if (at >= d.at) { d.name = l.name; d.at = at; }
      dishes.set(l.articleId, d);
    }
  }
  return [...dishes.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "fr")).slice(0, TOP_DISHES).map(({ name, qty }) => ({ name, qty }));
}

function hoursFrom(orders: readonly ReportOrder[]): { hour: number; count: number }[] {
  if (orders.length === 0) return [];
  const counts = new Map<number, number>();
  for (const o of orders) { const h = brusselsHourOf(o.createdAt); counts.set(h, (counts.get(h) ?? 0) + 1); }
  const seen = [...counts.keys()];
  const first = Math.min(...seen);
  const last = Math.max(...seen);
  return Array.from({ length: last - first + 1 }, (_, i) => ({ hour: first + i, count: counts.get(first + i) ?? 0 }));
}

function problemsFrom(orders: readonly ReportOrder[], refusals: readonly ReportRefusal[], now: number): ReportProblem[] {
  const out: ReportProblem[] = [];
  const byDay = <T,>(rows: readonly T[], at: (r: T) => string): [string, T[]][] => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const d = brusselsDay(new Date(at(r))); m.set(d, [...(m.get(d) ?? []), r]); }
    return [...m.entries()];
  };
  const refused = (reasons: readonly string[]) => refusals.filter((r) => reasons.includes(r.reason));
  const lastOrderAt = orders.reduce((max, o) => Math.max(max, Date.parse(o.createdAt)), 0);

  // Une panne : « réglé » seulement si une commande est bien passée APRÈS le dernier échec de ce jour-là.
  for (const [day, rows] of byDay(refused(OUTAGE_REASONS), (r) => r.createdAt)) {
    const last = Math.max(...rows.map((r) => Date.parse(r.createdAt)));
    out.push({ day, state: lastOrderAt > last ? "regle" : "a_verifier", text: `${plural(rows.length, "envoi a échoué", "envois ont échoué")} : un souci de notre côté` });
  }
  for (const [day, rows] of byDay(refused([RESCUE_REASON]), (r) => r.createdAt)) {
    out.push({ day, state: "a_verifier", text: `Secours WhatsApp proposé ${rows.length} fois : regarde tes messages, ces commandes ne sont pas enregistrées` });
  }
  for (const reason of CARD_REASONS) {
    for (const [day, rows] of byDay(refused([reason]), (r) => r.createdAt)) {
      out.push({ day, state: "a_verifier", text: `${plural(rows.length, "envoi refusé", "envois refusés")} : ${CARD_LABELS[reason]}` });
    }
  }
  // Les commandes restées en route : mêmes seuils que les alertes, pour que la page et le rapport ne se contredisent pas.
  const since = (iso: string) => (now - Date.parse(iso)) / 60000;
  const neverReady = orders.filter((o) => o.status === "recue" && since(o.createdAt) >= WAITING_MINUTES);
  for (const [day, rows] of byDay(neverReady, (o) => o.createdAt)) {
    out.push({ day, state: "a_regler", text: plural(rows.length, "commande jamais marquée « prête »", "commandes jamais marquées « prêtes »") });
  }
  const neverPickedUp = orders.filter((o) => o.status === "prete" && since(o.readyAt ?? o.createdAt) >= READY_FORGOTTEN_MINUTES);
  for (const [day, rows] of byDay(neverPickedUp, (o) => o.createdAt)) {
    out.push({ day, state: "a_regler", text: plural(rows.length, "commande prête, ni retirée ni annulée", "commandes prêtes, ni retirées ni annulées") });
  }

  // Le plus récent d'abord ; dans une même journée, ce qui demande un geste avant le reste.
  const rank: Record<ProblemState, number> = { a_regler: 0, a_verifier: 1, regle: 2 };
  return out.sort((a, b) => b.day.localeCompare(a.day) || rank[a.state] - rank[b.state]);
}

/**
 * Le rapport des commandes REÇUES dans la fenêtre, avec leur état d'aujourd'hui. Les annulées comptent dans les reçues mais ni
 * dans les plats ni dans les heures de pointe. Les lignes hors fenêtre sont écartées ici aussi : la lecture n'est pas crue sur parole.
 */
export function buildWeeklyReport({ orders, refusals, memberships, now }: ReportInput): WeeklyReport {
  const { fromDay, toDay, sinceIso } = reportWindow(now);
  const inWindow = (iso: string) => Date.parse(iso) >= Date.parse(sinceIso) && Date.parse(iso) <= now.getTime();
  const received = orders.filter((o) => inWindow(o.createdAt));
  const kept = received.filter((o) => o.status !== "annulee");
  const pickedUp = received.filter((o) => o.status === "retiree");
  const delays = received.map((o) => minutesToReady(o.createdAt, o.readyAt)).filter((m): m is number => m !== null);

  return {
    fromDay,
    toDay,
    received: received.length,
    pickedUp: pickedUp.length,
    cancelled: received.length - kept.length,
    pickedUpCents: pickedUp.reduce((n, o) => n + o.totalCents, 0),
    newMembers: memberships === null ? null : newMembersFrom(received, memberships),
    avgReadyMinutes: delays.length === 0 ? null : Math.round(delays.reduce((a, b) => a + b, 0) / delays.length),
    topDishes: topDishesFrom(kept),
    hours: hoursFrom(kept),
    problems: problemsFrom(received, refusals.filter((r) => inWindow(r.createdAt)), now.getTime()),
  };
}
