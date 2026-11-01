// Registre des articles du blog. Un article = un fichier dans ./articles,
// ajouté ici. Le sitemap et la page d'index lisent cette liste.
import type { BlogArticle } from "./types";

export const BLOG_ARTICLES: BlogArticle[] = [];

export const getArticle = (slug: string) => BLOG_ARTICLES.find((a) => a.slug === slug);

export const sortedArticles = () => [...BLOG_ARTICLES].sort((a, b) => b.published.localeCompare(a.published));
