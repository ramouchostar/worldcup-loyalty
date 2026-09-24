// ADR 0069 — les signaux d'un audit, réduits à des niveaux discrets.
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
export type Speed = "rapide" | "moyen" | "lent";
export type Gap = "petit" | "moyen" | "grand";
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
  /** Volet E — marge du produit phare, déclarée par le gérant. */
  heroMargin: Level | null;
  /** Volet E — temps de préparation moyen du produit phare. */
  prepSpeed: Speed | null;
  /** Volet E — écart entre le CA mensuel actuel et l'objectif déclaré. */
  revenueGap: Gap | null;
  price: PriceLevel | null;
  position: CompetitivePosition | null;
}

// Seuils de découpage, en un seul endroit pour être recalibrés sur les vingt
// premiers audits (ADR 0069 §3).
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

/** Marge en % du prix de vente. */
export function marginLevel(pct: number | null): Level | null {
  if (pct == null) return null;
  if (pct < 55) return "faible";
  if (pct < 70) return "moyen";
  return "fort";
}

export function prepSpeed(minutes: number | null): Speed | null {
  if (minutes == null) return null;
  if (minutes < 8) return "rapide";
  if (minutes <= 15) return "moyen";
  return "lent";
}

export function revenueGap(current: number | null, target: number | null): Gap | null {
  if (current == null || target == null || current <= 0) return null;
  const pct = (target - current) / current;
  if (pct < 0.1) return "petit";
  if (pct <= 0.3) return "moyen";
  return "grand";
}

/** Les réponses du gérant (volet E), telles que saisies. */
export interface OwnerAnswers {
  channels: { surPlace: number; emporter: number; uberEats: number; deliveroo: number; takeaway: number; direct: number } | null;
  heroProduct: string | null;
  heroMarginPct: number | null;
  prepMinutes: number | null;
  monthlyRevenue: number | null;
  monthlyRevenueTarget: number | null;
}

/** Ajoute aux signaux mesurés ce que les réponses du gérant permettent de trancher. */
export function withAnswers(signals: AuditSignals, a: OwnerAnswers): AuditSignals {
  const c = a.channels;
  const platforms = c ? c.uberEats + c.deliveroo + c.takeaway : null;
  const direct = c ? c.surPlace + c.emporter + c.direct : null;
  return {
    ...signals,
    channelMix: channelMix(platforms, direct),
    heroMargin: marginLevel(a.heroMarginPct),
    prepSpeed: prepSpeed(a.prepMinutes),
    revenueGap: revenueGap(a.monthlyRevenue, a.monthlyRevenueTarget),
  };
}
