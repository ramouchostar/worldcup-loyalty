// ADR 0109 §3 — la base des réglages de la page de commande (table `site_page_settings`, service role uniquement ;
// SERVEUR UNIQUEMENT). Migration pas appliquée : la page se comporte comme avant (Google seul) et la console le dit.
// Seul ce que le restaurateur saisit est écrit ici : aucun contenu de Google.

import { createAdminClient } from "../supabase";
import { VIEW_REASON_PREFIX } from "./fiche";
import { NO_SETTINGS, readSettingsRow, type PageSettings } from "./page-settings";
import type { SaveOutcome } from "./settings";

type DbError = { code?: string; message?: string } | null;

const isMissingTable = (error: DbError) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || (/site_page_settings|site_order_refusals/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? "")));

const isMissingColumn = (error: DbError) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

const COLUMNS = "hours_source, weekly_hours, closures, closed_today, presentation, offers_terrace, offers_dine_in, offers_match_screen";

/** Une table absente se lit « rien de réglé, pas activé ». Une autre panne de notre base lève, comme le reste des commandes. */
export async function readPageSettings(restaurantId: string): Promise<PageSettings> {
  const { data, error } = await createAdminClient().from("site_page_settings").select(COLUMNS).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { ...NO_SETTINGS, activated: false };
    throw new Error(`site_page_settings : ${error.message}`);
  }
  return readSettingsRow(data);
}

export type SettingsPatch = Partial<{
  hours_source: "google" | "manual";
  weekly_hours: unknown;
  closures: unknown;
  closed_today: string | null;
  presentation: string | null;
  offers_terrace: boolean;
  offers_dine_in: boolean;
  offers_match_screen: boolean;
}>;

const failed = (what: string, error: DbError): SaveOutcome => {
  console.error(`[site-page-settings] ${what} non écrit :`, error?.message);
  return { ok: false, status: 500, error: "Erreur serveur. Réessaie dans un instant." };
};

/** Écrit seulement les colonnes données ; les autres gardent leur valeur. */
export async function savePageSettings(restaurantId: string, patch: SettingsPatch, userId: string): Promise<SaveOutcome> {
  const { error } = await createAdminClient().from("site_page_settings").upsert(
    { restaurant_id: restaurantId, ...patch, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "restaurant_id" },
  );
  if (!error) return { ok: true };
  if (isMissingTable(error)) return { ok: false, status: 503, error: "Cette fonction n'est pas encore activée." };
  return failed("réglage", error);
}

export type RestaurantContact = { name: string; phone: string | null; address: string | null; cuisine: string | null };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Le nom, le téléphone, l'adresse et le type de cuisine, tels que la page de commande les montre. */
export async function readRestaurantContact(restaurantId: string): Promise<RestaurantContact | null> {
  const admin = createAdminClient();
  let last = "";
  for (const cols of ["name, phone, address, cuisine_types", "name, address, cuisine_types", "name"]) {
    const { data, error } = await admin.from("restaurants").select(cols).eq("id", restaurantId).maybeSingle();
    if (!error) {
      const r = data as unknown as { name: string; phone?: string | null; address?: string | null; cuisine_types?: string[] | null } | null;
      return r ? { name: r.name, phone: text(r.phone), address: text(r.address), cuisine: text((r.cuisine_types ?? []).map((c) => c.trim()).filter(Boolean).join(", ")) } : null;
    }
    if (!isMissingColumn(error)) throw new Error(`restaurants : ${error.message}`);
    last = error.message;
  }
  throw new Error(`restaurants : ${last}`);
}

/** Le téléphone et l'adresse restent dans leurs colonnes existantes (`restaurants`) : une seule source. */
export async function saveRestaurantContact(restaurantId: string, field: "phone" | "address", value: string | null): Promise<SaveOutcome> {
  const { error } = await createAdminClient().from("restaurants").update({ [field]: value }).eq("id", restaurantId);
  if (!error) return { ok: true };
  if (isMissingColumn(error)) return { ok: false, status: 503, error: "Cette fonction n'est pas encore activée." };
  return failed(field, error);
}

/** Ce que le dernier client à ouvrir la page a vu depuis `sinceIso` (compteur `fiche_vue_…`), ou `null`. */
export async function lastHoursView(restaurantId: string, sinceIso: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("site_order_refusals")
    .select("reason")
    .eq("restaurant_id", restaurantId)
    .like("reason", `${VIEW_REASON_PREFIX}%`)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`site_order_refusals : ${error.message}`);
  }
  return ((data ?? [])[0] as { reason?: string } | undefined)?.reason ?? null;
}
