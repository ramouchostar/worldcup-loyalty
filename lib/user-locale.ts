import { cache } from "react";
import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { DEFAULT_LOCALE, isLocale, normalizeLocale, type Locale } from "./i18n";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 terdecies) — la langue d'un restaurateur (colonne `profiles.locale`, migration 20261021-1400).
//
// Lue À PART de ce que lisent les gardes d'accès : si la colonne manque, rien d'autre ne tombe, et le français s'applique.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const COLUMN_MISSING = "42703";
const missing = (e: unknown) => isMissingTable(e as DbError) || (e as DbError)?.code === COLUMN_MISSING || /locale/.test((e as DbError)?.message ?? "");

/** La langue de cet utilisateur, lue une seule fois par requête. Introuvable ou colonne absente : le français. */
export const getUserLocale = cache(async (userId: string): Promise<Locale> => {
  try {
    const { data, error } = await createAdminClient().from("profiles").select("locale").eq("id", userId).maybeSingle();
    if (error) throw error;
    return normalizeLocale((data as { locale?: unknown } | null)?.locale);
  } catch (e) {
    if (!missing(e)) console.error("[user-locale] lecture impossible:", (e as Error).message);
    return DEFAULT_LOCALE;
  }
});

export async function saveUserLocale(userId: string, raw: unknown): Promise<{ ok: true; locale: Locale } | { ok: false; reason: "invalid" | "unavailable" }> {
  if (!isLocale(raw)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createAdminClient().from("profiles").update({ locale: raw }).eq("id", userId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "unavailable" };
    return { ok: true, locale: raw };
  } catch (e) {
    if (!missing(e)) console.error("[user-locale] écriture impossible:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

/** La langue d'un restaurateur d'après son adresse e-mail (pour ses e-mails). Introuvable ou colonne absente : le français. */
export async function getUserLocaleByEmail(email: string): Promise<Locale> {
  try {
    const { data, error } = await createAdminClient().from("profiles").select("locale").eq("email", email.trim()).maybeSingle();
    if (error) throw error;
    return normalizeLocale((data as { locale?: unknown } | null)?.locale);
  } catch (e) {
    if (!missing(e)) console.error("[user-locale] lecture par adresse impossible:", (e as Error).message);
    return DEFAULT_LOCALE;
  }
}
