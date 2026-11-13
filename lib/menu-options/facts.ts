// ADR 0100 §10 — ce qui est DÉJÀ enregistré pour chaque plat (description, allergènes confirmés), lu pour l'aperçu du site.
// Fail-open : une colonne absente (migration pas encore appliquée) se lit « rien d'enregistré », jamais une erreur.

import { createAdminClient } from "../supabase";
import { isAllergenKey, type AllergenKey } from "./pdf";
import type { FactsById } from "./site-preview";

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

type Row = { id: string; description?: string | null; description_source?: string | null; allergens?: string[] | null };

/** Les descriptions et allergènes enregistrés, par plat ; `{}` si les colonnes n'existent pas encore. */
export async function readItemFacts(restaurantId: string): Promise<FactsById> {
  const admin = createAdminClient();
  // On essaie d'abord tout ; si une migration manque, on se rabat sur ce qui existe, puis sur rien.
  for (const cols of ["id, description, description_source, allergens", "id, description, description_source", "id"]) {
    const { data, error } = await admin.from("menu_items").select(cols).eq("restaurant_id", restaurantId).eq("is_active", true);
    if (error) {
      if (isMissingColumn(error)) continue;
      throw new Error(`menu_items (faits) : ${error.message}`);
    }
    return Object.fromEntries(((data ?? []) as unknown as Row[]).map((r) => [r.id, {
      description: r.description ?? null,
      descriptionSource: r.description_source ?? null,
      allergens: Array.isArray(r.allergens) ? (r.allergens.filter(isAllergenKey) as AllergenKey[]) : null,
    }]));
  }
  return {};
}
