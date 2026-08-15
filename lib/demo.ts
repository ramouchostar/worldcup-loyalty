import type { SupabaseClient } from "@supabase/supabase-js";

// ADR 0033 — établissements de démonstration.
//
// Un établissement démo (`restaurants.is_demo`) est un resto fictif qui sert à
// montrer le produit à un prospect. Il vit dans la MÊME table et suit le même
// code que les vrais : aucune branche « mode démo » nulle part, sinon la démo
// finit par diverger du produit et ne prouve plus rien.
//
// Sa seule différence est de périmètre : il n'apparaît sur AUCUNE surface
// publique (accueil, /secteurs, /join) et ne compte dans AUCUN chiffre réseau
// (/platform/stats par défaut). Il reste accessible par son URL directe
// (/r/[id]) — c'est précisément ce qu'on ouvre devant un restaurateur.
//
// « Live » = `status = 'active' AND is_demo = false` : ce que le réseau montre
// et ce qu'on a le droit de compter comme traction.

// Postgres : colonne inconnue. m56 pas encore appliquée en base → on refait la
// requête sans le filtre plutôt que de casser une landing publique (même
// philosophie fail-open que lib/entitlements.ts et lib/budget.ts).
const UNDEFINED_COLUMN = "42703";

function isMissingDemoColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === UNDEFINED_COLUMN || /is_demo/.test(error.message ?? "");
}

/**
 * Établissements visibles du réseau : actifs et non-démo.
 *
 * Accepte indifféremment le client anon (RLS `restaurants_public_read`) et le
 * client service-role — les deux surfaces publiques utilisent l'un ou l'autre.
 * `columns` suit la syntaxe `select()` de PostgREST.
 */
export async function listLiveRestaurants<T = Record<string, unknown>>(
  client: SupabaseClient,
  columns: string
): Promise<T[]> {
  const withFilter = await client
    .from("restaurants")
    .select(columns)
    .eq("status", "active")
    .eq("is_demo", false);

  if (!withFilter.error) return (withFilter.data ?? []) as T[];
  if (!isMissingDemoColumn(withFilter.error)) throw withFilter.error;

  const withoutFilter = await client.from("restaurants").select(columns).eq("status", "active");
  if (withoutFilter.error) throw withoutFilter.error;
  return (withoutFilter.data ?? []) as T[];
}

/** Identifiants des établissements visibles — pour borner un `.in()` (adhésions, commandes). */
export async function listLiveRestaurantIds(client: SupabaseClient): Promise<string[]> {
  const rows = await listLiveRestaurants<{ id: string }>(client, "id");
  return rows.map((r) => r.id);
}

/**
 * Tous les établissements du réseau pour les surfaces super-admin — démo
 * comprise, c'est justement ce qu'on vient administrer.
 *
 * Deux jeux de colonnes : celui de m56 et son repli historique. Tant que la
 * migration n'est pas appliquée, la console reste utilisable et le dit
 * (`demoColumnMissing`) au lieu de laisser croire que le réseau n'a aucun
 * compte démo.
 */
export async function selectRestaurantsWithDemo<T>(
  client: SupabaseClient,
  columnsWithDemo: string,
  columnsWithoutDemo: string
): Promise<{ rows: T[]; demoColumnMissing: boolean }> {
  const full = await client
    .from("restaurants")
    .select(columnsWithDemo)
    .order("created_at", { ascending: false });
  if (!full.error) return { rows: (full.data ?? []) as T[], demoColumnMissing: false };
  if (!isMissingDemoColumn(full.error)) throw full.error;

  const legacy = await client
    .from("restaurants")
    .select(columnsWithoutDemo)
    .order("created_at", { ascending: false });
  if (legacy.error) throw legacy.error;
  return { rows: (legacy.data ?? []) as T[], demoColumnMissing: true };
}
