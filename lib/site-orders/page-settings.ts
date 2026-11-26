// ADR 0109 §3 (amendé le 2026-11-26) — ce que le restaurant règle pour sa page de commande : quels horaires montrer, ses
// horaires, ses fermetures, sa présentation et ce qu'il propose. Logique PURE et testée ; la base est dans
// `page-settings-db.ts`. Rien de Google n'est gardé ici : seulement ce que le restaurateur a saisi.

import type { Closure } from "./hours";
import { checkWeekly, type WeeklyHours } from "./weekly-hours";

export type Offers = { terrace: boolean; dineIn: boolean; matchScreen: boolean };

export type PageSettings = {
  /** `false` : la migration n'est pas appliquée. La page se comporte comme avant (Google seul). */
  activated: boolean;
  /** « Ceux de Google » ou « Les miens ». */
  source: "google" | "manual";
  /** Les horaires saisis, gardés même quand Google est choisi : ils servent alors de repli. */
  weekly: WeeklyHours | null;
  /** Les jours spéciaux et les fermetures de plusieurs jours. */
  closures: Closure[];
  /** « Fermer pour aujourd'hui » : le jour de service fermé. */
  closedToday: string | null;
  presentation: string | null;
  /** « Ce que tu proposes » : enregistré, montré à aucun client pour l'instant. */
  offers: Offers;
};

export const NO_SETTINGS: PageSettings = {
  activated: true, source: "google", weekly: null, closures: [], closedToday: null, presentation: null,
  offers: { terrace: false, dineIn: false, matchScreen: false },
};

/** Sous le nom du restaurant : sa phrase, sinon une phrase composée avec son type de cuisine. */
export const presentationLine = (r: { presentation?: string | null; cuisine?: string | null }): string =>
  r.presentation?.trim() || (r.cuisine ? `${r.cuisine}, à emporter` : "À emporter");

export const MAX_CLOSURES = 40;
export const MAX_PRESENTATION = 80;
const MAX_CLOSURE_DAYS = 366;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Un jour qui existe (« 2026-02-30 » n'en est pas un). */
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().startsWith(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Une ligne de `site_page_settings`, relue sans rien croire : une valeur illisible est ignorée, jamais fatale à la page. */
export function readSettingsRow(row: unknown): PageSettings {
  if (!isRecord(row)) return NO_SETTINGS;
  const weekly = checkWeekly(row.weekly_hours);
  const closures = Array.isArray(row.closures)
    ? (row.closures as unknown[]).flatMap((c) => (isRecord(c) && isDay(c.from) && isDay(c.to) && c.from <= c.to ? [{ from: c.from, to: c.to }] : []))
    : [];
  const presentation = typeof row.presentation === "string" && row.presentation.trim() !== "" ? row.presentation.trim() : null;
  return {
    activated: true,
    source: row.hours_source === "manual" ? "manual" : "google",
    weekly: weekly.ok ? weekly.weekly : null,
    closures,
    closedToday: isDay(row.closed_today) ? row.closed_today : null,
    presentation,
    offers: { terrace: row.offers_terrace === true, dineIn: row.offers_dine_in === true, matchScreen: row.offers_match_screen === true },
  };
}

/** Toutes les fermetures qui comptent : les jours spéciaux et « Fermer pour aujourd'hui ». */
export function allClosures(s: PageSettings): Closure[] {
  return s.closedToday ? [...s.closures, { from: s.closedToday, to: s.closedToday }] : s.closures;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

/** Ajoute une fermeture (un jour ou plusieurs). Les fermetures passées sont oubliées au passage. */
export function addClosure(closures: readonly Closure[], raw: unknown, today: string): Checked<Closure[]> {
  const from = isRecord(raw) ? raw.from : undefined;
  const to = isRecord(raw) && raw.to !== "" && raw.to !== undefined && raw.to !== null ? raw.to : from;
  if (!isDay(from) || !isDay(to)) return { ok: false, message: "Choisis une date." };
  if (to < from) return { ok: false, message: "La fin doit venir après le début." };
  if (to < today) return { ok: false, message: "Cette date est déjà passée." };
  if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 >= MAX_CLOSURE_DAYS) return { ok: false, message: "Une fermeture dure un an au plus." };
  const kept = closures.filter((c) => c.to >= today && !(c.from === from && c.to === to));
  if (kept.length >= MAX_CLOSURES) return { ok: false, message: "Trop de fermetures enregistrées : retires-en une." };
  return { ok: true, value: [...kept, { from, to }].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)) };
}

export const removeClosure = (closures: readonly Closure[], raw: unknown): Closure[] =>
  closures.filter((c) => !(isRecord(raw) && raw.from === c.from && raw.to === c.to));

const dayName = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });
/** « 1er janvier », « 25 décembre ». */
const named = (day: string) => dayName.format(new Date(`${day}T12:00:00Z`)).replace(/^1 /, "1er ");
const numbered = (day: string) => (day.endsWith("-01") ? "1er" : String(Number(day.slice(8))));

/** « 25 décembre : fermé » ou « Du 24 au 26 décembre : fermé ». */
export function closureLabel(c: Closure): string {
  if (c.from === c.to) return `${named(c.from)} : fermé`;
  const sameMonth = c.from.slice(0, 7) === c.to.slice(0, 7);
  return `Du ${sameMonth ? numbered(c.from) : named(c.from)} au ${named(c.to)} : fermé`;
}

const clean = (v: string) => v.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();

export type ContactField = "phone" | "address" | "presentation";

/** Téléphone, adresse ou présentation. Vide = la ligne disparaît de la page, jamais une valeur inventée. */
export function checkContact(field: unknown, raw: unknown): Checked<{ field: ContactField; value: string | null }> {
  if ((field !== "phone" && field !== "address" && field !== "presentation") || typeof raw !== "string") return { ok: false, message: "Requête invalide." };
  const value = clean(raw);
  if (value === "") return { ok: true, value: { field, value: null } };
  if (field === "phone") {
    const digits = value.replace(/\D/g, "");
    if (!/^\+?[\d\s./()-]+$/.test(value) || digits.length < 8 || digits.length > 15 || value.length > 30) return { ok: false, message: "Ce numéro n'est pas lisible. Exemple : 02 123 45 67." };
  }
  if (field === "address" && (value.length < 5 || value.length > 200)) return { ok: false, message: "Écris l'adresse complète (200 signes au plus)." };
  if (field === "presentation" && value.length > MAX_PRESENTATION) return { ok: false, message: `La présentation tient en ${MAX_PRESENTATION} signes.` };
  return { ok: true, value: { field, value } };
}

export function checkOffers(raw: unknown): Checked<Offers> {
  if (!isRecord(raw) || [raw.terrace, raw.dineIn, raw.matchScreen].some((v) => typeof v !== "boolean")) return { ok: false, message: "Requête invalide." };
  return { ok: true, value: { terrace: raw.terrace as boolean, dineIn: raw.dineIn as boolean, matchScreen: raw.matchScreen as boolean } };
}

/** La source et la semaine. « Les miens » exige une semaine complète ; « Ceux de Google » garde la semaine déjà saisie. */
export function checkHoursChoice(raw: unknown, current: PageSettings): Checked<{ source: "google" | "manual"; weekly: WeeklyHours | null }> {
  if (!isRecord(raw) || (raw.source !== "google" && raw.source !== "manual")) return { ok: false, message: "Choisis les horaires à montrer." };
  const sent = raw.weekly === null || raw.weekly === undefined ? null : checkWeekly(raw.weekly);
  if (sent && !sent.ok) return { ok: false, message: sent.message };
  const weekly = sent ? sent.weekly : current.weekly;
  if (raw.source === "manual" && weekly === null) return { ok: false, message: "Remplis tes horaires pour les montrer." };
  return { ok: true, value: { source: raw.source, weekly } };
}
