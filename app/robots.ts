import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";
import { PRIVATE_PREFIXES } from "@/lib/seo-pages";

// Google lit tout le site public, jamais les espaces connectés, les liens privés
// (rapports d'audit partagés, liens d'arrêt d'e-mail) ni l'API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
