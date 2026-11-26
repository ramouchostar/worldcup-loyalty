// ADR 0108 §4, ADR 0109 §3 — le restaurant est-il ouvert MAINTENANT selon sa fiche Google ? Logique PURE et testée.
//
// Trois réponses, jamais une supposition : « ouvert » (jusqu'à quand), « fermé » (quand il rouvre), « inconnu ». Fermé comme
// inconnu : aucune commande n'est prise, le panier se garde. Tout se calcule à l'heure de Bruxelles, horaires qui passent
// minuit compris. Les horaires « courants » de la fiche (sept jours, exceptions comprises) passent avant les horaires
// ordinaires, qui ne servent que si les premiers manquent.

import type { HoursBlock, HoursPoint } from "../audit/places";
import { brusselsInstant } from "../mission-cancellation";
import { brusselsDay } from "./order";

export type FicheHours = { businessStatus?: string | null; current?: HoursBlock | null; regular?: HoursBlock | null };

/** Un moment à Bruxelles : le jour (AAAA-MM-JJ), l'heure (HH:MM) et l'instant exact (ISO). */
export type Moment = { day: string; time: string; at: string };

export type Openness =
  | { state: "ouvert"; closes: Moment | null } // `closes` vide : ouvert sans fermeture connue (24 h sur 24)
  | { state: "ferme"; opens: Moment | null } //   `opens` vide : aucune réouverture connue
  | { state: "inconnu" };

/** Le jour suivant ou précédent. Midi : aucun changement d'heure ne fait sauter de jour. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const CLOSED_STATUSES = new Set(["CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY", "FUTURE_OPENING"]);
const MINUTE = 60_000;
const DAY_MINUTES = 1440;

// ─── L'heure « au mur » de Bruxelles ─────────────────────────────────────────
// Un nombre de minutes qui représente l'heure locale (comme si elle était UTC) : on compare des heures de la fiche à des
// heures de la fiche, sans que le changement d'heure s'en mêle.

const wallParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function brusselsWall(now: Date): number {
  const [h, m] = wallParts.format(now).split(":").map(Number);
  return wallOf(brusselsDay(now), h, m);
}

function wallOf(day: string, hour: number, minute: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour, minute) / MINUTE;
}

function momentOf(wall: number): Moment {
  const iso = new Date(wall * MINUTE).toISOString();
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return { day, time, at: brusselsInstant(day, time).toISOString() };
}

const int = (v: unknown, max: number): number | null => (v === undefined ? 0 : typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

/** L'heure d'une borne. Google omet les zéros (`hour: 0`, `minute: 0`) : absent vaut 0 ; hors bornes vaut « illisible ». */
function clock(p: HoursPoint): [number, number] | null {
  const h = int(p.hour, 24);
  const m = int(p.minute, 59);
  return h === null || m === null ? null : [h, m];
}

type Interval = { start: number; end: number; endKnown: boolean };

function datedWall(p: HoursPoint | undefined): number | null {
  const d = p?.date;
  if (!p || !d?.year || !d.month || !d.day) return null;
  const t = clock(p);
  return t ? Date.UTC(d.year, d.month - 1, d.day, t[0], t[1]) / MINUTE : null;
}

/** Les périodes datées des sept prochains jours. `null` : une borne illisible, on ne devine pas. */
function fromDated(periods: NonNullable<HoursBlock["periods"]>): Interval[] | null {
  const out: Interval[] = [];
  for (const p of periods) {
    const start = datedWall(p.open);
    if (start === null) return null;
    if (!p.close) { out.push({ start, end: Infinity, endKnown: false }); continue; }
    const end = datedWall(p.close);
    if (end === null) return null;
    if (end > start) out.push({ start, end, endKnown: !p.close.truncated });
  }
  return out;
}

/** Les périodes ordinaires (jour de semaine, 0 = dimanche), dépliées sur les semaines autour d'aujourd'hui. */
function fromWeekly(periods: NonNullable<HoursBlock["periods"]>, today: string): Interval[] | null {
  // Ouvert 24 h sur 24 : une seule ouverture, jamais de fermeture (représentation documentée par Google).
  if (periods.length === 1 && periods[0].open && !periods[0].close) return [{ start: -Infinity, end: Infinity, endKnown: false }];
  const out: Interval[] = [];
  for (let offset = -7; offset <= 8; offset++) {
    const day = addDays(today, offset);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    for (const p of periods) {
      const openDay = int(p.open?.day, 6);
      const closeDay = int(p.close?.day, 6);
      if (!p.open || !p.close || openDay === null || closeDay === null) return null;
      if (openDay !== weekday) continue;
      const o = clock(p.open);
      const c = clock(p.close);
      if (!o || !c) return null;
      const start = wallOf(day, o[0], o[1]);
      let end = wallOf(addDays(day, (closeDay - openDay + 7) % 7), c[0], c[1]);
      if (end <= start) end += 7 * DAY_MINUTES;
      out.push({ start, end, endKnown: true });
    }
  }
  return out;
}

/** Deux périodes qui se touchent ou se recouvrent n'en font qu'une : « ouvert jusqu'à » dit la vraie fermeture. */
function merge(intervals: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const i of [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) {
      if (i.end > last.end) { last.end = i.end; last.endKnown = i.endKnown; }
    } else out.push({ ...i });
  }
  return out;
}

/** La prochaine ouverture annoncée par Google, quand les périodes ne la donnent pas. */
function announced(nextOpenTime: string | undefined, now: Date): Moment | null {
  const at = nextOpenTime ? Date.parse(nextOpenTime) : NaN;
  return Number.isFinite(at) && at > now.getTime() ? momentOf(brusselsWall(new Date(at))) : null;
}

export function computeOpenness(hours: FicheHours, now: Date = new Date()): Openness {
  if (hours.businessStatus && CLOSED_STATUSES.has(hours.businessStatus)) return { state: "ferme", opens: null };
  const wall = brusselsWall(now);
  for (const [block, dated] of [[hours.current, true], [hours.regular, false]] as const) {
    if (!block) continue;
    const periods = block.periods ?? [];
    if (periods.length === 0) {
      // Aucune période : fermé si la fiche le dit, sinon on ne sait rien de ce bloc.
      if (block.openNow === false) return { state: "ferme", opens: announced(block.nextOpenTime, now) };
      continue;
    }
    const intervals = dated ? fromDated(periods) : fromWeekly(periods, brusselsDay(now));
    // Des horaires courants illisibles ne se remplacent pas par les ordinaires : un jour exceptionnel serait ignoré.
    if (intervals === null) return { state: "inconnu" };
    const merged = merge(intervals);
    const open = merged.find((i) => i.start <= wall && wall < i.end);
    if (open) return { state: "ouvert", closes: open.endKnown ? momentOf(open.end) : null };
    const next = merged.find((i) => i.start > wall);
    return { state: "ferme", opens: next ? momentOf(next.start) : announced(block.nextOpenTime, now) };
  }
  return { state: "inconnu" };
}

/**
 * L'état lu un peu plus tôt, vu à l'instant `now` : une fermeture passée ferme, sans attendre une nouvelle lecture. Une
 * ouverture passée reste « fermé » : seule une nouvelle lecture de la fiche rouvre.
 */
export function opennessAt(o: Openness, now: Date = new Date()): Openness {
  return o.state === "ouvert" && o.closes && now.getTime() >= Date.parse(o.closes.at) ? { state: "ferme", opens: null } : o;
}

/** L'instant où l'état lu cesse d'être sûr (fermeture ou ouverture annoncée) : la page relit alors la fiche. */
export function nextChange(o: Openness): string | null {
  if (o.state === "ouvert") return o.closes?.at ?? null;
  return o.state === "ferme" ? (o.opens?.at ?? null) : null;
}

// ─── Les phrases ─────────────────────────────────────────────────────────────

const weekdayName = new Intl.DateTimeFormat("fr-BE", { weekday: "long", timeZone: "UTC" });
const dateName = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });

/** « à 11:00 », « demain à 11:00 », « mardi à 11:00 », « le 25 décembre à 11:00 ». */
function when(m: Moment, now: Date): string {
  const today = brusselsDay(now);
  if (m.day === today) return `à ${m.time}`;
  if (m.day === addDays(today, 1)) return `demain à ${m.time}`;
  const noon = new Date(`${m.day}T12:00:00Z`);
  return m.day > today && m.day < addDays(today, 7) ? `${weekdayName.format(noon)} à ${m.time}` : `le ${dateName.format(noon)} à ${m.time}`;
}

export const OPENNESS_TITLE: Record<Openness["state"], string> = {
  ouvert: "Ouvert maintenant",
  ferme: "Fermé pour le moment",
  inconnu: "Horaires non vérifiés",
};

/** Ce qui suit le titre : « jusqu'à 22:00 », « ouvre demain à 11:00 ». `null` : rien à ajouter, on n'invente pas d'heure. */
export function opennessDetail(o: Openness, now: Date = new Date()): string | null {
  if (o.state === "ouvert") {
    if (!o.closes) return null;
    // Une fermeture dans les 24 heures se dit par son heure seule, même après minuit.
    return Date.parse(o.closes.at) - now.getTime() <= DAY_MINUTES * MINUTE ? `jusqu'à ${o.closes.time}` : `ferme ${when(o.closes, now)}`;
  }
  if (o.state === "ferme") return o.opens ? `ouvre ${when(o.opens, now)}` : null;
  return null;
}

export type OpeningRefusal = { code: "ferme" | "horaires_inconnus"; message: string };

/** Pourquoi une commande ne peut pas partir maintenant ; `null` quand le restaurant est ouvert. La même règle sert à la page et au serveur. */
export function openingRefusal(o: Openness, now: Date = new Date()): OpeningRefusal | null {
  if (o.state === "ouvert") return null;
  if (o.state === "ferme") {
    const detail = opennessDetail(o, now);
    return { code: "ferme", message: `Le restaurant est fermé pour le moment${detail ? `, il ${detail}` : ""}. Ton panier est gardé.` };
  }
  return { code: "horaires_inconnus", message: "On ne peut pas vérifier les horaires du restaurant. Appelle-le pour commander. Ton panier est gardé." };
}
