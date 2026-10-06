// ============================================================
// Signal « grands événements sportifs » — calendrier saisi à la main
// (migration 20261006-0500, kind `sport_event` de `reference_calendar`).
//
// Module PUR : aucun accès base, aucune horloge (la date du jour est injectée).
// Il lit les lignes du calendrier et dit, pour UN établissement, quels
// événements à venir ou en cours concernent sa clientèle. Il ne choisit PAS
// l'action : c'est le rôle du moteur du copilote (ADR 0074 §8).
//
// Complète les signaux qui viennent d'API (lib/signals/football.ts) : ici, les
// événements dont la date est fixée des mois à l'avance et qui sont peu
// nombreux (Jeux, finales, classiques, soirées de combat annoncées).
//
// Rien ici n'atteint un membre (ADR 0007).
// ============================================================

import { brusselsTime, type BrusselsTime } from "./football";

export type SportEventRow = {
  starts_on: string; // AAAA-MM-JJ
  ends_on: string;
  label: string;
  sport: string;
  /** Coup d'envoi précis (ISO UTC) ; nul = seule la date est sûre. */
  starts_at: string | null;
  /** Communautés mobilisées (ISO-2) ; vide = tout le monde. */
  audience: string[];
  importance: 1 | 2 | 3;
  city: string | null;
  country: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Lignes brutes de `reference_calendar` (kind `sport_event`) → événements typés. Ignore ce qui est mal formé. */
export function parseSportEventRows(raw: unknown): SportEventRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SportEventRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const start = typeof r.starts_on === "string" ? r.starts_on.slice(0, 10) : null;
    const end = typeof r.ends_on === "string" ? r.ends_on.slice(0, 10) : null;
    const importance = r.importance;
    if (!start || !end || !DATE.test(start) || !DATE.test(end) || start > end) continue;
    if (typeof r.label !== "string" || !r.label.trim()) continue;
    if (typeof r.sport !== "string" || !r.sport.trim()) continue;
    if (importance !== 1 && importance !== 2 && importance !== 3) continue;
    const at = typeof r.starts_at === "string" && !Number.isNaN(Date.parse(r.starts_at)) ? new Date(r.starts_at).toISOString() : null;
    out.push({
      starts_on: start,
      ends_on: end,
      label: r.label,
      sport: r.sport,
      starts_at: at,
      audience: Array.isArray(r.audience) ? r.audience.filter((a): a is string => typeof a === "string").map((a) => a.toUpperCase()) : [],
      importance,
      city: typeof r.city === "string" ? r.city : null,
      country: typeof r.country === "string" ? r.country : null,
    });
  }
  return out;
}

// ── Sélection pour un établissement ─────────────────────────────────────────

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export type SportSelectionInput = {
  events: SportEventRow[];
  /** Jour d'aujourd'hui à Bruxelles, AAAA-MM-JJ (injecté). */
  today: string;
  /**
   * Communautés de la clientèle de l'établissement (« BE », « MA »…). Un
   * événement s'adresse à lui s'il est ouvert à tous (audience vide) ou s'il
   * partage au moins un code.
   */
  audiences: string[];
  /** Jours d'anticipation (défaut 14). */
  horizonDays?: number;
  /** Importance minimale (défaut 1 = tout). */
  minImportance?: 1 | 2 | 3;
  /** Sports retenus (défaut : tous). */
  sports?: string[];
};

export type SelectedSportEvent = {
  event: SportEventRow;
  /** Le jour d'aujourd'hui tombe pendant l'événement. */
  activeToday: boolean;
  /** Jours avant le début (0 si déjà commencé ou aujourd'hui). */
  startsInDays: number;
  /** Plus d'un jour (Jeux, Tour, CAN) : un fond d'ambiance, pas un soir précis. */
  multiDay: boolean;
  /** Heure de Bruxelles du coup d'envoi quand elle est connue. */
  kickoffBrussels: BrusselsTime | null;
  /** Pourquoi il concerne l'établissement : « tous » ou les codes communs. */
  matchedAudience: string[] | "tous";
};

export const DEFAULT_HORIZON_DAYS = 14;

/**
 * Événements qui chevauchent la fenêtre [aujourd'hui, +horizon] et qui
 * concernent la clientèle. Triés : en cours d'abord, puis par début, les plus
 * importants avant à début égal.
 */
export function selectSportEvents(input: SportSelectionInput): SelectedSportEvent[] {
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = dayNumber(input.today);
  const windowEnd = today + horizon;
  const mine = new Set(input.audiences.map((a) => a.trim().toUpperCase()).filter(Boolean));
  const sports = input.sports?.length ? new Set(input.sports) : null;
  const minImportance = input.minImportance ?? 1;
  const out: SelectedSportEvent[] = [];

  for (const e of input.events) {
    if (e.importance < minImportance) continue;
    if (sports && !sports.has(e.sport)) continue;

    const start = dayNumber(e.starts_on);
    const end = dayNumber(e.ends_on);
    if (end < today || start > windowEnd) continue;

    let matched: string[] | "tous";
    if (e.audience.length === 0) matched = "tous";
    else {
      const common = e.audience.filter((a) => mine.has(a));
      if (common.length === 0) continue;
      matched = common;
    }

    out.push({
      event: e,
      activeToday: start <= today && today <= end,
      startsInDays: Math.max(0, start - today),
      multiDay: end > start,
      kickoffBrussels: e.starts_at ? brusselsTime(e.starts_at) : null,
      matchedAudience: matched,
    });
  }

  return out.sort(
    (a, b) =>
      Number(b.activeToday) - Number(a.activeToday) ||
      a.event.starts_on.localeCompare(b.event.starts_on) ||
      b.event.importance - a.event.importance ||
      a.event.label.localeCompare(b.event.label)
  );
}
