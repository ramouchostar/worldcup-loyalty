// Registre des articles du blog. Un article = un fichier dans ./articles,
// ajouté ici. Le sitemap et la page d'index lisent cette liste.
import type { BlogArticle } from "./types";
import { article as ficheGoogleGuide } from "./articles/fiche-google-restaurant-guide";
import { article as repondreAvis } from "./articles/repondre-avis-google-restaurant";
import { article as pubTiktok } from "./articles/publicite-tiktok-restaurant";
import { article as pubMeta } from "./articles/publicite-facebook-instagram-restaurant";
import { article as palierCa } from "./articles/passer-un-palier-chiffre-affaires";
import { article as joursCreux } from "./articles/remplir-jours-creux-restaurant";

export const BLOG_ARTICLES: BlogArticle[] = [ficheGoogleGuide, repondreAvis, pubMeta, pubTiktok, palierCa, joursCreux];

export const getArticle = (slug: string) => BLOG_ARTICLES.find((a) => a.slug === slug);

export const sortedArticles = () => [...BLOG_ARTICLES].sort((a, b) => b.published.localeCompare(a.published));
