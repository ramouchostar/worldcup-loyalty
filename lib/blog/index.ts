// Registre des articles du blog. Un article = un fichier dans ./articles,
// ajouté ici. Le sitemap et la page d'index lisent cette liste.
import type { BlogArticle } from "./types";
import { article as ficheGoogleGuide } from "./articles/fiche-google-restaurant-guide";
import { article as repondreAvis } from "./articles/repondre-avis-google-restaurant";
import { article as pubTiktok } from "./articles/publicite-tiktok-restaurant";
import { article as pubMeta } from "./articles/publicite-facebook-instagram-restaurant";
import { article as palierCa } from "./articles/passer-un-palier-chiffre-affaires";
import { article as joursCreux } from "./articles/remplir-jours-creux-restaurant";
// Comparatifs honnêtes (2026-11-05), prix et sources dans lib/comparatif.ts.
import { article as hubComparatif } from "./articles/combien-coute-le-marketing-d-un-restaurant";
import { article as joyn } from "./articles/joyn-ou-boosteats";
import { article as zerosix } from "./articles/zerosix-ou-boosteats";
import { article as brevo } from "./articles/brevo-ou-boosteats";
import { article as zenchef } from "./articles/zenchef-ou-boosteats";
import { article as tenzo } from "./articles/tenzo-ou-boosteats";
import { article as apicbase } from "./articles/apicbase-ou-boosteats";
import { article as agencePub } from "./articles/agence-pub-facebook-restaurant-ou-boosteats";
import { article as malou } from "./articles/malou-ou-boosteats";
import { article as guestSuite } from "./articles/guest-suite-ou-boosteats";
import { article as siteResto } from "./articles/site-internet-restaurant-developpeur-ou-boosteats";
import { article as agenceRef } from "./articles/agence-referencement-restaurant-ou-boosteats";

export const BLOG_ARTICLES: BlogArticle[] = [ficheGoogleGuide, repondreAvis, pubMeta, pubTiktok, palierCa, joursCreux,
  hubComparatif, joyn, zerosix, brevo, zenchef, tenzo, apicbase, agencePub, malou, guestSuite, siteResto, agenceRef,
];

export const getArticle = (slug: string) => BLOG_ARTICLES.find((a) => a.slug === slug);

export const sortedArticles = () => [...BLOG_ARTICLES].sort((a, b) => b.published.localeCompare(a.published));
