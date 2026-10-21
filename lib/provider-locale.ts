import { cache } from "react";
import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { DEFAULT_LOCALE, isLocale, normalizeLocale, type Locale } from "./i18n";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 terdecies) — la langue d'un prestataire.
//
// Lue À PART du reste de la fiche (`PROVIDER_COLUMNS`) : si la migration 20261021-1300 manque, la colonne n'existe pas et une lecture
// groupée ferait tomber TOUT l'espace prestataire. Ici, une colonne absente donne le français, sans bruit ni plantage.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const COLUMN_MISSING = "42703";
const missing = (e: unknown) => isMissingTable(e as DbError) || (e as DbError)?.code === COLUMN_MISSING || /locale/.test((e as DbError)?.message ?? "");

/** La langue du prestataire, lue une seule fois par requête (la coque et la page la demandent toutes les deux). */
export const getProviderLocale = cache(async (providerId: string): Promise<Locale> => {
  try {
    const { data, error } = await createAdminClient().from("providers").select("locale").eq("id", providerId).maybeSingle();
    if (error) throw error;
    return normalizeLocale((data as { locale?: unknown } | null)?.locale);
  } catch (e) {
    if (!missing(e)) console.error("[provider-locale] lecture impossible:", (e as Error).message);
    return DEFAULT_LOCALE;
  }
});

export async function saveProviderLocale(providerId: string, raw: unknown): Promise<{ ok: true; locale: Locale } | { ok: false; reason: "invalid" | "unavailable" }> {
  if (!isLocale(raw)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createAdminClient().from("providers").update({ locale: raw }).eq("id", providerId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "unavailable" };
    return { ok: true, locale: raw };
  } catch (e) {
    if (!missing(e)) console.error("[provider-locale] écriture impossible:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}
