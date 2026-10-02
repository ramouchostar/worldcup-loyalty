import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boosteats",
    short_name: "Boosteats",
    description:
      "Programme de fidélité communautaire par équipes. Mangez directement au restaurant, gagnez ensemble.",
    // "/" est devenue la landing restaurateurs (2026-08-08) ; l'app installée
    // reste celle des membres, qui vit désormais sur /membres.
    id: "/membres",
    start_url: "/membres",
    display: "standalone",
    background_color: "#0C1509",
    theme_color: "#6B7C3F",
    orientation: "portrait",
    categories: ["food", "loyalty", "shopping"],
    // Se déclarer soi-même comme « application liée » permet à
    // navigator.getInstalledRelatedApps() (Chrome/Android) de dire si la PWA
    // est DÉJÀ installée quand on navigue dans le navigateur — la carte
    // « Installe l'app » se cache alors au lieu de proposer un geste mort.
    prefer_related_applications: false,
    related_applications: [{ platform: "webapp", url: `${SITE_ORIGIN}/manifest.webmanifest` }],
    icons: [
      {
        src: "/api/icons/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/api/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-boosteats.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    screenshots: [],
  };
}
