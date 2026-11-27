// ADR 0112 §5 — un article n'invite pas à commander quand la page de commande refuserait la commande. La règle « ouvert
// ou fermé » est CELLE DE LA PAGE (lib/site-orders/hours-source.ts) : fermetures saisies, horaires choisis, fiche
// Google lue à l'instant, repli. Rien de la fiche n'est gardé : seulement le verdict, sous un motif nommé. PUR, testé.

import type { FicheRead } from "../../site-orders/fiche";
import { decideHours, needsGoogleForOrder } from "../../site-orders/hours-source";
import type { PageSettings } from "../../site-orders/page-settings";
import type { AutoReason } from "./reasons";
import { endOfDay, publishAt, serviceEnd, serviceStart } from "./time";
import type { Facts } from "./types";

/** Le moment dont parle l'article : il faut que le restaurant soit ouvert à un instant au moins de ce moment. */
export type OpeningWindow = { from: string; to: string };

/** `inconnus` : aucune source n'a d'horaires ; `illisibles` : la lecture a échoué, on ne sait pas. */
export type OpeningVerdict = "ouvert" | "ferme" | "inconnus" | "illisibles";

export function openingWindow(facts: Facts, day: string): OpeningWindow {
  switch (facts.kind) {
    // « Passe ta commande avant le coup d'envoi » : de la publication au coup d'envoi.
    case "match": return { from: publishAt(day), to: facts.kickoffUtc };
    // Le service dont parle la prévision.
    case "meteo": return { from: serviceStart(day, facts.service), to: serviceEnd(day, facts.service) };
    // Événement et promo : de la publication à la fin du jour.
    default: return { from: publishAt(day), to: endOfDay(day) };
  }
}

/** `readGoogle` n'est appelé que si la fiche peut changer la réponse (jamais avec ses propres horaires ni un jour fermé). */
export async function openDuring(settings: PageSettings, readGoogle: () => Promise<FicheRead>, window: OpeningWindow): Promise<OpeningVerdict> {
  const from = new Date(window.from);
  const read = needsGoogleForOrder(settings, from) ? await readGoogle() : null;
  const { openness, cause } = decideHours(settings, read, from);
  if (openness.state === "ouvert") return "ouvert";
  if (openness.state === "ferme") return openness.opens && Date.parse(openness.opens.at) < Date.parse(window.to) ? "ouvert" : "ferme";
  return cause === "lecture_impossible" ? "illisibles" : "inconnus";
}

const REASONS: Record<Exclude<OpeningVerdict, "ouvert">, AutoReason> = {
  ferme: "ferme_ce_jour",
  inconnus: "horaires_inconnus",
  illisibles: "horaires_illisibles",
};

/** La raison nommée, ou `null` quand le restaurant est ouvert. */
export const openingReason = (v: OpeningVerdict): AutoReason | null => (v === "ouvert" ? null : REASONS[v]);
