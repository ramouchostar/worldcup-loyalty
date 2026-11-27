// ADR 0109 §3 — ce que la base sait pour l'alerte « horaires introuvables » (SERVEUR UNIQUEMENT). Aucun appel à Google : la
// console relit les alertes toutes les trente secondes. La règle est dans `nina-alerts.ts`.

import { isPlacesConfigured } from "../audit/places";
import { createAdminClient } from "../supabase";
import type { HoursCause } from "./hours-source";
import { HOURS_VIEW_WINDOW_HOURS, hoursProblem } from "./nina-alerts";
import { lastHoursView, readPageSettings } from "./page-settings-db";

/** `null` : la page a des horaires à lire, ou la saisie n'est pas encore activée (rien à proposer au gérant). */
export async function readHoursAlert(restaurantId: string, now: Date = new Date()): Promise<{ cause: HoursCause; href: string } | null> {
  const settings = await readPageSettings(restaurantId);
  if (!settings.activated || settings.weekly) return null;
  const { data, error } = await createAdminClient().from("restaurants").select("google_place_id").eq("id", restaurantId).maybeSingle();
  // Sans la colonne (migration 20261001-2321), la page ne peut relier aucune fiche : c'est « pas de fiche ».
  if (error && !(error.code === "PGRST204" || error.code === "42703" || /google_place_id/.test(error.message ?? ""))) {
    throw new Error(`restaurants (fiche) : ${error.message}`);
  }
  const placeId = (data as { google_place_id?: string | null } | null)?.google_place_id ?? null;
  const cause = hoursProblem({
    hasOwnHours: false,
    staticCause: !placeId ? "pas_de_fiche" : !isPlacesConfigured() ? "places_absent" : null,
    lastView: await lastHoursView(restaurantId, new Date(now.getTime() - HOURS_VIEW_WINDOW_HOURS * 3600 * 1000).toISOString()),
  });
  return cause ? { cause, href: `/admin/${restaurantId}/commandes-du-site/infos/horaires` } : null;
}
