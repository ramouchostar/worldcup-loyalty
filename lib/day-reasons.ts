// ADR 0087 §3 — ce qui s'est passé un jour au CA inhabituel : météo, match,
// événement proche, jour férié, vacances scolaires. Règles PURES, testées dans
// day-reasons.test.ts.
//
// On dit des FAITS (« Soir : pluie, 6 mm »), jamais une cause supposée (« la
// pluie a fait baisser ton CA ») : la remarque montre ce qui s'est passé, le
// restaurateur fait le lien. Sans rien de notable, on le dit aussi.

import type { ServiceWeather } from "@/lib/signals/weather";
import type { FootballMatch } from "@/lib/signals/football";
import { FOOTBALL_COMPETITIONS, brusselsTime } from "@/lib/signals/football";

export type DayEvent = { name: string; distanceKm: number; highCapacity: boolean };

export type ReasonsInput = {
  day: string;
  /** Services météo du jour (photo du soir) ; vide si inconnue. */
  weather: ServiceWeather[];
  matches: FootballMatch[];
  events: DayEvent[];
  publicHoliday: string | null;
  schoolHoliday: string | null;
};

export type DayReasons = {
  facts: string[];
  /** Ce qu'on n'a pas pu lire (« météo »…), pour ne pas faire croire qu'il n'y avait rien. */
  unknown: string[];
};

const MAX_FACTS = 4;
const MAX_MATCHES = 2;
const MAX_EVENTS = 2;
/** Un match compte s'il tombe pendant ou juste avant le service du soir. */
const MATCH_FROM_HOUR = 17;
const MATCH_TO_HOUR = 22;
/** Les sélections qui remplissent (ou vident) une salle à Bruxelles. */
const FOLLOWED_NATIONS = /belg|maroc|morocco|turqu|turkey|türkiye/i;

const fr = (n: number) => n.toLocaleString("fr-BE", { maximumFractionDigits: 1 });

function weatherFact(s: ServiceWeather): string | null {
  const parts: string[] = [];
  if (s.flags.includes("orage")) parts.push("orage");
  if (s.flags.includes("neige")) parts.push(s.snowfallCm !== null ? `neige (${fr(s.snowfallCm)} cm)` : "neige");
  if (s.flags.includes("pluie")) parts.push(s.precipitationMm !== null && s.precipitationMm > 0 ? `pluie (${fr(s.precipitationMm)} mm)` : "pluie");
  if (s.flags.includes("froid") && s.minApparentTemperature !== null) parts.push(`froid (ressenti ${fr(s.minApparentTemperature)} °C)`);
  if (s.flags.includes("chaleur") && s.maxApparentTemperature !== null) parts.push(`chaleur (ressenti ${fr(s.maxApparentTemperature)} °C)`);
  if (s.flags.includes("vent") && s.maxWindSpeed !== null) parts.push(`vent fort (${Math.round(s.maxWindSpeed)} km/h)`);
  if (parts.length === 0) return null;
  return `${s.service === "midi" ? "Midi" : "Soir"} : ${parts.join(", ")}`;
}

export function relevantMatches(matches: FootballMatch[], day: string): FootballMatch[] {
  const groups = new Map(FOOTBALL_COMPETITIONS.map((c) => [c.id, c.group]));
  return matches
    .filter((m) => {
      if (m.isWomen || m.status === "postponed" || m.status === "cancelled") return false;
      const t = brusselsTime(m.kickoffUtc);
      if (t.date !== day || t.hour < MATCH_FROM_HOUR || t.hour > MATCH_TO_HOUR) return false;
      const g = groups.get(m.competitionId);
      if (g === "belgique") return m.competitionId === 14; // Pro League seulement
      if (g === "europe") return true;
      if (g === "selections") return FOLLOWED_NATIONS.test(`${m.home} ${m.away}`);
      return false;
    })
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

export function dayReasons(input: ReasonsInput): DayReasons {
  const facts: string[] = [];
  const unknown: string[] = [];

  if (input.publicHoliday) facts.push(`Jour férié : ${input.publicHoliday}`);
  if (input.schoolHoliday) facts.push(`Vacances scolaires : ${input.schoolHoliday}`);

  const services = input.weather.filter((s) => s.date === input.day);
  if (services.length === 0) unknown.push("météo");
  // Le soir d'abord : c'est le service où la météo pèse le plus sur la salle et la livraison.
  for (const s of [...services].sort((a, b) => (a.service === "soir" ? -1 : b.service === "soir" ? 1 : 0))) {
    const f = weatherFact(s);
    if (f) facts.push(f);
  }

  for (const m of relevantMatches(input.matches, input.day).slice(0, MAX_MATCHES)) {
    facts.push(`Match ${m.home} – ${m.away} à ${brusselsTime(m.kickoffUtc).time.replace(":", " h ")} (${m.competition})`);
  }

  const events = [...input.events]
    .filter((e) => e.highCapacity || e.distanceKm <= 1.5)
    .sort((a, b) => Number(b.highCapacity) - Number(a.highCapacity) || a.distanceKm - b.distanceKm)
    .slice(0, MAX_EVENTS);
  for (const e of events) facts.push(`Événement à ${fr(e.distanceKm)} km : ${e.name}`);

  return { facts: facts.slice(0, MAX_FACTS), unknown };
}
