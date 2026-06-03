import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorldCup Loyalty — Belchicken",
    short_name: "WorldCup",
    description:
      "Programme de fidélité communautaire Coupe du Monde 2026. Mangez au restaurant, gagnez ensemble.",
    start_url: "/",
    display: "standalone",
    background_color: "#1A1A2E",
    theme_color: "#C8102E",
    orientation: "portrait",
    categories: ["food", "loyalty", "sports"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    screenshots: [],
  };
}
