// ============================================================
// Calendriers scolaires d'un établissement (ADR 0027 §5, amendé 2026-08-22).
//
// La Belgique a 3 calendriers de congés scolaires (communautés FR / NL / DE)
// et, à Bruxelles, la clientèle d'un resto suit souvent les écoles
// francophones ET néerlandophones. Le restaurateur choisit donc de 1 à 3
// calendriers. Source de vérité : `restaurants.school_calendars TEXT[]`
// (migration 20260822-2245) ; `school_calendar` (une valeur) reste un miroir
// legacy = premier élément, et sert de repli si la migration n'est pas
// encore appliquée (fail-open).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type SchoolCommunity = "FR" | "NL" | "DE";

export const SCHOOL_COMMUNITIES: { code: SchoolCommunity; label: string; short: string }[] = [
  { code: "FR", label: "Communauté française (Wallonie–Bruxelles)", short: "écoles francophones" },
  { code: "NL", label: "Communauté flamande", short: "écoles néerlandophones" },
  { code: "DE", label: "Communauté germanophone", short: "écoles germanophones" },
];

export const MAX_SCHOOL_CALENDARS = 3;

const VALID = new Set<string>(SCHOOL_COMMUNITIES.map((c) => c.code));

/** Libellé court d'une communauté (« écoles francophones »). */
export function schoolCommunityShort(code: SchoolCommunity): string {
  return SCHOOL_COMMUNITIES.find((c) => c.code === code)?.short ?? code;
}

/**
 * Nettoie une liste brute (formulaire, base) : valeurs valides, dédoublonnées,
 * dans l'ordre FR → NL → DE, plafonnées à 3. Une liste vide = « non défini ».
 */
export function parseSchoolCalendars(raw: unknown): SchoolCommunity[] {
  const list = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  const set = new Set<SchoolCommunity>();
  for (const v of list) {
    const s = String(v).trim().toUpperCase();
    if (VALID.has(s)) set.add(s as SchoolCommunity);
  }
  return SCHOOL_COMMUNITIES.map((c) => c.code)
    .filter((c) => set.has(c))
    .slice(0, MAX_SCHOOL_CALENDARS);
}

/** Lit les calendriers d'une ligne `restaurants` (nouvelle colonne, sinon legacy). */
export function schoolCalendarsFromRow(
  row: { school_calendars?: unknown; school_calendar?: unknown } | null | undefined
): SchoolCommunity[] {
  if (!row) return [];
  const multi = parseSchoolCalendars(row.school_calendars);
  if (multi.length > 0) return multi;
  return parseSchoolCalendars(row.school_calendar);
}

/** Colonnes à écrire pour une liste donnée (nouvelle + miroir legacy). */
export function schoolCalendarsColumns(list: SchoolCommunity[]): {
  school_calendars: SchoolCommunity[] | null;
  school_calendar: SchoolCommunity | null;
} {
  const clean = parseSchoolCalendars(list);
  return {
    school_calendars: clean.length ? clean : null,
    school_calendar: clean[0] ?? null,
  };
}

/** Vrai si l'erreur Supabase vient de l'absence de la colonne `school_calendars`. */
export function isMissingSchoolCalendarsColumn(error: { message?: string } | null | undefined): boolean {
  return !!error?.message && /school_calendars/.test(error.message) && /column|schema cache/i.test(error.message);
}

/**
 * Calendriers d'un établissement, avec repli sur la colonne legacy si la
 * migration n'est pas appliquée (le code ne doit jamais casser pour ça).
 */
export async function getSchoolCalendars(
  admin: SupabaseClient,
  restaurantId: string
): Promise<SchoolCommunity[]> {
  const first = await admin
    .from("restaurants")
    .select("school_calendar, school_calendars")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!first.error) return schoolCalendarsFromRow(first.data);
  if (!isMissingSchoolCalendarsColumn(first.error)) return [];
  const legacy = await admin.from("restaurants").select("school_calendar").eq("id", restaurantId).maybeSingle();
  return schoolCalendarsFromRow(legacy.data);
}
