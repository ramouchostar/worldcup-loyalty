// ADR 0110 — les offres de la page de commande : leurs formes, leurs règles et les phrases qui disent quand elles valent.
// Logique PURE et testée, partagée par la page du client, la console, la commande et les articles automatiques.
//
// Une offre se MONTRE, elle ne change aucun prix : la remise se fait à la main au comptoir. Elle est écrite par le gérant ou
// le manager, publiée avec un « Oui », ne se modifie plus ensuite, et vaut des jours entiers (jour de Bruxelles).

import { offerWindow } from "../ads/vouchers";

export const TITLE_MAX = 80;
export const CONDITIONS_MAX = 280;
/** Défauts de produit à confirmer (ADR 0110) : trois offres le même jour au plus, trente et un jours au plus. */
export const MAX_AT_ONCE = 3;
export const MAX_DAYS = 31;

export type OfferState = "brouillon" | "publiee" | "arretee";

export const STOP_REASONS = ["stock", "equipe", "erreur", "autre"] as const;
export type StopReason = (typeof STOP_REASONS)[number];
export const STOP_LABEL: Record<StopReason, string> = {
  stock: "Plus de stock",
  equipe: "L'équipe n'était pas au courant",
  erreur: "Erreur dans l'offre",
  autre: "Autre raison",
};
export const isStopReason = (v: unknown): v is StopReason => typeof v === "string" && (STOP_REASONS as readonly string[]).includes(v);

export type OfferAnswer = "appliquee" | "pas_appliquee";
export const isOfferAnswer = (v: unknown): v is OfferAnswer => v === "appliquee" || v === "pas_appliquee";

export type OfferRow = {
  id: string;
  restaurant_id: string;
  title: string;
  conditions: string | null;
  menu_item_id: string | null;
  first_day: string;
  last_day: string;
  /** 1 = lundi … 7 = dimanche ; `null` = tous les jours. */
  weekdays: number[] | null;
  state: OfferState;
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  stopped_by: string | null;
  stopped_at: string | null;
  stop_reason: StopReason | null;
  copied_from: string | null;
  updated_at: string;
};

/** Ce qui suffit à dire quand une offre vaut. */
export type OfferDays = Pick<OfferRow, "first_day" | "last_day" | "weekdays">;

// ─── Les jours ───────────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Un jour qui existe (« 2026-02-30 » n'en est pas un). */
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().startsWith(v);

const nextDay = (day: string, n = 1): string => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** 1 = lundi … 7 = dimanche. */
export const weekdayOf = (day: string): number => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

const onWeekday = (o: OfferDays, day: string): boolean => o.weekdays === null || o.weekdays.includes(weekdayOf(day));

/** L'offre vaut-elle ce jour-là ? Dates (bornes comprises, `offerWindow`) ET jour de la semaine. L'état n'est pas regardé. */
export const coversDay = (o: OfferDays, day: string): boolean => offerWindow({ from: o.first_day, to: o.last_day }, day) === "ouverte" && onWeekday(o, day);

/** Les jours où l'offre vaut, entre deux bornes comprises (31 jours au plus à parcourir). */
export function validDays(o: OfferDays, from: string = o.first_day, to: string = o.last_day): string[] {
  const out: string[] = [];
  let day = from > o.first_day ? from : o.first_day;
  const end = to < o.last_day ? to : o.last_day;
  for (let i = 0; day <= end && i < 400; i++, day = nextDay(day)) if (onWeekday(o, day)) out.push(day);
  return out;
}

export const firstValidDay = (o: OfferDays): string => validDays(o)[0] ?? o.first_day;
export const lastValidDay = (o: OfferDays): string => validDays(o).at(-1) ?? o.last_day;

/** Publiée et valable ce jour-là. */
export const isLiveOn = (o: OfferDays & Pick<OfferRow, "state">, day: string): boolean => o.state === "publiee" && coversDay(o, day);

/** Le plat lié (s'il y en a un) est-il proposé à la commande ? */
const dishOk = (o: Pick<OfferRow, "menu_item_id">, orderable: ReadonlySet<string>): boolean => o.menu_item_id === null || orderable.has(o.menu_item_id);

/** Ce que le client voit ce jour-là : les offres valables, le plat commandable, celle qui finit le plus tôt d'abord, trois au plus. */
export function visibleOffers<T extends OfferRow>(offers: readonly T[], day: string, orderable: ReadonlySet<string>): T[] {
  return offers
    .filter((o) => isLiveOn(o, day) && dishOk(o, orderable))
    .sort((a, b) => lastValidDay(a).localeCompare(lastValidDay(b)) || (a.published_at ?? "").localeCompare(b.published_at ?? "") || a.id.localeCompare(b.id))
    .slice(0, MAX_AT_ONCE);
}

/** Le premier jour où publier `candidate` ferait plus de trois offres ; `null` si elle peut paraître. */
export function crowdedDay(candidate: OfferRow, others: readonly OfferRow[], today: string): string | null {
  const published = others.filter((o) => o.id !== candidate.id && o.state === "publiee");
  return validDays(candidate, today).find((day) => published.filter((o) => coversDay(o, day)).length >= MAX_AT_ONCE) ?? null;
}

/** L'état que la console montre : les trois états enregistrés, et ce qui se déduit des dates et de la carte. */
export type OfferPhase = "brouillon" | "a_venir" | "en_cours" | "masquee" | "terminee" | "arretee";

export function offerPhase(o: OfferRow, today: string, orderable: ReadonlySet<string>): OfferPhase {
  if (o.state === "brouillon") return "brouillon";
  if (o.state === "arretee") return "arretee";
  if (lastValidDay(o) < today) return "terminee";
  if (!dishOk(o, orderable)) return "masquee";
  return firstValidDay(o) > today ? "a_venir" : "en_cours";
}

/** Pourquoi l'article qui annonce cette offre ne peut pas se lire (ou se publier) ; `null` s'il le peut. */
export type ArticleProblem = "promo_finie" | "promo_plat" | "promo_pas_aujourdhui";

/**
 * `needToday` : publier demande que l'offre vaille aujourd'hui ; lire un article déjà en ligne demande seulement qu'elle
 * ne soit ni arrêtée, ni finie, ni masquée (il dit lui-même ses jours).
 */
export function articleProblem(o: OfferRow | null, today: string, orderable: ReadonlySet<string>, needToday: boolean): ArticleProblem | null {
  if (!o || o.state !== "publiee" || lastValidDay(o) < today) return "promo_finie";
  if (!dishOk(o, orderable)) return "promo_plat";
  return needToday && !coversDay(o, today) ? "promo_pas_aujourdhui" : null;
}

/** Ce que le restaurateur lit quand l'article d'une offre ne peut pas paraître. */
export const OFFER_ARTICLE_PROBLEM: Record<ArticleProblem, string> = {
  promo_finie: "L'offre de cet article est arrêtée ou terminée : il ne peut plus paraître.",
  promo_plat: "Le plat de l'offre n'est plus proposé à la commande : tes clients ne voient pas l'offre, l'article ne peut pas paraître.",
  promo_pas_aujourdhui: "L'offre de cet article ne vaut pas aujourd'hui : publie-le un jour où elle vaut.",
};

// ─── Les phrases ─────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
const monthDay = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });
/** « 12 décembre » ; le premier du mois s'écrit « 1er ». */
export const dayName = (day: string): string => monthDay.format(new Date(`${day}T12:00:00Z`)).replace(/^1 /, "1er ");
const dayNumber = (day: string): string => (day.endsWith("-01") ? "1er" : String(Number(day.slice(8))));

const list = (items: string[]): string => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`);

/** « chaque mardi », « chaque lundi, mardi et jeudi » ; `null` quand elle vaut tous les jours. */
export function weekdaysPhrase(weekdays: number[] | null): string | null {
  if (weekdays === null || weekdays.length === 0 || weekdays.length >= 7) return null;
  return `chaque ${list([...weekdays].sort((a, b) => a - b).map((n) => WEEKDAY_NAMES[n - 1]))}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Du 1er au 12 décembre inclus, chaque mardi » ou « Le 3 décembre ». */
export function whenLong(o: OfferDays): string {
  if (o.first_day === o.last_day) return `Le ${dayName(o.first_day)}`;
  const from = o.first_day.slice(0, 7) === o.last_day.slice(0, 7) ? dayNumber(o.first_day) : dayName(o.first_day);
  const days = weekdaysPhrase(o.weekdays);
  return `Du ${from} au ${dayName(o.last_day)} inclus${days ? `, ${days}` : ""}`;
}

/** La ligne sous le titre, vue ce jour-là : « Aujourd'hui seulement », « Jusqu'au 12 décembre inclus ». */
export function whenShort(o: OfferDays, today: string): string {
  const last = lastValidDay(o);
  if (last === today) return "Aujourd'hui seulement";
  if (firstValidDay(o) === last) return `Le ${dayName(last)} seulement`;
  const days = weekdaysPhrase(o.weekdays);
  return days ? `${cap(days)}, jusqu'au ${dayName(last)}` : `Jusqu'au ${dayName(last)} inclus`;
}

/** Ce que la page du client reçoit d'une offre : rien d'interne (ni auteur, ni état). */
export type PublicOffer = { id: string; title: string; conditions: string | null; itemId: string | null; short: string; long: string };

export const publicOffer = (o: OfferRow, today: string): PublicOffer => ({
  id: o.id, title: o.title, conditions: o.conditions, itemId: o.menu_item_id, short: whenShort(o, today), long: whenLong(o),
});

// ─── La saisie ───────────────────────────────────────────────────────────────

/** ADR 0110 §2 — « point », « coupon », « cadeau » et « code promo » appartiennent au programme de fidélité. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bpoints?\b/, "point"],
  [/\bcoupons?\b/, "coupon"],
  [/\bcadeaux?\b/, "cadeau"],
  [/\bcodes?[\s-]*promo(?:tion(?:nel(?:le)?)?)?s?\b/, "code promo"],
];

const fold = (s: string) => s.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase();

/** Le premier mot interdit trouvé, ou `null`. */
export function forbiddenWord(text: string): string | null {
  const s = fold(text);
  return FORBIDDEN.find(([re]) => re.test(s))?.[1] ?? null;
}

const clean = (v: string) => v.replace(/[<>\u0000-\u001f\u007f]/g, " ").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isOfferId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type OfferFields = Pick<OfferRow, "title" | "conditions" | "menu_item_id" | "first_day" | "last_day" | "weekdays">;
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const no = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Relit une offre saisie sans rien croire. Chaque refus dit quoi corriger. */
export function checkOfferFields(raw: unknown, today: string): Checked<OfferFields> {
  if (typeof raw !== "object" || raw === null) return no("Requête invalide.");
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? clean(r.title) : "";
  if (title === "") return no("Donne un titre à ton offre.");
  if (title.length > TITLE_MAX) return no(`Le titre tient en ${TITLE_MAX} caractères.`);
  const conditions = typeof r.conditions === "string" ? clean(r.conditions) : "";
  if (conditions.length > CONDITIONS_MAX) return no(`Les conditions tiennent en ${CONDITIONS_MAX} caractères.`);
  const word = forbiddenWord(title) ?? forbiddenWord(conditions);
  if (word) return no(`Retire le mot « ${word} » : les points, les cadeaux et les coupons appartiennent au programme de fidélité.`);
  const item = r.itemId === null || r.itemId === undefined || r.itemId === "" ? null : r.itemId;
  if (item !== null && !isOfferId(item)) return no("Ce plat n'est pas lisible : choisis-le de nouveau.");
  if (!isDay(r.firstDay) || !isDay(r.lastDay)) return no("Choisis le premier et le dernier jour.");
  if (r.lastDay < r.firstDay) return no("Le dernier jour doit venir après le premier.");
  if (r.lastDay < today) return no("Le dernier jour est déjà passé.");
  if (r.lastDay > nextDay(r.firstDay, MAX_DAYS - 1)) return no(`Une offre dure ${MAX_DAYS} jours au plus.`);
  const days = Array.isArray(r.weekdays) ? [...new Set(r.weekdays.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b) : [];
  if (Array.isArray(r.weekdays) && days.length === 0) return no("Coche au moins un jour de la semaine.");
  const value: OfferFields = {
    title, conditions: conditions || null, menu_item_id: item as string | null, first_day: r.firstDay, last_day: r.lastDay,
    weekdays: days.length === 0 || days.length === 7 ? null : days,
  };
  if (validDays(value, today).length === 0) return no("Aucun des jours cochés ne tombe entre ces deux dates.");
  return { ok: true, value };
}
