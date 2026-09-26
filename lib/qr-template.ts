// Supports QR imprimables — quels établissements portent le design Belchicken
// (maquette Claude Design « Templates QR Belchicken » : fond clair, cadre
// accent, copy bilingue FR/NL, QR noir pur niveau H). D'abord livré pour
// Kraainem seul, étendu le 2026-09-26 aux trois Belchicken (Houba, Uccle De
// Bue). Les autres établissements gardent le template générique.
export const BELCHICKEN_QR_RESTAURANT_IDS: readonly string[] = ["kraainem", "houba", "de-bue"];

export function usesBelchickenQrTemplate(restaurantId: string): boolean {
  return BELCHICKEN_QR_RESTAURANT_IDS.includes(restaurantId);
}

// Mention de lieu imprimée en capitales à côté du logo (« KRAAINEM ») —
// déduite du nom de l'établissement, sans le nom de l'enseigne que le logo
// porte déjà. Nom sans enseigne reconnue → nom complet.
export function qrLocationLabel(restaurantName: string): string {
  const stripped = restaurantName.replace(/^\s*bel\s*chicken\b[\s\-–—:·]*/i, "").trim();
  return stripped || restaurantName.trim();
}
