// L'espace Marketing de la console (ADR 0104 §1, maquette validée le 2026-11-15 :
// https://claude.ai/artifact/MWBkdi6Ffqrn1tY63m4qFC). Logique PURE et testée : la lecture vit
// dans lib/marketing-space-data.ts, l'affichage dans app/admin/[restaurantId]/marketing.
// Euros permis : c'est le chiffre du restaurateur, en console (ADR 0007 ne protège que le membre).

import type { AssistantId } from "./agents/types";

// ── La recommandation de la semaine ──────────────────────────

/** Les assistants dont les idées sont du marketing (faire venir, faire revenir, Google). */
export const MARKETING_ASSISTANTS: AssistantId[] = ["hugo", "emma", "louis", "max"];

export type Fact = { value: string; label: string };

export type Recommendation = {
  kind: "idee" | "jour_calme" | "premiere_pub" | "annonce";
  /** L'assistant qui la porte (son portrait sur la carte) ; null = la recommandation vient des chiffres. */
  assistant: AssistantId | null;
  /** D'où elle vient, en clair (« d'après tes ventes des 8 dernières semaines »). */
  basis: string;
  title: string;
  facts: Fact[];
  cta: { label: string; href: string };
};

export type MarketingIdea = {
  id: string;
  assistant: AssistantId;
  title: string;
  question: string;
  lines: { what: string; who: string; cost: string };
};

export type RevenueDay = { day: string; amount: number | null; closed: boolean };

export const QUIET_WINDOW_DAYS = 56;
export const QUIET_MIN_NOTED_DAYS = 28;
export const QUIET_MIN_PER_WEEKDAY = 3;
/** Écart sous la moyenne à partir duquel un jour est « calme » (ADR 0104 §1). */
export const QUIET_MIN_GAP = 0.15;
/** Sans annonce depuis tant de jours, on en propose une. */
export const ANNOUNCE_AFTER_DAYS = 14;

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export type QuietDay = { weekday: number; name: string; average: number; overall: number; gap: number; notedDays: number };

/**
 * Le jour de la semaine le plus calme sur les 8 dernières semaines (aujourd'hui exclu) :
 * au moins 28 jours notés, au moins 3 de chaque jour comparé, et 15 % sous la moyenne.
 * Un jour fermé ou sans chiffre ne compte pas (jamais 0 €). Sinon `null`.
 */
export function quietestDay(days: RevenueDay[], today: string): QuietDay | null {
  const from = addDays(today, -QUIET_WINDOW_DAYS);
  const noted = days.filter((d) => d.day >= from && d.day < today && !d.closed && typeof d.amount === "number" && d.amount > 0);
  if (noted.length < QUIET_MIN_NOTED_DAYS) return null;
  const byWeekday = new Map<number, number[]>();
  for (const d of noted) {
    const w = weekdayOf(d.day);
    byWeekday.set(w, [...(byWeekday.get(w) ?? []), d.amount as number]);
  }
  const overall = noted.reduce((s, d) => s + (d.amount as number), 0) / noted.length;
  let best: QuietDay | null = null;
  for (const [w, list] of byWeekday) {
    if (list.length < QUIET_MIN_PER_WEEKDAY) continue;
    const average = list.reduce((s, x) => s + x, 0) / list.length;
    const gap = average / overall - 1;
    if (!best || gap < best.gap) best = { weekday: w, name: WEEKDAYS[w], average, overall, gap, notedDays: noted.length };
  }
  return best && best.gap <= -QUIET_MIN_GAP ? best : null;
}

export type RecoInput = {
  base: string;
  restaurantName: string;
  today: string;
  ideas: MarketingIdea[];
  revenue: RevenueDay[] | null;
  /** Clients d'accord pour recevoir une promo (null = lecture impossible). */
  promoReachable: number | null;
  /** La Pub est ouverte pour cet établissement. */
  pubOpen: boolean;
  /** Une pub a déjà été demandée (quel que soit son état, hors annulée). */
  pubEver: boolean;
  /** Jour de la dernière annonce envoyée (null = aucune connue). */
  lastAnnouncement: string | null;
};

/** L'annonce préremplie pour un jour calme : le restaurateur n'a plus qu'à écrire son offre. */
export function quietDayMessage(day: QuietDay, restaurantName: string): string {
  const cap = day.name.charAt(0).toUpperCase() + day.name.slice(1);
  return `${cap} chez ${restaurantName} : `;
}

/**
 * La seule grande recommandation du haut (ADR 0104 §1) : d'abord une idée marketing de la
 * brigade à décider aujourd'hui (la décision se prend sur « Idées », ADR 0054), sinon ce que
 * disent les chiffres. Rien d'honnête à proposer → `null`, jamais une recommandation inventée.
 */
export function recommend(i: RecoInput): Recommendation | null {
  const idea = i.ideas.find((x) => MARKETING_ASSISTANTS.includes(x.assistant));
  if (idea) {
    return {
      kind: "idee",
      assistant: idea.assistant,
      basis: "a une idée pour toi aujourd'hui",
      title: idea.title,
      facts: [
        { value: idea.lines.what, label: "quoi" },
        { value: idea.lines.who, label: "pour qui" },
        { value: idea.lines.cost, label: "combien" },
      ],
      cta: { label: "Voir l'idée", href: `${i.base}/idees` },
    };
  }

  const quiet = i.revenue ? quietestDay(i.revenue, i.today) : null;
  if (quiet && i.promoReachable !== null && i.promoReachable > 0) {
    const q = new URLSearchParams({ prefill: quietDayMessage(quiet, i.restaurantName) });
    return {
      kind: "jour_calme",
      assistant: "hugo",
      basis: `d'après ton chiffre des ${Math.round(QUIET_WINDOW_DAYS / 7)} dernières semaines`,
      title: `Le ${quiet.name} est ton jour le plus calme. Remplis-le avec une annonce la veille.`,
      facts: [
        { value: `${Math.round(quiet.gap * 100)} %`, label: `le ${quiet.name} face à ta moyenne` },
        { value: String(i.promoReachable), label: "clients à qui l'envoyer" },
        { value: "0 €", label: "ça ne coûte rien" },
      ],
      cta: { label: "Préparer l'annonce", href: `${i.base}/broadcast?${q.toString()}` },
    };
  }

  if (i.pubOpen && !i.pubEver) {
    return {
      kind: "premiere_pub",
      assistant: "emma",
      basis: "s'occupe des pubs autour du resto",
      title: "Fais-toi connaître autour du resto avec une première pub.",
      facts: [
        { value: "3 km", label: "autour du resto" },
        { value: "10 à 15 €", label: "par jour, conseillé" },
        { value: "100 €", label: "pour commencer" },
      ],
      cta: { label: "Préparer la pub", href: `${i.base}/pub/nouvelle` },
    };
  }

  const silent = !i.lastAnnouncement || i.lastAnnouncement < addDays(i.today, -ANNOUNCE_AFTER_DAYS);
  if (silent && i.promoReachable !== null && i.promoReachable > 0) {
    return {
      kind: "annonce",
      assistant: "hugo",
      basis: i.lastAnnouncement ? `ta dernière annonce date du ${dayFr(i.lastAnnouncement)}` : "tu n'as encore envoyé aucune annonce",
      title: "Tes clients n'ont pas eu de nouvelles depuis un moment. Donne-leur une raison de revenir.",
      facts: [
        { value: String(i.promoReachable), label: "clients à qui l'envoyer" },
        { value: "2 min", label: "pour l'écrire" },
        { value: "0 €", label: "ça ne coûte rien" },
      ],
      cta: { label: "Écrire une annonce", href: `${i.base}/broadcast` },
    };
  }
  return null;
}

export const dayFr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });

// ── Ce que les annonces ont donné ────────────────────────────

export type Announcement = { day: string; message: string; recipients: number };
export type AnnouncementResult = Announcement & {
  /** Tickets du programme le jour de l'annonce et les deux suivants. */
  after: number;
  /** Les mêmes trois jours, une semaine plus tôt. */
  before: number;
  /** Les trois jours ne sont pas encore tous passés. */
  partial: boolean;
};

/**
 * Chaque annonce face à la semaine d'avant : tickets validés du jour J à J+2, comparés à
 * J-7 à J-5. On montre ce qui s'est passé, jamais un effet attribué (ADR 0064).
 */
export function announcementResults(announcements: Announcement[], ticketDays: string[], today: string): AnnouncementResult[] {
  const count = (from: string, to: string) => ticketDays.filter((d) => d >= from && d <= to).length;
  return [...announcements]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((a) => ({
      ...a,
      after: count(a.day, addDays(a.day, 2)),
      before: count(addDays(a.day, -7), addDays(a.day, -5)),
      partial: addDays(a.day, 2) >= today,
    }));
}

/** Regroupe le journal d'envoi (une ligne par membre) en annonces : même jour, même texte. */
export function groupAnnouncements(rows: { day: string; message: string | null }[]): Announcement[] {
  const map = new Map<string, Announcement>();
  for (const r of rows) {
    const message = (r.message ?? "").trim();
    if (!message) continue;
    const key = `${r.day}|${message}`;
    const a = map.get(key) ?? { day: r.day, message, recipients: 0 };
    a.recipients++;
    map.set(key, a);
  }
  return [...map.values()];
}

/** Résumé en tête de page : ce mois-ci, en une phrase. */
export function monthSummary(s: { actions: number; reached: number | null; vouchersRedeemed: number }): string | null {
  const parts: string[] = [];
  if (s.actions > 0) parts.push(`${s.actions} action${s.actions > 1 ? "s" : ""} lancée${s.actions > 1 ? "s" : ""}`);
  if (s.reached && s.reached > 0) parts.push(`${s.reached.toLocaleString("fr-BE")} personnes touchées autour du resto`);
  if (s.vouchersRedeemed > 0) parts.push(`${s.vouchersRedeemed} bon${s.vouchersRedeemed > 1 ? "s" : ""} de pub utilisé${s.vouchersRedeemed > 1 ? "s" : ""} en caisse`);
  if (parts.length === 0) return null;
  const last = parts.pop() as string;
  return `Ce mois-ci : ${parts.length ? `${parts.join(", ")} et ${last}` : last}.`;
}

