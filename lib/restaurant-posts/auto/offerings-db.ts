// ADR 0112 — la SEULE lecture de « Ce que tu proposes » pour les articles automatiques : les réglages de la page de
// commande (« Infos de ma page »). SERVEUR UNIQUEMENT. Sans leur migration, tout est faux : on ne parle que d'emporter.

import { readPageSettings } from "../../site-orders/page-settings-db";
import { offeringsOf } from "./offerings";
import type { Offerings } from "./types";

export async function readOfferings(restaurantId: string): Promise<Offerings> {
  return offeringsOf((await readPageSettings(restaurantId)).offers);
}
