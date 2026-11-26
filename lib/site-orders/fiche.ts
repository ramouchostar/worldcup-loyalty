// ADR 0108 §4 — ce que la fiche Google apporte à l'accueil de l'espace : ouvert ou fermé, la note et le nombre d'avis, et
// les mentions que Google demande. Logique PURE et testée ; la lecture est dans `fiche-db.ts`. Une information absente
// reste absente (la page n'affiche pas sa ligne) : jamais une note ni une heure inventées.

import type { PlaceOrderingInfo } from "../audit/places";
import { computeOpenness, type Openness } from "./hours";

/** Pourquoi la fiche n'a pas été lue. Va au journal et au compteur, jamais à l'écran du client. */
export type FicheMiss = "pas_de_fiche" | "places_absent" | "lecture_impossible";
export type FicheRead = { ok: true; info: PlaceOrderingInfo } | { ok: false; cause: FicheMiss };

export type FicheView = {
  /** L'instant de la lecture, à l'horloge du serveur : la page corrige une horloge de téléphone déréglée. */
  readAt: string;
  openness: Openness;
  rating: { value: number; count: number } | null;
  attributions: { provider: string; url: string | null }[];
};

export function ficheView(read: FicheRead, now: Date = new Date()): FicheView {
  const readAt = now.toISOString();
  if (!read.ok) return { readAt, openness: { state: "inconnu" }, rating: null, attributions: [] };
  const { info } = read;
  const rated = info.rating !== null && info.rating >= 1 && info.rating <= 5 && info.reviewsCount !== null && info.reviewsCount > 0;
  return {
    readAt,
    openness: computeOpenness({ businessStatus: info.businessStatus, current: info.currentOpeningHours, regular: info.regularOpeningHours }, now),
    rating: rated ? { value: info.rating as number, count: info.reviewsCount as number } : null,
    attributions: info.attributions.flatMap((a) => {
      const provider = (a.provider ?? "").trim();
      return provider === "" ? [] : [{ provider, url: a.providerUri && /^https?:\/\//.test(a.providerUri) ? a.providerUri : null }];
    }),
  };
}

/** « 3,5 sur 5, 156 avis Google ». */
export function ratingLabel(r: { value: number; count: number }): string {
  const value = r.value.toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value} sur 5, ${r.count.toLocaleString("fr-BE")} avis Google`;
}

// ─── La trace (ADR 0065) ─────────────────────────────────────────────────────
// Un compteur par lecture servie à la page, dans `site_order_refusals`, sans aucune donnée du client. Chaque ligne
// correspond à une lecture de la fiche : elle dit ce que le client a vu ET ce que la visite a coûté chez Google.

export const VIEW_REASON_PREFIX = "fiche_vue_";
/** Le client est arrivé par le bloc « Commander à emporter » de l'app. */
export const APP_ENTRY_REASON = "entree_app";

/** `fiche_vue_ouvert`, `fiche_vue_ferme`, `fiche_vue_inconnu:<cause>`. */
export function viewReason(read: FicheRead, view: FicheView): string {
  const base = `${VIEW_REASON_PREFIX}${view.openness.state}`;
  return view.openness.state === "inconnu" ? `${base}:${read.ok ? "sans_horaires" : read.cause}` : base;
}
