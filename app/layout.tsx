import type { Metadata, Viewport } from "next";
import { Inter, Poppins, Playfair_Display, DM_Sans, Bebas_Neue, Space_Grotesk, JetBrains_Mono, Archivo, Archivo_Black } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Analytics } from "@/components/analytics/Analytics";
import { CookieBanner } from "@/components/analytics/CookieBanner";

// Polices curées de la charte graphique (m48, lib/branding.ts FONT_OPTIONS).
// Toutes montées ici, quel que soit l'établissement — c'est --brand-font
// (posé par brandStyle() dans les layouts /admin/[id] et /r/[id]) qui choisit
// laquelle s'applique. Rester listé, jamais chargé depuis un domaine externe
// à la requête (next/font auto-héberge les fichiers).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-poppins", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas-neue", display: "swap" });
// Console restaurateur (redesign m54) — identité visuelle fixe de l'outil
// d'administration, indépendante de --brand-font (qui reste réservé à la
// page membre/QR par établissement, cf. BrandingForm). Space Grotesk pour
// les titres, JetBrains Mono pour les étiquettes techniques (labels, badges).
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains-mono", display: "swap" });
// Landing publique restaurateurs (redesign m55, design Claude "Landing
// Restaurateurs") — identité éditoriale du site vitrine Boosteats, distincte
// de --brand-font (par établissement) et de Space Grotesk/JetBrains Mono
// (console admin). Chargée globalement comme les autres polices curées, mais
// appliquée seulement via la classe utilitaire font-landing.
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-archivo", display: "swap" });
// Template QR Belchicken Kraainem (design Claude "Templates QR Belchicken")
// — display du support imprimé, distinct d'Archivo (corps) et non exposé
// dans FONT_OPTIONS (pas sélectionnable comme --brand-font).
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-archivo-black", display: "swap" });
const brandFontVariables = `${inter.variable} ${poppins.variable} ${playfair.variable} ${dmSans.variable} ${bebasNeue.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${archivo.variable} ${archivoBlack.variable}`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.boosteats.tech";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "Boosteats",
    description: "Rejoins ton équipe et gagne des cadeaux en commandant directement.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6B7C3F" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1509" },
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
        {/* Consent Mode v2 + gtag.js. Monté dans le <head> et avant tout le
            reste : les valeurs de consentement par défaut doivent être posées
            avant que gtag.js n'ait la moindre chance d'écrire un cookie. */}
        <Analytics />
      </head>
      <body className={`${brandFontVariables} bg-gray-50 text-gray-900 antialiased`}>
        {children}
        <ServiceWorkerRegister />
        <CookieBanner />
      </body>
    </html>
  );
}
