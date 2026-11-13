// ADR 0099 §8 — qui peut recevoir des commandes du site : SEULEMENT le forfait Pro, parce que la commande est le module de
// Nina, et Nina n'existe qu'en Pro (ADR 0089). Deux portes, et il faut LES DEUX :
//   1. le drapeau `SITE_ORDER_RESTAURANTS` liste l'établissement (pilote, établissement par établissement) ;
//   2. son forfait est Pro et actif.
// Une panne de lecture du forfait se lit « gratuit » (`getPlan`) : la porte reste FERMÉE, jamais ouverte par erreur.
// Jamais de période d'essai pour la commande : pas de `feature_trials`, un forfait Pro actif ou rien.

import { getPlan, type Plan } from "../entitlements";
import { siteOrdersEnabledFor } from "./order";

/** La règle, pure : drapeau ouvert ET forfait Pro. */
export const siteOrdersAllowed = (flagged: boolean, plan: Plan): boolean => flagged && plan === "pro";

/** Les commandes du site sont-elles ouvertes pour cet établissement ? Le drapeau d'abord : fermé, on ne lit même pas la base. */
export async function siteOrdersAvailable(restaurantId: string): Promise<boolean> {
  if (!siteOrdersEnabledFor(restaurantId)) return false;
  return siteOrdersAllowed(true, await getPlan(restaurantId));
}
