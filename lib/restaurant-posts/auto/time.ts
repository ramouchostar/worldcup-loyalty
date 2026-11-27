// ADR 0112 — les jours et les heures de Bruxelles des articles automatiques. PUR.

import { brusselsTime } from "../../signals/football";
import { brusselsLocalToUtc } from "../../signals/local-events";
import { PUBLISH_HOUR } from "./types";

export const brusselsDay = (at: Date | string): string => brusselsTime(at).date;
export const brusselsHourOf = (at: Date): number => brusselsTime(at).hour;

export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Le lundi de la semaine d'un jour : la limite « trois par semaine » va du lundi au dimanche. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(day, -((weekday + 6) % 7));
}

const utc = (day: string, time: string): string => {
  const iso = brusselsLocalToUtc(day, time);
  if (!iso) throw new Error(`jour illisible : ${day} ${time}`);
  return iso;
};

/** 10:00 à Bruxelles ce jour-là. */
export const publishAt = (day: string): string => utc(day, `${String(PUBLISH_HOUR).padStart(2, "0")}:00`);
/** La fin d'un service, à Bruxelles : l'article de météo s'y retire. */
export const serviceEnd = (day: string, service: "midi" | "soir"): string => utc(day, service === "midi" ? "14:00" : "22:00");
/** Minuit à la fin de ce jour, à Bruxelles. */
export const endOfDay = (day: string): string => utc(addDays(day, 1), "00:00");

const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-BE", { ...options, timeZone: "UTC" });

/** « samedi » */
export const weekdayName = (day: string): string => format(day, { weekday: "long" });
/** « 28 novembre » ; le premier du mois s'écrit « 1er ». */
export const dayMonth = (day: string): string => format(day, { day: "numeric", month: "long" }).replace(/^1 /, "1er ");
/** « 20 h 45 » à Bruxelles. */
export const clockLabel = (iso: string): string => {
  const { time } = brusselsTime(iso);
  const [h, m] = time.split(":");
  return m === "00" ? `${Number(h)} h` : `${Number(h)} h ${m}`;
};
