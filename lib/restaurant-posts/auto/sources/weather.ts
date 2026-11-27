// ADR 0112 §9 — la météo, d'après la prévision de MET Norway (lib/signals/weather-met*). La règle « soleil » ou
// « pluie » est ici, pure et testée.
//
// Pour la Belgique la documentation n'annonce ni probabilité de pluie ni température ressentie : la règle s'appuie sur
// la QUANTITÉ de pluie heure par heure, la couverture nuageuse et la température de l'air. Une valeur absente n'annonce
// rien. Seule la prévision du LENDEMAIN est utilisée : le détail heure par heure n'est garanti que sur le court terme,
// et une prévision plus lointaine prendrait la place d'occasions plus sûres.
//
// Source ÉTEINTE tant que MET_NORWAY_USER_AGENT est vide ou que la réserve (migration 20261127-0930) manque.

import { brusselsTime } from "../../../signals/football";
import { SERVICES, type ServiceName } from "../../../signals/weather";
import type { MetForecast, MetHour } from "../../../signals/weather-met";
import type { MetForecastReader } from "../../../signals/weather-met-source";
import { serviceEnd } from "../time";
import type { Candidate, Facts, WeatherFacts } from "../types";
import type { OccasionSource, SourceContext } from "./types";

/** Pluie : sur un service entier (midi d'abord, sinon soir). Seuils de départ, à recaler sur des journées réelles. */
export const RAIN_RULE = {
  /** Cumul des heures du service. */
  minTotalMm: 2,
  /** Une heure « pluvieuse », et combien il en faut : une seule averse ne suffit pas. */
  wetHourMm: 0.2,
  minWetHours: 2,
  /** En dessous, ce pourrait être de la neige : on n'annonce pas « pluie ». */
  minAirC: 3,
} as const;

/** Soleil : les trois heures de midi, ciel peu couvert, aucune pluie, assez doux. */
export const SUN_RULE = { hours: [11, 12, 13], maxCloudPct: 25, minAirC: 12 } as const;

export type Sky = { sky: "soleil" | "pluie"; service: ServiceName };

/** Les heures d'un jour de Bruxelles, par heure locale. */
function hoursOf(forecast: MetForecast, day: string): Map<number, MetHour> {
  const out = new Map<number, MetHour>();
  for (const h of forecast.hours) {
    const local = brusselsTime(h.time);
    if (local.date === day && local.time.endsWith(":00")) out.set(local.hour, h);
  }
  return out;
}

/** Ce qu'on peut annoncer pour un jour, ou `null`. La pluie passe avant le soleil. */
export function skyOf(forecast: MetForecast, day: string): Sky | null {
  const byHour = hoursOf(forecast, day);
  const rain = (["midi", "soir"] as const).find((service) => {
    let total = 0;
    let wet = 0;
    for (const hour of SERVICES[service]) {
      const h = byHour.get(hour);
      if (!h || h.precipitationNextHour === null || h.airTemperature === null || h.airTemperature < RAIN_RULE.minAirC) return false;
      total += h.precipitationNextHour;
      if (h.precipitationNextHour >= RAIN_RULE.wetHourMm) wet++;
    }
    return Math.round(total * 10) / 10 >= RAIN_RULE.minTotalMm && wet >= RAIN_RULE.minWetHours;
  });
  if (rain) return { sky: "pluie", service: rain };

  const sunny = SUN_RULE.hours.every((hour) => {
    const h = byHour.get(hour);
    return (
      !!h &&
      h.cloudAreaFraction !== null && h.cloudAreaFraction <= SUN_RULE.maxCloudPct &&
      h.precipitationNextHour === 0 &&
      h.airTemperature !== null && h.airTemperature >= SUN_RULE.minAirC
    );
  });
  return sunny ? { sky: "soleil", service: "midi" } : null;
}

export function weatherCandidate(forecast: MetForecast, day: string): Candidate | null {
  const found = skyOf(forecast, day);
  if (!found) return null;
  const facts: WeatherFacts = { kind: "meteo", sky: found.sky, service: found.service, day };
  // Une occasion météo par jour : un changement d'avis de la prévision n'en crée pas une seconde.
  return { kind: "meteo", sourceKey: `meteo:metno:${day}`, rank: 0, days: [{ day, expiresAt: serviceEnd(day, found.service), facts }] };
}

export function weatherSource(p: {
  reader: MetForecastReader | null;
  /** Pourquoi il n'y a pas de lecteur (identification absente ou invalide). */
  off: string | null;
  /** La réserve existe-t-elle en base ? */
  cacheReady(): Promise<boolean>;
}): OccasionSource {
  const why = async () => {
    if (!p.reader) return p.off ?? "météo pas branchée";
    return (await p.cacheReady()) ? null : "la réserve des prévisions manque (migration 20261127-0930)";
  };
  const forecastFor = async (ctx: SourceContext) => {
    if (!ctx.coords) return { ok: false as const, error: "la position du restaurant est inconnue" };
    const off = await why();
    if (off !== null || !p.reader) return { ok: false as const, error: off ?? "météo pas branchée" };
    try {
      return await p.reader.get(ctx.coords, { now: ctx.now, network: ctx.network });
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };

  return {
    kind: "meteo",
    unavailable: why,
    async read(ctx, window) {
      const r = await forecastFor(ctx);
      if (!r.ok) return { ok: false, error: r.error };
      const found = weatherCandidate(r.forecast, window.from);
      return { ok: true, candidates: found ? [found] : [] };
    },
    async recheck(ctx, facts: Facts) {
      if (facts.kind !== "meteo") return { ok: false, reason: "source_indisponible" };
      const r = await forecastFor(ctx);
      if (!r.ok) {
        console.warn(`[météo MET Norway] revérification impossible : ${r.error}`);
        return { ok: false, reason: "meteo_indisponible" };
      }
      const now = skyOf(r.forecast, facts.day);
      return now && now.sky === facts.sky && now.service === facts.service ? { ok: true } : { ok: false, reason: "meteo_change" };
    },
    async prefetch(ctx) {
      const r = await forecastFor(ctx);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  };
}
