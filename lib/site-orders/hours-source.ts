// ADR 0109 §3 (amendé le 2026-11-26) — QUELLE source dit « ouvert ou fermé ». Logique PURE et testée, la même pour la page,
// le serveur et la console. Dans l'ordre :
//   1. une fermeture saisie (aujourd'hui ou jours spéciaux) ;
//   2. si le restaurant a choisi « Les miens », ses horaires ;
//   3. sinon Google ;
//   4. si Google est muet ou en panne, ses horaires s'il en a saisi ;
//   5. sinon inconnu.
// Une fiche Google qui dit « fermé » (temporairement ou non) n'est pas un silence. La fiche n'est jamais modifiée.

import type { FicheRead } from "./fiche";
import { evaluateHours, googleBase, isClosedDay, serviceDay, weeklyBase, type HoursBase, type Openness } from "./hours";
import { allClosures, type PageSettings } from "./page-settings";

/** D'où vient la réponse : la fiche, les horaires saisis (choisis, ou en repli), une fermeture saisie, ou rien. */
export type HoursOrigin = "google" | "saisi" | "repli" | "fermeture" | "aucune";

/** Pourquoi aucun horaire n'est lisible. Va au journal, aux compteurs et à l'alerte du gérant. */
export type HoursCause = "pas_de_fiche" | "places_absent" | "lecture_impossible" | "sans_horaires";

export type Decision = {
  openness: Openness;
  origin: HoursOrigin;
  cause: HoursCause | null;
  /** La réponse montre quelque chose qui vient de Google (la mention « Google Maps » l'accompagne alors, et seulement alors). */
  hoursFromGoogle: boolean;
};

/** « Les miens » est choisi et une semaine est saisie : Google n'a plus son mot à dire sur les horaires. */
export const usesOwnHours = (s: PageSettings): boolean => s.source === "manual" && s.weekly !== null;

/** Le restaurant a lui-même fermé le jour de service en cours. */
export const closedByRestaurant = (s: PageSettings, now: Date): boolean => isClosedDay(allClosures(s), serviceDay(now));

/** L'envoi d'une commande doit-il lire la fiche ? Jamais avec ses propres horaires ni pendant une fermeture saisie. */
export const needsGoogleForOrder = (s: PageSettings, now: Date): boolean => !usesOwnHours(s) && !closedByRestaurant(s, now);

/** `read` = `null` quand la fiche n'a pas été lue (pas nécessaire). */
export function decideHours(s: PageSettings, read: FicheRead | null, now: Date = new Date()): Decision {
  const google: HoursBase | null =
    usesOwnHours(s) || read === null || !read.ok ? null
      : googleBase({ businessStatus: read.info.businessStatus, current: read.info.currentOpeningHours, regular: read.info.regularOpeningHours }, now);
  let base: HoursBase = { kind: "unknown" };
  let origin: HoursOrigin = "aucune";
  if (usesOwnHours(s)) { base = weeklyBase(s.weekly!, now); origin = "saisi"; }
  else if (google && google.kind !== "unknown") { base = google; origin = "google"; }
  // Le repli ne sert que si Google a été interrogé et n'a rien dit : une fiche non lue n'est pas une fiche muette.
  else if (read !== null && s.weekly) { base = weeklyBase(s.weekly, now); origin = "repli"; }

  const openness = evaluateHours(base, allClosures(s), now);
  if (closedByRestaurant(s, now)) {
    // Pendant une fermeture, seule l'heure de réouverture peut venir de la source.
    return { openness, origin: "fermeture", cause: null, hoursFromGoogle: origin === "google" && openness.state === "ferme" && openness.opens !== null };
  }
  const cause: HoursCause | null = openness.state !== "inconnu" ? null : read && !read.ok ? read.cause : "sans_horaires";
  return { openness, origin, cause, hoursFromGoogle: origin === "google" };
}

/** La décision au moment d'un envoi : la fiche n'est lue QUE si elle peut changer la réponse. */
export async function decideForOrder(s: PageSettings, readGoogle: () => Promise<FicheRead>, now: Date = new Date()): Promise<Decision> {
  return decideHours(s, needsGoogleForOrder(s, now) ? await readGoogle() : null, now);
}

/** Le jour de service que « Fermer pour aujourd'hui » ferme : le service en cours s'il y en a un (même après minuit), sinon la date du jour. */
export const dayToClose = (openness: Openness, now: Date, calendarDay: string): string => (openness.state === "ouvert" ? serviceDay(now) : calendarDay);
