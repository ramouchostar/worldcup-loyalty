import type { MetadataRoute } from "next";
import { SEO_PAGES, absoluteUrl } from "@/lib/seo-pages";
import { BLOG_ARTICLES } from "@/lib/blog";

// Plan du site soumis à Google Search Console (www.boosteats.be/sitemap.xml).
// La liste vit dans lib/seo-pages.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = SEO_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: new Date(`${p.updated}T00:00:00Z`),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  // Les articles du blog s'ajoutent tout seuls depuis leur registre.
  const articles = BLOG_ARTICLES.map((a) => ({
    url: absoluteUrl(`/blog/${a.slug}`),
    lastModified: new Date(`${a.published}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  return [...pages, ...articles];
}
