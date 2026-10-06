// ============================================================
// Vacances scolaires — exécution de la synchro OpenHolidays (réseau + base +
// journal). Les règles vivent dans school-holidays.ts (pur, testé) ; ici on
// ne fait que les appliquer.
//
// SERVEUR UNIQUEMENT (clé service-role). Appelé par /api/cron/school-holidays.
//
// Aucune synchro n'échoue en silence : réussie ou non, elle écrit une ligne
// dans `signal_sync_runs` (migration 20261006-0400). Si l'écriture du journal
// échoue elle-même, c'est dit dans la réponse et dans les logs.
// ============================================================

import { createAdminClient } from "../supabase";
import {
  MIN_PLAUSIBLE_ROWS,
  addDays,
  parseOpenHolidays,
  planSchoolHolidaySync,
  type ExistingRow,
  type SyncPlan,
} from "./school-holidays";

export const OPENHOLIDAYS_SOURCE = "openholidays";
const API_URL = "https://openholidaysapi.org/SchoolHolidays";
// Rien d'antérieur n'est touché : le forecast relit ~26 semaines d'historique
// (app/admin/[restaurantId]/forecast/page.tsx), on garde de la marge.
const HISTORY_DAYS = 200;
// L'API refuse plus de 1 095 jours d'écart entre validFrom et validTo.
const WINDOW_DAYS = 1090;
const FETCH_TIMEOUT_MS = 20_000;

export type SyncResult =
  | { ok: true; written: number; removedManual: number; removedStale: number; gaps: number; shortCommunities: string[]; journalOk: boolean }
  | { ok: false; error: string; journalOk: boolean };

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
    const { error } = await admin.from("signal_sync_runs").insert({ source: OPENHOLIDAYS_SOURCE, ...entry });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error("[school-holidays] journal non écrit :", (e as Error).message);
    return false;
  }
}

function isMissingMigration(message: string): boolean {
  return /source|external_id|signal_sync_runs/.test(message) && /does not exist|schema cache|Could not find/i.test(message);
}

export async function syncSchoolHolidays(today: string = new Date().toISOString().slice(0, 10)): Promise<SyncResult> {
  const started = Date.now();
  const fail = async (error: string): Promise<SyncResult> => {
    console.error("[school-holidays] échec :", error);
    const journalOk = await writeJournal({
      ok: false, rows_written: 0, rows_removed: 0, gaps: 0, detail: null, error, duration_ms: Date.now() - started,
    });
    return { ok: false, error, journalOk };
  };

  try {
    const windowFrom = addDays(today, -HISTORY_DAYS);
    const windowTo = addDays(windowFrom, WINDOW_DAYS);

    // 1. Lecture de l'API.
    const url = `${API_URL}?countryIsoCode=BE&languageIsoCode=FR&validFrom=${windowFrom}&validTo=${windowTo}`;
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return fail(`OpenHolidays a répondu ${res.status}`);
    const api = parseOpenHolidays(await res.json());

    // Garde-fou : une réponse quasi vide (panne, filtre cassé) ne doit RIEN
    // effacer. On n'écrit rien et on le dit.
    if (api.length < MIN_PLAUSIBLE_ROWS) {
      return fail(`réponse suspecte : ${api.length} période(s) lue(s), au moins ${MIN_PLAUSIBLE_ROWS} attendues — rien n'a été écrit`);
    }

    // 2. État actuel de la table, sur la fenêtre.
    const admin = createAdminClient();
    const existingRes = await admin
      .from("reference_calendar")
      .select("id, source, external_id, community, starts_on, ends_on")
      .eq("kind", "school_holiday")
      .gte("ends_on", windowFrom);
    if (existingRes.error) {
      if (isMissingMigration(existingRes.error.message)) {
        return fail("migration 20261006-0400-vacances-openholidays.sql pas encore appliquée");
      }
      return fail(`lecture de reference_calendar : ${existingRes.error.message}`);
    }
    const existing = (existingRes.data ?? []) as ExistingRow[];

    // 3. Plan (pur), puis application : écrire d'abord, retirer ensuite — une
    //    coupure en route laisse des doublons à nettoyer, jamais un trou.
    const plan: SyncPlan = planSchoolHolidaySync({ today, windowFrom, api, existing });

    if (plan.upserts.length > 0) {
      const up = await admin.from("reference_calendar").upsert(
        plan.upserts.map((r) => ({
          kind: "school_holiday",
          community: r.community,
          starts_on: r.starts_on,
          ends_on: r.ends_on,
          label: r.label,
          expected_effect: null,
          source: OPENHOLIDAYS_SOURCE,
          external_id: r.external_id,
        })),
        { onConflict: "source,external_id" }
      );
      if (up.error) return fail(`écriture : ${up.error.message}`);
    }

    const toRemove = [...plan.removeManual, ...plan.removeStale].map((r) => r.id);
    if (toRemove.length > 0) {
      const del = await admin.from("reference_calendar").delete().in("id", toRemove);
      if (del.error) return fail(`retrait des lignes remplacées : ${del.error.message}`);
    }

    // 4. Journal : tout ce qui a été retiré y figure, pour pouvoir le retrouver.
    const journalOk = await writeJournal({
      ok: true,
      rows_written: plan.upserts.length,
      rows_removed: toRemove.length,
      gaps: plan.gaps,
      detail: {
        window: { from: windowFrom, to: windowTo },
        coveredThrough: plan.coveredThrough,
        shortCommunities: plan.shortCommunities,
        removedManual: plan.removeManual,
        removedStale: plan.removeStale,
        orphanManual: plan.orphanManual,
        skipped: plan.skipped,
      },
      error: null,
      duration_ms: Date.now() - started,
    });

    return {
      ok: true,
      written: plan.upserts.length,
      removedManual: plan.removeManual.length,
      removedStale: plan.removeStale.length,
      gaps: plan.gaps,
      shortCommunities: plan.shortCommunities,
      journalOk,
    };
  } catch (e) {
    return fail((e as Error).message || "erreur inconnue");
  }
}
