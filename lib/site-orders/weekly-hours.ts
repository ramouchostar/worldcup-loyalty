// ADR 0109 §3 (amendé le 2026-11-26) — les horaires que le restaurant saisit lui-même. Logique PURE et testée.
//
// Une semaine = sept jours, LUNDI d'abord. Un jour = zéro, un ou deux services. Une fermeture avant (ou égale à) l'ouverture
// tombe le lendemain ; « 00:00 à 00:00 » veut dire toute la journée. Heures de Bruxelles, écrites « HH:MM ».

import type { HoursBlock } from "../audit/places";

export type Service = { open: string; close: string };
export type WeeklyHours = Service[][];

export const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
export const MAX_SERVICES = 2;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type CheckedWeekly = { ok: true; weekly: WeeklyHours } | { ok: false; message: string };

/** Relit une semaine saisie (ou stockée) sans rien croire ; chaque refus dit le jour et quoi corriger. */
export function checkWeekly(raw: unknown): CheckedWeekly {
  if (!Array.isArray(raw) || raw.length !== 7) return { ok: false, message: "Les horaires doivent couvrir les sept jours." };
  const weekly: WeeklyHours = [];
  for (let i = 0; i < 7; i++) {
    const day = cap(DAY_NAMES[i]);
    const list: unknown = raw[i];
    if (!Array.isArray(list) || list.length > MAX_SERVICES) return { ok: false, message: `${day} : deux services au plus.` };
    const services: Service[] = [];
    for (const s of list as unknown[]) {
      const o = (s as { open?: unknown } | null)?.open;
      const c = (s as { close?: unknown } | null)?.close;
      if (!isTime(o) || !isTime(c)) return { ok: false, message: `${day} : indique l'heure d'ouverture et l'heure de fermeture, ou coche « Fermé ».` };
      if (o === c && o !== "00:00") return { ok: false, message: `${day} : l'ouverture et la fermeture ne peuvent pas être à la même heure.` };
      services.push({ open: o, close: c });
    }
    if (services.length === 2) {
      const [first, second] = services;
      // Un premier service qui passe minuit, ou un second qui commence avant la fin du premier : les deux se recouvrent.
      if (first.close <= first.open || second.open < first.close) return { ok: false, message: `${day} : le deuxième service doit commencer après la fin du premier.` };
    }
    weekly.push(services);
  }
  return { ok: true, weekly };
}

/** « 11:00 à 14:00, 18:00 à 22:00 », « 24 h sur 24 » ou « fermé ». */
export function dayText(services: Service[]): string {
  if (services.length === 0) return "fermé";
  if (services.length === 1 && services[0].open === "00:00" && services[0].close === "00:00") return "24 h sur 24";
  return services.map((s) => `${s.open} à ${s.close}`).join(", ");
}

/** La semaine en quelques lignes : les jours qui se suivent avec les mêmes heures sont réunis. */
export function weeklySummary(weekly: WeeklyHours): string[] {
  const texts = weekly.map(dayText);
  const lines: string[] = [];
  for (let from = 0; from < texts.length; ) {
    let to = from;
    while (to + 1 < texts.length && texts[to + 1] === texts[from]) to++;
    const days = to - from === 6 ? "tous les jours" : to === from ? DAY_NAMES[from] : to === from + 1 ? `${DAY_NAMES[from]} et ${DAY_NAMES[to]}` : `${DAY_NAMES[from]} au ${DAY_NAMES[to]}`;
    lines.push(`${cap(days)}${texts[from] === "fermé" ? " " : ", "}${texts[from]}`);
    from = to + 1;
  }
  return lines;
}

// ─── La saisie (l'écran « Mes horaires ») ────────────────────────────────────

/** Un jour en cours de saisie : deux services au plus, champs vides tant que rien n'est écrit. */
export type DayDraft = { closed: boolean; open1: string; close1: string; open2: string; close2: string };

const BLANK: DayDraft = { closed: false, open1: "", close1: "", open2: "", close2: "" };

export function draftOf(weekly: WeeklyHours | null): DayDraft[] {
  return DAY_NAMES.map((_, i) => {
    if (!weekly) return { ...BLANK };
    const [a, b] = weekly[i];
    return { closed: !a, open1: a?.open ?? "", close1: a?.close ?? "", open2: b?.open ?? "", close2: b?.close ?? "" };
  });
}

/** Rien n'est dit de ce jour : ni heures, ni « Fermé ». */
export const isBlank = (d: DayDraft): boolean => !d.closed && !d.open1 && !d.close1 && !d.open2 && !d.close2;

/** Ce que le jour saisi enverrait ; une saisie incomplète reste incomplète, `checkWeekly` la refuse en disant pourquoi. */
export function draftServices(d: DayDraft): Service[] {
  if (d.closed) return [];
  const first = { open: d.open1, close: d.close1 };
  return d.open2 || d.close2 ? [first, { open: d.open2, close: d.close2 }] : [first];
}

function draftText(d: DayDraft): string {
  if (d.closed) return "fermé";
  if (isBlank(d)) return "à compléter";
  const services = draftServices(d);
  return services.every((s) => s.open && s.close) ? dayText(services) : "à compléter";
}

/** Une ligne de la liste des autres jours. `sameAs` : « comme mardi », sous la ligne de mardi. */
export type DayGroup = { first: number; label: string; text: string; sameAs: string | null };

/** Les jours autres que celui qui est ouvert : un jour qui répète le précédent se range sous « comme … ». */
export function groupDays(days: DayDraft[], open: number): DayGroup[] {
  const texts = days.map(draftText);
  const groups: DayGroup[] = [];
  for (let from = 0; from < days.length; ) {
    if (from === open) { from++; continue; }
    groups.push({ first: from, label: cap(DAY_NAMES[from]), text: texts[from], sameAs: null });
    let to = from;
    while (to + 1 < days.length && to + 1 !== open && texts[to + 1] === texts[from] && texts[from] !== "à compléter" && texts[from] !== "fermé") to++;
    if (to > from) {
      const names = to === from + 1 ? DAY_NAMES[to] : to === from + 2 ? `${DAY_NAMES[from + 1]} et ${DAY_NAMES[to]}` : `${DAY_NAMES[from + 1]} à ${DAY_NAMES[to]}`;
      groups.push({ first: from + 1, label: cap(names), text: texts[from], sameAs: DAY_NAMES[from] });
    }
    from = to + 1;
  }
  return groups;
}

// ─── La fiche Google ─────────────────────────────────────────────────────────

const two = (n: number) => String(n).padStart(2, "0");

/**
 * La semaine ordinaire de la fiche Google, pour la MONTRER au gérant (jamais pour la garder). `null` quand elle ne tient
 * pas dans cette forme (une ouverture de plus d'un jour, une borne illisible).
 */
export function googleWeekly(block: HoursBlock | null | undefined): WeeklyHours | null {
  const periods = block?.periods ?? [];
  if (periods.length === 0) return null;
  if (periods.length === 1 && periods[0].open && !periods[0].close) return DAY_NAMES.map(() => [{ open: "00:00", close: "00:00" }]);
  const week: WeeklyHours = DAY_NAMES.map(() => []);
  for (const p of periods) {
    if (!p.open || !p.close) return null;
    const day = p.open.day ?? 0;
    const open = `${two(p.open.hour ?? 0)}:${two(p.open.minute ?? 0)}`;
    const close = `${two(p.close.hour ?? 0)}:${two(p.close.minute ?? 0)}`;
    const span = ((p.close.day ?? 0) - day + 7) % 7;
    if (!isTime(open) || !isTime(close) || day < 0 || day > 6 || span > 1 || (span === 1 && close > open)) return null;
    week[(day + 6) % 7].push({ open, close }); // Google compte à partir du dimanche
  }
  return week.map((s) => s.sort((a, b) => a.open.localeCompare(b.open)));
}
