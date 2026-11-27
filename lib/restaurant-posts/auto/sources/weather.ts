// ADR 0112 — la météo. DEUX choses ici : la règle qui dit « soleil » ou « pluie » (pure, testée), et la source,
// ÉTEINTE.
//
// Pourquoi éteinte (conditions lues le 2026-11-26) : les conditions Google Maps Platform pour l'Espace économique
// européen interdisent de créer un contenu à partir de ses données (§3.3.2 c, « No Creating Content From Google Maps
// Content », https://cloud.google.com/terms/maps-platform/eea) et n'autorisent à les garder que brièvement
// (https://cloud.google.com/terms/maps-platform/eea/maps-service-terms, §23). Un article écrit à partir d'une
// prévision, puis gardé, entre dans ce cas. Aucun appel n'est fait, rien n'est lu ni gardé. Rallumer demande un accord
// écrit ou une autre source météo : la règle ci-dessous ne change pas.

import { summarizeServices, type ServiceName, type WeatherRead } from "../../../signals/weather";
import type { OccasionSource } from "./types";

export const WEATHER_UNAVAILABLE = "les conditions de Google ne permettent pas d'écrire un article à partir de sa prévision";

/** Soleil : les trois heures de midi, toutes connues, toutes dégagées, sans pluie, et assez doux. */
export const SUN_RULE = {
  hours: [11, 12, 13],
  conditions: ["CLEAR", "MOSTLY_CLEAR"],
  maxRainProbabilityPct: 20,
  minApparentC: 10,
} as const;

export type Sky = { sky: "soleil" | "pluie"; service: ServiceName };

/**
 * Ce qu'on peut annoncer pour un jour, ou `null`. Une valeur absente n'annonce JAMAIS rien.
 * Pluie : un service complet (midi d'abord) avec le drapeau « pluie » de weather.ts, sans neige.
 * Soleil : voir `SUN_RULE`.
 */
export function skyOf(read: WeatherRead, day: string): Sky | null {
  const services = summarizeServices(read).filter((s) => s.date === day);
  const rain = (["midi", "soir"] as const).find((name) =>
    services.some((s) => s.service === name && s.missingHours === 0 && s.flags.includes("pluie") && !s.flags.includes("neige")),
  );
  if (rain) return { sky: "pluie", service: rain };

  const byTime = new Map(read.hours.map((h) => [h.time, h]));
  const sunny = SUN_RULE.hours.every((hour) => {
    const h = byTime.get(`${day}T${String(hour).padStart(2, "0")}:00`);
    return (
      !!h &&
      h.condition !== null && (SUN_RULE.conditions as readonly string[]).includes(h.condition) &&
      h.precipitation === 0 &&
      h.precipitationProbability !== null && h.precipitationProbability <= SUN_RULE.maxRainProbabilityPct &&
      h.apparentTemperature !== null && h.apparentTemperature >= SUN_RULE.minApparentC
    );
  });
  return sunny ? { sky: "soleil", service: "midi" } : null;
}

export const weatherSource: OccasionSource = {
  kind: "meteo",
  unavailable: () => WEATHER_UNAVAILABLE,
  read: async () => ({ ok: false, error: WEATHER_UNAVAILABLE }),
  recheck: async () => ({ ok: false, reason: "source_indisponible" }),
};
