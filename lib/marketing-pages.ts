// Registre des pages publiques de la stratégie SEO (docs/strategie/seo-et-pages.md).
// Chaque page a SON fichier (app/(public)/<slug>/page.tsx) et sa mise en scène
// propre (retour de Mehdi du 2026-11-01 : pas de gabarit copié-collé). Ce
// registre ne porte que ce que partagent le pied de page, le sitemap et les
// métadonnées : slug, libellé, titre, description.
//
// Règles de texte : vouvoiement, mots du comptoir, aucune technique, aucun
// chiffre ni nom de client (dépôt public), jamais « grâce à nous » (ADR 0064),
// jamais un pourcentage de hausse promis, jamais de calcul « X € = N tickets »,
// et ce qui n'est pas livré se dit « en préparation » (ADR 0070).

import type { Metadata } from "next";
import { absoluteUrl } from "./seo-pages";

export type Pillar = "revenir" | "venir" | "main";

export type MarketingPageInfo = {
  slug: string;
  kind: "fonction" | "analyse";
  pillar?: Pillar;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
};

export const PILLAR_LABEL: Record<Pillar, string> = {
  revenir: "Faire revenir",
  venir: "Faire venir",
  main: "Garder la main",
};

export const MARKETING_PAGES: MarketingPageInfo[] = [
  {
    slug: "programme-fidelite-restaurant",
    kind: "fonction",
    pillar: "revenir",
    navLabel: "Programme de fidélité",
    metaTitle: "Programme de fidélité pour restaurant, sans rien brancher",
    metaDescription:
      "Vos clients prennent leur ticket de caisse en photo, gagnent des points et choisissent leur cadeau. Votre caisse ne change pas. Gratuit pour commencer.",
  },
  {
    slug: "relancer-vos-clients",
    kind: "fonction",
    pillar: "revenir",
    navLabel: "Relancer vos clients",
    metaTitle: "Fidéliser les clients d'un restaurant par message",
    metaDescription:
      "Écrivez à vos clients inscrits un soir calme, pour un nouveau plat ou une fête. Des clients qui sont déjà à vous : chaque message ne coûte presque rien.",
  },
  {
    slug: "publicite-restaurant",
    kind: "fonction",
    pillar: "venir",
    navLabel: "Pub de quartier",
    metaTitle: "Publicité Facebook pour restaurant, dans votre quartier",
    metaDescription:
      "Une pub Facebook et Instagram autour de votre restaurant, montée pour vous. Estimation avant de payer, offre et mot clé à dire au comptoir.",
  },
  {
    slug: "fiche-google-restaurant",
    kind: "fonction",
    pillar: "venir",
    navLabel: "Fiche Google",
    metaTitle: "Fiche d'établissement Google d'un restaurant : le guide",
    metaDescription:
      "Horaires, photos, catégorie, avis, réponses : ce qui fait qu'un client choisit votre restaurant sur Google Maps, et comment remplir votre fiche.",
  },
  {
    slug: "chiffre-affaires-restaurant",
    kind: "fonction",
    pillar: "main",
    navLabel: "Votre chiffre du jour",
    metaTitle: "Chiffre d'affaires d'un restaurant : le suivre chaque jour",
    metaDescription:
      "Votre chiffre du jour en un écran, comparé aux mêmes jours, la part qui vient de vos clients inscrits, et les jours à venir à prévoir.",
  },
  {
    slug: "food-cost-restaurant",
    kind: "fonction",
    pillar: "main",
    navLabel: "Food cost et marges",
    metaTitle: "Food cost restaurant : le coût et la marge de chaque plat",
    metaDescription:
      "Le prix de revient et la marge de chaque plat de votre carte, au même endroit. Les erreurs de food cost qui coûtent cher, et comment les éviter.",
  },
  {
    slug: "analyse-fiche-google-restaurant",
    kind: "analyse",
    navLabel: "Analyse de fiche Google",
    metaTitle: "Fiche d'établissement Google : analyse gratuite restaurant",
    metaDescription:
      "Votre fiche Google donne-t-elle envie d'entrer ? Horaires, photos, catégorie, liens : une note sur 100 en moins d'une minute, gratuite.",
  },
  {
    slug: "analyse-avis-google-restaurant",
    kind: "analyse",
    navLabel: "Analyse de vos avis",
    metaTitle: "Avis Google de votre restaurant : l'analyse gratuite",
    metaDescription:
      "Ce que vos clients répètent dans leurs avis Google, les avis restés sans réponse, votre note face à vos voisins. Analyse gratuite en une minute.",
  },
  {
    slug: "visibilite-restaurant",
    kind: "analyse",
    navLabel: "Test de visibilité",
    metaTitle: "Visibilité de votre restaurant sur Google Maps : le test",
    metaDescription:
      "Votre place sur Google Maps autour de votre restaurant, les voisins qui passent devant vous, et quoi faire. Test gratuit en moins d'une minute.",
  },
];

export const getMarketingPage = (slug: string) => MARKETING_PAGES.find((p) => p.slug === slug);

/** Métadonnées d'une page du registre (titre, description, canonical, partage). */
export function marketingMetadata(slug: string): Metadata {
  const page = getMarketingPage(slug);
  if (!page) throw new Error(`Page marketing inconnue : ${slug}`);
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      title: `${page.metaTitle} — Boosteats`,
      description: page.metaDescription,
      url: absoluteUrl(`/${page.slug}`),
      siteName: "Boosteats",
      locale: "fr_BE",
      type: "website",
      images: ["/opengraph-image"],
    },
  };
}
