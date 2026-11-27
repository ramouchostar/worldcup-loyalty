// ADR 0112 — les événements près du restaurant, lus dans la copie de l'agenda de visit.brussels (`local_events`,
// synchronisée par /api/cron/local-events). Règles PURES, testées ; la lecture de la table est passée en paramètre.
//
// Retenus : concerts, festivals, fêtes, brocantes, foires, à 1,5 km au plus à vol d'oiseau, non annulés, dont la copie
// a été relue depuis moins de 4 jours (la synchro passe tous les 2 jours : au-delà, on ne sait plus s'ils tiennent).

import { distanceKm } from "../../../signals/local-events";
import { cleanName } from "../clean";
import { endOfDay, publishAt } from "../time";
import { EVENT_CATEGORIES, type Candidate, type EventCategory, type EventFacts } from "../types";
import type { OccasionSource } from "./types";

export const EVENT_SOURCE = "visitbrussels";
export const EVENT_RADIUS_KM = 1.5;
export const AGENDA_MAX_AGE_HOURS = 96;

export type AgendaRow = {
  source: string;
  external_id: string;
  event_id: string;
  name: string;
  category: string;
  day: string;
  starts_at: string | null;
  ends_at: string | null;
  lat: number | null;
  lng: number | null;
  is_canceled: boolean;
  synced_at: string;
};

/** Un rectangle autour du restaurant : la base ne rend que les voisins, la distance exacte est calculée ensuite. */
export type Box = { latMin: number; latMax: number; lngMin: number; lngMax: number };
export const boxAround = (c: { lat: number; lng: number }, km: number = EVENT_RADIUS_KM): Box => {
  const dLat = km / 110.5;
  const dLng = km / (111.3 * Math.cos((c.lat * Math.PI) / 180));
  return { latMin: c.lat - dLat, latMax: c.lat + dLat, lngMin: c.lng - dLng, lngMax: c.lng + dLng };
};

export type AgendaReader = {
  nearby(p: { from: string; to: string; box: Box }): Promise<AgendaRow[]>;
  one(source: string, externalId: string): Promise<AgendaRow | null>;
};

const isCategory = (c: string): c is EventCategory => (EVENT_CATEGORIES as readonly string[]).includes(c);
const fresh = (row: AgendaRow, now: Date) => now.getTime() - Date.parse(row.synced_at) <= AGENDA_MAX_AGE_HOURS * 3_600_000;
/** Arrondi à 50 m : la position du restaurant et celle du lieu ne sont pas plus précises que ça. */
export const roundDistance = (km: number): number => Math.max(50, Math.round((km * 1000) / 50) * 50);

export function eventCandidates(rows: AgendaRow[], coords: { lat: number; lng: number }, window: { from: string; to: string }, now: Date): Candidate[] {
  const byKey = new Map<string, Candidate>();
  const ordered = [...rows].sort(
    (a, b) => a.day.localeCompare(b.day) || (a.starts_at ?? "").localeCompare(b.starts_at ?? "") || a.external_id.localeCompare(b.external_id),
  );
  for (const row of ordered) {
    if (row.source !== EVENT_SOURCE || row.is_canceled || !isCategory(row.category) || !fresh(row, now)) continue;
    if (row.day < window.from || row.day > window.to || row.lat === null || row.lng === null) continue;
    // Fini avant l'heure de publication : rien à annoncer.
    if (row.ends_at !== null && Date.parse(row.ends_at) <= Date.parse(publishAt(row.day))) continue;
    const km = distanceKm(coords, { lat: row.lat, lng: row.lng });
    if (km > EVENT_RADIUS_KM) continue;
    const name = cleanName(row.name);
    if (name === null) continue;
    const facts: EventFacts = {
      kind: "evenement", source: row.source, externalId: row.external_id, eventId: row.event_id,
      name, category: row.category, day: row.day, distanceM: roundDistance(km),
    };
    // Un événement sur plusieurs jours (ou plusieurs séances) n'est annoncé qu'une fois par mois.
    const sourceKey = `evenement:${row.source}:${row.event_id}:${row.day.slice(0, 7)}`;
    const found = byKey.get(sourceKey) ?? { kind: "evenement" as const, sourceKey, rank: facts.distanceM, days: [] };
    if (!found.days.some((d) => d.day === row.day)) found.days.push({ day: row.day, expiresAt: endOfDay(row.day), facts });
    byKey.set(sourceKey, found);
  }
  return [...byKey.values()];
}

export function eventSource(agenda: AgendaReader): OccasionSource {
  return {
    kind: "evenement",
    unavailable: () => null,
    async read(ctx, window) {
      if (!ctx.coords) return { ok: false, error: "la position du restaurant est inconnue" };
      try {
        const rows = await agenda.nearby({ ...window, box: boxAround(ctx.coords) });
        return { ok: true, candidates: eventCandidates(rows, ctx.coords, window, ctx.now) };
      } catch (e) {
        return { ok: false, error: `agenda illisible : ${(e as Error).message}` };
      }
    },
    async recheck(ctx, facts) {
      if (facts.kind !== "evenement") return { ok: false, reason: "source_indisponible" };
      let row: AgendaRow | null;
      try {
        row = await agenda.one(facts.source, facts.externalId);
      } catch (e) {
        console.error("[articles auto] agenda illisible :", (e as Error).message);
        return { ok: false, reason: "source_indisponible" };
      }
      // L'identifiant d'une séance porte son heure : une séance déplacée n'est plus trouvée.
      if (!row || row.day !== facts.day) return { ok: false, reason: "evenement_disparu" };
      if (row.is_canceled) return { ok: false, reason: "evenement_annule" };
      if (!fresh(row, ctx.now)) return { ok: false, reason: "agenda_perime" };
      // Le nom écrit dans l'article doit toujours être celui de l'agenda.
      if (cleanName(row.name) !== facts.name) return { ok: false, reason: "evenement_disparu" };
      return { ok: true };
    },
  };
}
