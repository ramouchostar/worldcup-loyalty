import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

// Branding plateforme neutre (ADR 0015) — le nom d'un établissement
// n'apparaît que sur ses propres surfaces, jamais dans les métadonnées
// globales partagées par tous les restos.
export const metadata: Metadata = {
  title: {
    default: "Boosteats",
    template: "%s — Boosteats",
  },
  description:
    "Programme de fidélité communautaire par équipes. Commandez directement chez vos restaurants préférés, faites progresser votre équipe, gagnez des récompenses ensemble.",
  keywords: ["fidélité", "restaurants", "Bruxelles", "récompenses", "communauté"],
  authors: [{ name: "Boosteats" }],
  creator: "Boosteats",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Boosteats",
  },
  openGraph: {
    type: "website",
    locale: "fr_BE",
    url: APP_URL,
    siteName: "Boosteats",
    title: "Boosteats",
    description:
      "Rejoins ton équipe et commande directement chez tes restaurants préférés. Programme de fidélité communautaire par équipes.",
    images: [
      {
        url: `${APP_URL}/icons/icon.svg`,
        width: 512,
        height: 512,
        alt: "Boosteats",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Boosteats",
    description: "Rejoins ton équipe et gagne des cadeaux en commandant directement.",
    images: [`${APP_URL}/icons/icon.svg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#C8102E" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A2E" },
  ],
  width: "device-width",
  initialScale: 1,
  // Zoom autorisé (WCAG 1.4.4) — bloquer le pincer-pour-zoomer pénalise les
  // membres qui ont besoin d'agrandir les textes (audit 2026-07-23).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/api/icons/192" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/api/icons/192" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
