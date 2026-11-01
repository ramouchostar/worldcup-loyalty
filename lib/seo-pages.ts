// Pages publiques indexables du site restaurateurs — une seule liste, lue par
// app/sitemap.ts. Stratégie : docs/strategie/seo-et-pages.md (2026-11-01).
//
// Une nouvelle page publique s'ajoute ICI (sinon Google ne la trouve pas par
// le sitemap) ; une page privée (console, plateforme, rapport d'audit partagé,
// API) ne s'y ajoute jamais et reste fermée dans app/robots.ts.

import { SITE_ORIGIN } from "./site";

export type SeoPage = {
  path: string;
  /** Date de la dernière vraie modification du contenu (AAAA-MM-JJ). */
  updated: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
};

export const SEO_PAGES: SeoPage[] = [
  { path: "/", updated: "2026-11-01", priority: 1, changeFrequency: "weekly" },
  { path: "/audit-gratuit", updated: "2026-11-01", priority: 0.9, changeFrequency: "monthly" },
  { path: "/become-a-partner", updated: "2026-11-01", priority: 0.7, changeFrequency: "monthly" },
  { path: "/membres", updated: "2026-11-01", priority: 0.4, changeFrequency: "monthly" },
  { path: "/conditions-restaurateurs", updated: "2026-11-01", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", updated: "2026-11-01", priority: 0.1, changeFrequency: "yearly" },
  { path: "/terms", updated: "2026-11-01", priority: 0.1, changeFrequency: "yearly" },
];

/** Préfixes jamais indexés : espaces connectés, liens privés, API. */
export const PRIVATE_PREFIXES = [
  "/admin",
  "/platform",
  "/api",
  "/compte",
  "/coupon",
  "/prestataire",
  "/audit/",
  "/auth",
  "/e/",
  "/c/",
  "/invite",
  "/join-team",
  "/mode",
  "/offline",
  "/become-a-partner/",
];

export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path === "/" ? "" : path}`;
