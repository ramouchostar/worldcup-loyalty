// ADR 0069 §6 — fin du rapport : les 5 avantages Boosteats les plus utiles
// pour CE restaurant, choisis à partir des signaux de l'audit (pas une liste
// figée). Pur et testé.
//
// Règle : chaque avantage correspond à ce que l'app fait déjà (fidélité,
// demande d'avis, retour privé, parrainage, annonces, jetons réseaux, suivi
// mensuel). Formulation courte : un titre et une phrase.

import { REVIEWS_PHRASE } from "./scenarios";
import type { AuditSignals, OwnerAnswers } from "./signals";

export type AdvantageKey = "fidelite" | "avis" | "prive" | "parrainage" | "annonces" | "reseaux" | "direct" | "suivi";

export interface Advantage {
  key: AdvantageKey;
  title: string;
  text: string;
}

const CATALOG: Record<AdvantageKey, Omit<Advantage, "key">> = {
  fidelite: { title: "Vos clients reviennent", text: "Des points à chaque ticket, un cadeau qu'ils choisissent. Votre marge est protégée." },
  avis: { title: "Plus d'avis Google", text: `${REVIEWS_PHRASE}, juste après leur visite.` },
  prive: { title: "Les déçus vous le disent d'abord", text: "Un client mécontent vous écrit en privé : vous réparez avant l'avis public." },
  parrainage: { title: "Ils en amènent d'autres", text: "Vos clients invitent leurs amis par WhatsApp et forment des équipes." },
  annonces: { title: "Un message, et ils reviennent", text: "Une nouveauté, un plat du jour : vos clients sont prévenus en un geste." },
  reseaux: { title: "Plus d'abonnés", text: "Vos clients sont encouragés à suivre votre Instagram, TikTok et Facebook." },
  direct: { title: "Moins de commissions", text: "Le client récompensé au comptoir revient chez vous, pas par l'appli de livraison." },
  suivi: { title: "Vous voyez ce qui marche", text: "Chaque mois : combien sont revenus, combien de tickets, ce qu'ils ont dépensé." },
};

const weakSocial = (s: AuditSignals["instagram"]) => s === "absent" || s === "dormant" || s === "irregulier" || s === "actif_peu_engage";

/** Les `n` avantages les plus utiles, du plus au moins important. */
export function boosteatsAdvantages(signals: AuditSignals | null, answers: OwnerAnswers | null = null, n = 5): Advantage[] {
  const s = signals;
  const score: Record<AdvantageKey, number> = {
    fidelite: 0, // toujours en tête (voir plus bas)
    avis: 5,
    prive: 3,
    parrainage: 4,
    annonces: 3,
    reseaux: 2,
    direct: 2,
    suivi: 3.5,
  };
  if (s) {
    if (s.reviewVolume === "faible") score.avis += 4;
    if (s.reviewVolume === "moyen") score.avis += 2;
    if (s.rating === "fragile" || s.rating === "moyenne") score.avis += 2;
    if ((s.negativeThemes ?? []).length > 0) score.prive += 1.5 + (s.negativeThemes ?? []).length * 0.5;
    if (s.trend === "baisse") score.prive += 2;
    if (s.rating === "fragile" || s.rating === "moyenne") score.prive += 1.5;
    if (s.position === "derriere") score.parrainage += 1.5;
    if (s.reviewVolume === "faible") score.parrainage += 1;
    if (weakSocial(s.instagram) || weakSocial(s.tiktok)) score.reseaux += 2.5;
    if (s.instagram === "absent" && s.tiktok === "absent") score.reseaux -= 1; // rien à suivre encore
    if (s.channelMix === "plateformes_dominantes") score.direct += 5;
    if (s.channelMix === "equilibre") score.direct += 2;
    if (s.platformsOutrankUs || s.seoGaps?.includes("seo_commande_plateformes") || (s.ficheGaps ?? []).includes("pas_de_lien_commande")) score.direct += 2;
    if (s.channelMix === "direct_dominant") score.annonces += 1.5;
    if (s.revenueGap === "moyen" || s.revenueGap === "grand") score.suivi += 1;
  }
  if (answers?.heroProduct) score.annonces += 1;
  // La fidélité ouvre toujours la liste ; les autres sont classés par l'audit.
  const rest = (Object.keys(CATALOG) as AdvantageKey[])
    .filter((key) => key !== "fidelite")
    .map((key, i) => ({ key, w: score[key] - i * 0.01 })) // à égalité : ordre du catalogue
    .sort((a, b) => b.w - a.w)
    .map(({ key }) => key);
  return (["fidelite", ...rest] as AdvantageKey[]).slice(0, n).map((key) => ({ key, ...CATALOG[key] }));
}
