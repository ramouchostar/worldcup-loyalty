// ADR 0108 §4 — ce que l'accueil de l'espace dit du restaurant : ouvert ou fermé (la source est choisie par
// `hours-source.ts`), la note et le nombre d'avis de la fiche Google, et les mentions que Google demande. Logique PURE et
// testée ; la lecture est dans `fiche-db.ts`. Une information absente reste absente (la page n'affiche pas sa ligne) :
// jamais une note ni une heure inventées.

import type { PlaceOrderingInfo } from "../audit/places";
import type { Openness } from "./hours";
import { decideHours, type HoursOrigin } from "./hours-source";
import { NO_SETTINGS, type PageSettings } from "./page-settings";

/** Pourquoi la fiche n'a pas été lue. Va au journal et au compteur, jamais à l'écran du client. */
export type FicheMiss = "pas_de_fiche" | "places_absent" | "lecture_impossible";
export type FicheRead = { ok: true; info: PlaceOrderingInfo } | { ok: false; cause: FicheMiss };

export type FicheView = {
  /** L'instant de la lecture, à l'horloge du serveur : la page corrige une horloge de téléphone déréglée. */
  readAt: string;
  openness: Openness;
  /** D'où vient « ouvert ou fermé ». */
  origin: HoursOrigin;
  /** Les horaires montrés viennent de Google : la mention les accompagne. */
  hoursFromGoogle: boolean;
  rating: { value: number; count: number } | null;
  attributions: { provider: string; url: string | null }[];
};

/** `read` = `null` : la fiche n'a pas pu ou pas dû être lue. Son échec ne change rien aux horaires saisis. */
export function ficheView(read: FicheRead | null, now: Date = new Date(), settings: PageSettings = NO_SETTINGS): FicheView {
  const { openness, origin, hoursFromGoogle } = decideHours(settings, read, now);
  const info = read?.ok ? read.info : null;
  const rating = info && info.rating !== null && info.rating >= 1 && info.rating <= 5 && info.reviewsCount !== null && info.reviewsCount > 0
    ? { value: info.rating, count: info.reviewsCount }
    : null;
  // Les mentions de tiers accompagnent un contenu de Google montré, jamais une page qui n'en montre aucun.
  const attributions = info && (rating || hoursFromGoogle)
    ? info.attributions.flatMap((a) => {
        const provider = (a.provider ?? "").trim();
        return provider === "" ? [] : [{ provider, url: a.providerUri && /^https?:\/\//.test(a.providerUri) ? a.providerUri : null }];
      })
    : [];
  return { readAt: now.toISOString(), openness, origin, hoursFromGoogle, rating, attributions };
}

/** Sous la barre du panier quand le restaurant est fermé : d'où vient cette réponse. */
export function closedNote(origin: HoursOrigin): string {
  if (origin === "google") return "Horaires lus sur la fiche Google du restaurant.";
  return origin === "fermeture" ? "Fermeture annoncée par le restaurant." : "Horaires donnés par le restaurant.";
}

/** « 3,5 sur 5, 156 avis Google ». */
export function ratingLabel(r: { value: number; count: number }): string {
  const value = r.value.toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value} sur 5, ${r.count.toLocaleString("fr-BE")} avis Google`;
}

// ─── La trace (ADR 0065) ─────────────────────────────────────────────────────
// Un compteur par réponse servie à la page, dans `site_order_refusals`, sans aucune donnée du client : ce que le client
// a vu et d'où venaient les horaires. La console s'en sert aussi pour dire qu'aucun horaire n'est lisible.

export const VIEW_REASON_PREFIX = "fiche_vue_";
/** Le client est arrivé par le bloc « Commander à emporter » de l'app. */
export const APP_ENTRY_REASON = "entree_app";

/** `fiche_vue_ouvert:<source>`, `fiche_vue_ferme:<source>`, `fiche_vue_inconnu:<cause>`. */
export function viewReason(read: FicheRead | null, view: FicheView): string {
  const detail = view.openness.state === "inconnu" ? (read && !read.ok ? read.cause : "sans_horaires") : view.origin;
  return `${VIEW_REASON_PREFIX}${view.openness.state}:${detail}`;
}
