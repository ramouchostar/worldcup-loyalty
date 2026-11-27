// ADR 0112 — « Ce que tu proposes » (terrasse, sur place, écran). La SEULE lecture de ces informations pour les
// articles automatiques.
//
// À RACCORDER : elles sont enregistrées par le chantier « accueil » (autre branche). Tant que ce n'est pas fait, tout
// est faux : un article automatique ne parle alors que de commande à emporter. Raccorder = remplacer le corps de cette
// fonction, rien d'autre.

import type { Offerings } from "./types";

export const NO_OFFERINGS: Offerings = { terrace: false, onSite: false, screen: false };

export async function readOfferings(restaurantId: string): Promise<Offerings> {
  void restaurantId;
  return NO_OFFERINGS;
}
