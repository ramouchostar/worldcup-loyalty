// ============================================================
// Signal « météo » — la prévision de MET Norway (Locationforecast 2.0, format
// « compact »), pour les articles publiés automatiquement (ADR 0112 §9).
//
// Module PUR : aucun réseau, aucune base, aucune horloge. Format documenté lu le
// 2026-11-27 : https://api.met.no/doc/ForecastJSON et
// https://api.met.no/doc/locationforecast/datamodel
//
// Pour la Belgique (zone « reste du monde »), ce que la documentation annonce :
// température et couverture nuageuse à chaque instant, pluie par heure sur le
// court terme seulement (puis par tranches de 6 heures), pas de probabilité de
// pluie. On ne lit donc que ces trois valeurs, heure par heure.
//
// Une valeur absente, ou dans une unité inattendue, reste ABSENTE (`null`) :
// jamais lue comme « 0 mm », jamais convertie en silence.
// ============================================================

/** Une heure de prévision. `time` : l'instant de début, ISO UTC. */
export type MetHour = {
  time: string;
  airTemperature: number | null; // °C, à l'instant
  cloudAreaFraction: number | null; // % du ciel couvert, à l'instant
  precipitationNextHour: number | null; // mm pendant l'heure qui commence à `time`
};

export type MetForecast = { updatedAt: string | null; hours: MetHour[] };

type Raw = Record<string, unknown>;
const record = (v: unknown): Raw | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * La réponse « compact » → heures typées, triées. `null` si la forme n'est pas celle documentée (pas de
 * `properties.timeseries`) : l'appelant le dit, il ne conclut pas « beau temps ».
 */
export function parseMetForecast(raw: unknown): MetForecast | null {
  const properties = record(record(raw)?.properties);
  const series = properties?.timeseries;
  if (!properties || !Array.isArray(series) || series.length === 0) return null;
  const meta = record(properties.meta);
  const units = record(meta?.units);
  /** La valeur seulement si l'unité annoncée est celle attendue. */
  const known = (name: string, unit: string, value: unknown) => (units?.[name] === unit ? num(value) : null);

  const hours: MetHour[] = [];
  for (const entry of series) {
    const e = record(entry);
    const time = typeof e?.time === "string" && !Number.isNaN(Date.parse(e.time)) ? e.time : null;
    const data = record(e?.data);
    if (!time || !data) return null;
    const instant = record(record(data.instant)?.details);
    const nextHour = record(record(data.next_1_hours)?.details);
    hours.push({
      time: new Date(time).toISOString(),
      airTemperature: known("air_temperature", "celsius", instant?.air_temperature),
      cloudAreaFraction: known("cloud_area_fraction", "%", instant?.cloud_area_fraction),
      precipitationNextHour: known("precipitation_amount", "mm", nextHour?.precipitation_amount),
    });
  }
  hours.sort((a, b) => a.time.localeCompare(b.time));
  const updated = meta?.updated_at;
  return { updatedAt: typeof updated === "string" ? updated : null, hours };
}
