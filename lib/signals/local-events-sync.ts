// ============================================================
// Signal « événements locaux » — exécution de la synchro (lecture de l'agenda
// de visit.brussels + écriture dans `local_events` + journal). Les règles
// vivent dans local-events.ts (pur, testé) et la lecture dans
// local-events-source.ts.
//
// SERVEUR UNIQUEMENT (clé service-role). Appelé par /api/cron/local-events.
//
// Aucune synchro n'échoue en silence : réussie ou non, elle écrit une ligne
// dans `signal_sync_runs` (migration 20261006-0400).
// ============================================================

import { createAdminClient } from "../supabase";
import { addDays } from "./transport";
import { readVisitBrusselsAgenda } from "./local-events-source";
import { SOURCE_VISIT_BRUSSELS, type LocalEvent } from "./local-events";

export const JOURNAL_SOURCE = "visitbrussels-agenda";
/** Fenêtre glissante gardée en base. */
export const WINDOW_DAYS = 90;
/** On garde une semaine de passé : le temps de comprendre un incident. */
export const KEEP_PAST_DAYS = 7;
const UPSERT_BATCH = 500;
/** En dessous, la lecture est suspecte (panne, format changé) : on n'efface rien. */
export const MIN_PLAUSIBLE_OCCURRENCES = 500;

export type SyncResult =
  | { ok: true; written: number; removed: number; purgedPast: number; pagesRead: number; bytesMB: number; journalOk: boolean }
  | { ok: false; error: string; written: number; journalOk: boolean };

type JournalEntry = {
  ok: boolean;
  rows_written: number;
  rows_removed: number;
  gaps: number;
  detail: Record<string, unknown> | null;
  error: string | null;
  duration_ms: number;
};

async function writeJournal(entry: JournalEntry): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("signal_sync_runs").insert({ source: JOURNAL_SOURCE, ...entry });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error("[local-events] journal non écrit :", (e as Error).message);
    return false;
  }
}

function toRow(e: LocalEvent, syncedAt: string) {
  return {
    source: e.source,
    external_id: e.externalId,
    event_id: e.eventId,
    name: e.name,
    category: e.category,
    source_category: e.sourceCategory,
    day: e.day,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    doors_at: e.doorsAt,
    night_life_until: e.nightLifeUntil,
    venue_name: e.venueName,
    venue_zip: e.venueZip,
    venue_city: e.venueCity,
    lat: e.lat,
    lng: e.lng,
    is_high_capacity: e.isHighCapacity,
    is_free: e.isFree,
    is_canceled: e.isCanceled,
    is_soldout: e.isSoldout,
    ranking: e.ranking,
    url: e.url,
    synced_at: syncedAt,
  };
}

function isMissingTable(message: string): boolean {
  return /local_events|signal_sync_runs/.test(message) && /does not exist|schema cache|Could not find/i.test(message);
}

export async function syncLocalEvents(today: string = new Date().toISOString().slice(0, 10)): Promise<SyncResult> {
  const started = Date.now();
  const runStart = new Date().toISOString();
  let written = 0;

  const fail = async (error: string, detail: Record<string, unknown> | null = null): Promise<SyncResult> => {
    console.error("[local-events] échec :", error);
    const journalOk = await writeJournal({
      ok: false, rows_written: written, rows_removed: 0, gaps: 0, detail, error, duration_ms: Date.now() - started,
    });
    return { ok: false, error, written, journalOk };
  };

  try {
    const from = today;
    const to = addDays(today, WINDOW_DAYS);

    // 1. Lecture (réseau, ~144 Mo, une page à la fois).
    const read = await readVisitBrusselsAgenda({ from, to });
    const readDetail = {
      pagesRead: read.pagesRead, pagesTotal: read.pagesTotal, eventsSeen: read.eventsSeen,
      occurrencesInWindow: read.occurrencesInWindow, kept: read.events.length, bytesMB: Math.round(read.bytes / 1e6),
    };
    // Garde-fou : une lecture quasi vide ne doit RIEN effacer.
    if (read.occurrencesInWindow < MIN_PLAUSIBLE_OCCURRENCES) {
      return fail(
        `lecture suspecte : ${read.occurrencesInWindow} occurrence(s) dans la fenêtre, au moins ${MIN_PLAUSIBLE_OCCURRENCES} attendues — rien n'a été écrit. ${read.errors.join(" ; ")}`.trim(),
        readDetail
      );
    }

    // 2. Écriture par lots (upsert sur source + external_id).
    const admin = createAdminClient();
    for (let i = 0; i < read.events.length; i += UPSERT_BATCH) {
      const batch = read.events.slice(i, i + UPSERT_BATCH).map((e) => toRow(e, runStart));
      const up = await admin.from("local_events").upsert(batch, { onConflict: "source,external_id" });
      if (up.error) {
        if (isMissingTable(up.error.message)) return fail("migration 20261006-0600-local-events.sql pas encore appliquée", readDetail);
        return fail(`écriture : ${up.error.message}`, readDetail);
      }
      written += batch.length;
    }

    // 3. Retraits : seulement si TOUTES les pages ont été lues. Une occurrence
    //    de la fenêtre qui n'a pas été revue ce passage n'existe plus (annulée,
    //    supprimée, devenue « sans intérêt ») ; une lecture partielle ne prouve rien.
    let removed = 0;
    if (read.ok) {
      const del = await admin
        .from("local_events")
        .delete({ count: "exact" })
        .eq("source", SOURCE_VISIT_BRUSSELS)
        .gte("day", from)
        .lt("synced_at", runStart);
      if (del.error) return fail(`retrait des occurrences disparues : ${del.error.message}`, readDetail);
      removed = del.count ?? 0;
    }

    // 4. Passé ancien : purgé pour toutes les sources.
    const purge = await admin
      .from("local_events")
      .delete({ count: "exact" })
      .lt("day", addDays(today, -KEEP_PAST_DAYS));
    const purgedPast = purge.error ? 0 : (purge.count ?? 0);

    const journalOk = await writeJournal({
      ok: read.ok,
      rows_written: written,
      rows_removed: removed + purgedPast,
      // Pages non lues = trou à surveiller.
      gaps: read.pagesTotal === null ? 1 : Math.max(0, read.pagesTotal - read.pagesRead),
      detail: { ...readDetail, removed, purgedPast, retraitsFaits: read.ok, errors: read.errors },
      error: read.ok ? null : read.errors.join(" ; "),
      duration_ms: Date.now() - started,
    });

    if (!read.ok) return { ok: false, error: read.errors.join(" ; ") || "lecture incomplète", written, journalOk };
    return { ok: true, written, removed, purgedPast, pagesRead: read.pagesRead, bytesMB: Math.round(read.bytes / 1e6), journalOk };
  } catch (e) {
    return fail((e as Error).message || "erreur inconnue");
  }
}
