// ============================================================
// Signal « événements locaux » — agenda de visit.brussels (agenda.brussels,
// données ouvertes de la Région de Bruxelles-Capitale ; backlog plateforme
// « API événements », ADR 0074 §8).
//
// Module PUR : aucun réseau, aucune base, aucune horloge. Il (1) transforme la
// réponse de l'API en occurrences normalisées (un événement × un jour, heures
// de Bruxelles converties en UTC), (2) décide lesquelles méritent d'être
// gardées, (3) sélectionne celles qui concernent UN établissement, par code
// postal ou par distance.
//
// Rien ici ne copie les e-mails ni les téléphones que l'API publie.
// Rien ici n'atteint un membre (ADR 0007).
// ============================================================

import { brusselsTime } from "./football";

export const SOURCE_VISIT_BRUSSELS = "visitbrussels";

export type LocalEventCategory =
  | "concert" | "spectacle" | "theatre" | "festival" | "fete" | "brocante" | "foire" | "sport" | "cinema" | "expo" | "autre";

export type LocalEvent = {
  source: string;
  /** « <id de l'événement>:<jour>T<heure de début> » : une occurrence (séance). */
  externalId: string;
  eventId: string;
  name: string;
  category: LocalEventCategory;
  /** Valeur d'origine de la source (sub_type). */
  sourceCategory: string | null;
  /** Jour calendaire à Bruxelles, AAAA-MM-JJ. */
  day: string;
  startsAt: string | null; // ISO UTC
  endsAt: string | null;
  doorsAt: string | null;
  nightLifeUntil: string | null;
  venueName: string | null;
  venueZip: string | null;
  venueCity: string | null;
  lat: number | null;
  lng: number | null;
  isHighCapacity: boolean;
  isFree: boolean;
  isCanceled: boolean;
  isSoldout: boolean;
  /** 0 à 2 ; reflète surtout le prestige du lieu, pas la taille de l'événement. */
  ranking: number | null;
  url: string | null;
};

// ── Heure de Bruxelles → instant UTC ────────────────────────────────────────

/**
 * « 2026-10-08 » + « 20:30:00 » à Bruxelles → ISO UTC. Tient compte du
 * changement d'heure : on essaie UTC+2 puis UTC+1 et on garde celui qui
 * redonne exactement l'heure demandée. Une heure qui n'existe pas (saut du
 * printemps) retombe sur UTC+1.
 */
export function brusselsLocalToUtc(day: string, time: string): string | null {
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const wanted = `${t[1]}:${t[2]}`;
  const base = Date.parse(`${day}T${wanted}:00Z`);
  if (Number.isNaN(base)) return null;
  for (const offsetH of [2, 1]) {
    const utc = new Date(base - offsetH * 3_600_000);
    const b = brusselsTime(utc);
    if (b.date === day && b.time === wanted) return utc.toISOString();
  }
  return new Date(base - 3_600_000).toISOString();
}

function addOneDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// ── Lecture de la réponse ───────────────────────────────────────────────────

/** « <événement>:<jour>T<heure> », suffixé « #2 », « #3 »… si la clé se répète. */
function occurrenceKey(eventId: string, day: string, start: string | null, seen: Map<string, number>): string {
  const base = `${eventId}:${day}${start ? `T${start.slice(0, 5)}` : ""}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

const CATEGORY_MAP: Record<string, LocalEventCategory> = {
  concert: "concert",
  show: "spectacle",
  theatre: "theatre",
  festival: "festival",
  party: "fete",
  brocante: "brocante",
  foire: "foire",
  sport: "sport",
  movie: "cinema",
  expo: "expo",
};

function str(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x : null;
}
function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
type Tr = Record<string, unknown> | undefined;
function pick(tr: Record<string, Tr> | undefined, key: string): string | null {
  return str(tr?.fr?.[key]) ?? str(tr?.nl?.[key]) ?? str(tr?.en?.[key]);
}

export type ParseWindow = { from: string; to: string };

/**
 * Occurrences de la réponse de `GET /events`, dans la fenêtre [from, to] (jours
 * à Bruxelles, bornes comprises). Écarte les événements permanents (expositions
 * ouvertes toute l'année), ceux sans nom, et les jours hors fenêtre. Ne garde
 * AUCUNE donnée personnelle (e-mails, téléphones).
 */
export function parseVisitBrusselsEvents(raw: unknown, window: ParseWindow): LocalEvent[] {
  const list = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null;
  if (!Array.isArray(list)) return [];
  const out: LocalEvent[] = [];

  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    if (e.is_permanent === true) continue;
    const id = typeof e.id === "number" || typeof e.id === "string" ? String(e.id) : null;
    const tr = e.translations as Record<string, Tr> | undefined;
    const name = pick(tr, "name");
    const dates = Array.isArray(e.dates) ? (e.dates as unknown[]) : [];
    if (!id || !name || dates.length === 0) continue;

    const place = (e.place ?? null) as Record<string, unknown> | null;
    const ptr = place?.translations as Record<string, Tr> | undefined;
    const loc = (place?.location ?? null) as Record<string, unknown> | null;
    const sub = str(e.sub_type);
    const url = pick(tr, "agenda_url");
    // Un événement peut avoir plusieurs séances le même jour (15 h et 20 h 30) :
    // l'identifiant d'occurrence porte l'heure de début, et un numéro si deux
    // séances partageaient encore la même clé. Il doit être unique : la base
    // refuse deux lignes identiques dans un même lot d'écriture.
    const seen = new Map<string, number>();

    for (const d of dates) {
      if (!d || typeof d !== "object") continue;
      const dd = d as Record<string, unknown>;
      const day = str(dd.day);
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < window.from || day > window.to) continue;

      const start = str(dd.start);
      const end = str(dd.end);
      const nl = str(dd.end_night_life);
      // Une fin avant le début (« 22:00 → 01:00 ») tombe le lendemain.
      const after = (t: string | null): string | null => {
        if (!t) return null;
        const crosses = start !== null && t < start;
        return brusselsLocalToUtc(crosses ? addOneDay(day) : day, t);
      };

      out.push({
        source: SOURCE_VISIT_BRUSSELS,
        externalId: occurrenceKey(id, day, start, seen),
        eventId: id,
        name,
        category: (sub && CATEGORY_MAP[sub]) || "autre",
        sourceCategory: sub,
        day,
        startsAt: start ? brusselsLocalToUtc(day, start) : null,
        endsAt: after(end),
        doorsAt: dd.doors ? brusselsLocalToUtc(day, String(dd.doors)) : null,
        nightLifeUntil: after(nl),
        venueName: pick(ptr, "name"),
        venueZip: pick(ptr, "address_zip"),
        venueCity: pick(ptr, "address_city"),
        lat: num(loc?.lat),
        lng: num(loc?.lon),
        isHighCapacity: e.is_high_capacity === true,
        isFree: e.is_free === true,
        isCanceled: e.is_canceled === true || dd.is_canceled === true,
        isSoldout: e.is_soldout === true || dd.is_soldout === true,
        ranking: num(e.ranking),
        url,
      });
    }
  }
  return out;
}

// ── Ce qui mérite d'être gardé ──────────────────────────────────────────────

// Catégories qui sont des événements en soi. « autre » (ateliers, conférences,
// permanences) représente 80 % des occurrences et presque tout n'a aucun effet
// sur un restaurant : on ne le garde que s'il est important.
const NOTABLE_CATEGORIES = new Set<LocalEventCategory>(["concert", "spectacle", "theatre", "festival", "fete", "brocante", "foire"]);
// Formations, visites guidées, réunions : jamais, même bien classées (sauf grande salle).
const NEVER_KEEP = new Set(["training", "tour", "meeting"]);

/**
 * Seuil de classement à partir duquel une catégorie « autre », cinéma, sport ou
 * expo est gardée. Mesuré sur la première synchro réelle (2026-10-06) : entre 1
 * et 2, ce sont des bibliothèques, des centres communautaires et un cinéma de
 * quartier (1 647 séances de bruit) ; à 2, ce sont l'Ancienne Belgique, Bozar,
 * Flagey, le Cirque Royal et La Monnaie (436 séances de vraies salles de soirée).
 */
export const RANKING_KEEP_THRESHOLD = 2;

export function isNotable(e: LocalEvent): boolean {
  if (e.isHighCapacity) return true;
  if (e.sourceCategory && NEVER_KEEP.has(e.sourceCategory)) return false;
  if (NOTABLE_CATEGORIES.has(e.category)) return true;
  return (e.ranking ?? 0) >= RANKING_KEEP_THRESHOLD;
}

// ── Sélection pour un établissement ─────────────────────────────────────────

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Où se situe l'établissement : codes postaux et/ou point + rayon (quand les coordonnées existeront). */
export type Nearby = {
  zips?: string[];
  center?: { lat: number; lng: number };
  radiusKm?: number;
};

export type LocalSelectionInput = {
  events: LocalEvent[];
  /** Jour d'aujourd'hui à Bruxelles, AAAA-MM-JJ (injecté). */
  today: string;
  near: Nearby;
  /** Jours d'anticipation (défaut 7). */
  horizonDays?: number;
  categories?: LocalEventCategory[];
  /** Grande salle seulement. */
  highCapacityOnly?: boolean;
  /** Événements annulés : écartés par défaut. */
  includeCanceled?: boolean;
};

export type LocalMatchReason = "code_postal" | "distance";

export type LocalMatch = {
  event: LocalEvent;
  daysUntil: number;
  reasons: LocalMatchReason[];
  distanceKm: number | null;
  /** Début à 18 h ou après, heure de Bruxelles. */
  isEvening: boolean;
  /** Se prolonge après minuit ou finit à 23 h ou plus tard (fin d'événement ou fin de soirée). */
  runsLate: boolean;
};

export const DEFAULT_HORIZON_DAYS = 7;
const DEFAULT_RADIUS_KM = 1.5;

export function selectLocalEvents(input: LocalSelectionInput): LocalMatch[] {
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = dayNumber(input.today);
  const zips = new Set((input.near.zips ?? []).map((z) => z.trim()).filter(Boolean));
  const center = input.near.center;
  const radius = input.near.radiusKm ?? DEFAULT_RADIUS_KM;
  const cats = input.categories?.length ? new Set(input.categories) : null;
  const out: LocalMatch[] = [];

  for (const e of input.events) {
    if (e.isCanceled && !input.includeCanceled) continue;
    if (input.highCapacityOnly && !e.isHighCapacity) continue;
    if (cats && !cats.has(e.category)) continue;
    const daysUntil = dayNumber(e.day) - today;
    if (daysUntil < 0 || daysUntil > horizon) continue;

    const reasons: LocalMatchReason[] = [];
    if (e.venueZip && zips.has(e.venueZip)) reasons.push("code_postal");
    let dist: number | null = null;
    if (center && e.lat !== null && e.lng !== null) {
      dist = distanceKm(center, { lat: e.lat, lng: e.lng });
      if (dist <= radius) reasons.push("distance");
    }
    if (reasons.length === 0) continue;

    const start = e.startsAt ? brusselsTime(e.startsAt) : null;
    const lastInstant = e.nightLifeUntil ?? e.endsAt;
    const last = lastInstant ? brusselsTime(lastInstant) : null;
    out.push({
      event: e,
      daysUntil,
      reasons,
      distanceKm: dist,
      isEvening: start !== null && start.hour >= 18,
      runsLate: last !== null && (last.date > e.day || last.hour >= 23),
    });
  }

  return out.sort(
    (a, b) =>
      a.event.day.localeCompare(b.event.day) ||
      Number(b.event.isHighCapacity) - Number(a.event.isHighCapacity) ||
      (b.event.ranking ?? 0) - (a.event.ranking ?? 0) ||
      (a.event.startsAt ?? "").localeCompare(b.event.startsAt ?? "") ||
      a.event.externalId.localeCompare(b.event.externalId)
  );
}
