import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boosteats",
    short_name: "Boosteats",
    description:
      "Programme de fidélité communautaire par équipes. Mangez directement au restaurant, gagnez ensemble.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#0C1509",
    theme_color: "#6B7C3F",
    orientation: "portrait",
    categories: ["food", "loyalty", "shopping"],
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
