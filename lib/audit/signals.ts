// ADR 0068 — les signaux d'un audit, réduits à des niveaux discrets.
//
// Le moteur de recommandations (lib/audit/scenarios.ts) ne lit jamais les
// données brutes : il lit ces niveaux, calculés une fois par volet. `null`
// veut dire « non vérifié » (source en panne ou absente) — un scénario qui
// dépend d'un signal null ne se déclenche pas : on ne recommande rien sur une
// information qu'on n'a pas lue.

export type RatingBand = "fragile" | "moyenne" | "bonne" | "excellente";
export type Trend = "baisse" | "stable" | "hausse";
export type Level = "faible" | "moyen" | "fort";
export type PriceLevel = "eco" | "moyen" | "premium";
export type CompetitivePosition = "derriere" | "au_niveau" | "devant";
export type ChannelMix = "plateformes_dominantes" | "equilibre" | "direct_dominant";
export type SocialState = "absent" | "dormant" | "irregulier" | "actif_peu_engage" | "performant";

export const NEGATIVE_THEMES = [
  "attente",
  "livraison_froide",
  "accueil",
  "prix",
  "proprete",
  "qualite_irreguliere",
  "erreurs_commande",
  "portions",
] as const;
export type NegativeTheme = (typeof NEGATIVE_THEMES)[number];

export const FICHE_GAPS = [
  "categorie_vague",
  "nom_surcharge",
  "pas_de_site",
  "site_facebook",
  "pas_de_telephone",
  "horaires_absents",
  "horaires_exceptionnels",
  "photos_peu_nombreuses",
  "photos_anciennes",
  "pas_de_photos_proprietaire",
  "pas_de_description",
  "pas_de_menu",
  "pas_de_lien_commande",
  "pas_de_reservation",
  "attributs_incomplets",
] as const;
export type FicheGap = (typeof FICHE_GAPS)[number];

export interface AuditSignals {
  rating: RatingBand | null;
  trend: Trend | null;
  /** Volume d'avis comparé à la médiane des concurrents à moins de 600 m. */
  reviewVolume: Level | null;
  /** Part des avis des 12 derniers mois qui ont une réponse du propriétaire. */
  responseRate: Level | null;
  /** Thèmes négatifs cités dans au moins 8 % des avis 1–3★, du plus au moins fréquent. */
  negativeThemes: NegativeTheme[];
  ficheGaps: FicheGap[];
  /** Manques que la majorité des concurrents directs, eux, ont comblés. */
  gapsCoveredByCompetitors: FicheGap[];
  instagram: SocialState | null;
  tiktok: SocialState | null;
  /** Réponse du gérant (volet E) ; null tant que la question n'a pas été posée. */
  channelMix: ChannelMix | null;
  price: PriceLevel | null;
  position: CompetitivePosition | null;
}

// Seuils de découpage, en un seul endroit pour être recalibrés sur les vingt
// premiers audits (ADR 0068 §3).
export function ratingBand(rating: number | null): RatingBand | null {
  if (rating == null) return null;
  if (rating < 3.8) return "fragile";
  if (rating < 4.2) return "moyenne";
  if (rating < 4.5) return "bonne";
  return "excellente";
}

export function responseLevel(share: number | null): Level | null {
  if (share == null) return null;
  if (share < 0.2) return "faible";
  if (share < 0.7) return "moyen";
  return "fort";
}

/** Plateformes = Uber Eats + Deliveroo + Takeaway.com, en % du CA déclaré. */
export function channelMix(platformShare: number | null, directShare: number | null): ChannelMix | null {
  if (platformShare == null || directShare == null) return null;
  if (platformShare >= 50) return "plateformes_dominantes";
  if (directShare >= 70) return "direct_dominant";
  return "equilibre";
}
