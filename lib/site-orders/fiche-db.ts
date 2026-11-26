// ADR 0108 §4 — lire la fiche Google d'un établissement pour l'espace de commande (SERVEUR UNIQUEMENT). AUCUN cache, ni en
// base ni en mémoire : les conditions Google Maps Platform n'autorisent à garder que la latitude, la longitude et
// l'identifiant de fiche. Chaque appel à `readFiche` d'un établissement qui a une fiche coûte donc UN appel
// « Place Details Enterprise ».

import { isPlacesConfigured, placeOrderingInfo } from "../audit/places";
import { createAdminClient } from "../supabase";
import type { FicheRead } from "./fiche";

/** Une colonne `google_place_id` absente (migration 20261001-2321) se lit « pas de fiche », pas comme une panne. */
const isMissingColumn = (error: { code?: string; message?: string }) =>
  error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? "");

/** La note est un simple affichage : la page l'attend moins longtemps que des horaires. */
const RATING_TIMEOUT_MS = 2_500;

/**
 * Une panne de NOTRE base remonte (elle lève : la commande répond alors « indisponible » et le secours WhatsApp s'ouvre).
 * Tout ce qui empêche de lire la fiche (pas de fiche reliée, pas de clé, Google muet) rend une cause nommée, dite dans les
 * journaux. `wanted = "note"` : le restaurant montre ses propres horaires, la fiche ne sert qu'à la note. `"console"` ajoute
 * l'adresse et le téléphone de la fiche pour l'écran « Infos de ma page ».
 */
export async function readFiche(restaurantId: string, wanted: "horaires" | "note" | "console" = "horaires"): Promise<FicheRead> {
  const { data, error } = await createAdminClient().from("restaurants").select("google_place_id").eq("id", restaurantId).maybeSingle();
  if (error && !isMissingColumn(error)) throw new Error(`restaurants (fiche) : ${error.message}`);
  const placeId = (data as { google_place_id?: string | null } | null)?.google_place_id ?? null;
  if (!placeId) return miss(restaurantId, "pas_de_fiche", wanted);
  if (!isPlacesConfigured()) return miss(restaurantId, "places_absent", wanted);
  try {
    return { ok: true, info: await placeOrderingInfo(placeId, wanted === "note" ? RATING_TIMEOUT_MS : undefined, wanted) };
  } catch (e) {
    console.error(`[site-orders-fiche] restaurant=${restaurantId} lecture impossible :`, e instanceof Error ? e.message : e);
    return { ok: false, cause: "lecture_impossible" };
  }
}

function miss(restaurantId: string, cause: "pas_de_fiche" | "places_absent", wanted: "horaires" | "note" | "console"): FicheRead {
  console.warn(`[site-orders-fiche] restaurant=${restaurantId} ${wanted === "note" ? "note non lue" : "fiche non lue"} : ${cause}`);
  return { ok: false, cause };
}
