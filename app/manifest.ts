import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorldCup Loyalty — Belchicken",
    short_name: "WorldCup",
    description:
      "Programme de fidélité communautaire Coupe du Monde 2026. Mangez au restaurant, gagnez ensemble.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#1A1A2E",
    theme_color: "#C8102E",
    orientation: "portrait",
    categories: ["food", "loyalty", "sports"],
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
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    screenshots: [],
  };
}
