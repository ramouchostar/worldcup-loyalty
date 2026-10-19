// ============================================================
// Réserver un prestataire (ADR 0084) — deux familles de métiers.
//
//   « tournage » (vidéo, photo) : une DATE LIE les deux parties (réservation, équipe prévenue, présence, compte-rendu du jour J,
//                                 idées de tournage, barème d'annulation en heures).
//   « atelier » (design, impression) : pas de date de tournage — le travail commence quand le prestataire le décide, pour un
//                                 jour de livraison souhaité. L'annulation est gratuite avant le début, l'acompte reste au
//                                 prestataire ensuite (décision du porteur, 2026-10-19).
//
// Fonctions PURES : tout ce qui change selon le métier le dit ici, une fois.
// ============================================================

import type { Metier } from "./mission-money";

export type MetierFamily = "tournage" | "atelier";

export const familyOf = (m: Metier): MetierFamily => (m === "video" || m === "photo" ? "tournage" : "atelier");
export const hasShoot = (m: Metier): boolean => familyOf(m) === "tournage";
export const isStudio = (m: Metier): boolean => familyOf(m) === "atelier";

/** Celui qui fait le travail, dans les mots du restaurateur (« le vidéaste lit ton brief »). */
export const PROVIDER_NOUN: Record<Metier, string> = { video: "le vidéaste", photo: "le photographe", design: "le graphiste", impression: "l'imprimeur" };
/** Avec « de » : « le devis du vidéaste ». */
export const PROVIDER_NOUN_OF: Record<Metier, string> = { video: "du vidéaste", photo: "du photographe", design: "du graphiste", impression: "de l'imprimeur" };

/** « Le vidéaste », ou son nom s'il est connu. */
export function providerLabel(m: Metier, name: string | null | undefined): string {
  if (name) return name;
  const noun = PROVIDER_NOUN[m];
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/** Ce que le prestataire livre. */
export const DELIVERABLE: Record<Metier, string> = { video: "ta vidéo", photo: "tes photos", design: "ton visuel", impression: "ton impression" };

/** Les états où une demande de modification est possible (le brief est verrouillé, le travail pas terminé). */
export function changeableStatuses(m: Metier): readonly string[] {
  return hasShoot(m) ? ["accepte", "date_bloquee"] : ["accepte", "production"];
}

/** Le prestataire d'un métier d'atelier commence son travail sans date : `accepte → production`. */
export const STUDIO_START_FROM = "accepte" as const;
