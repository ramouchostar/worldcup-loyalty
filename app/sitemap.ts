import type { MetadataRoute } from "next";
import { SEO_PAGES, absoluteUrl } from "@/lib/seo-pages";

// Plan du site soumis à Google Search Console (www.boosteats.be/sitemap.xml).
// La liste vit dans lib/seo-pages.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  return SEO_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: new Date(`${p.updated}T00:00:00Z`),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
