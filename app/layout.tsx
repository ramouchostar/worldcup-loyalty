import type { Metadata, Viewport } from "next";
import { Inter, Poppins, Playfair_Display, DM_Sans, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// Polices du layout racine — audit UX 2026-08-11 (perf vieux appareils) :
// seules restent ici les familles réellement nécessaires sur TOUTES les
// surfaces (membres comprises). Le reste est chargé par segment :
//
// • Inter, Poppins, Playfair, DM Sans, Bebas Neue : polices curées m48
//   (lib/branding.ts FONT_OPTIONS + contrainte restaurants_brand_font_chk).
//   N'IMPORTE quel établissement peut en faire son --brand-font via
//   brandStyle() sur les surfaces membres /r/[id] → obligées de rester
//   globales. Jamais chargées depuis un domaine externe à la requête
//   (next/font auto-héberge les fichiers).
// • JetBrains Mono : la classe Tailwind `font-mono` (var --font-jetbrains-mono)
//   est utilisée sur des surfaces membres (timer du coupon, dashboard,
//   submit-order, micro-rewards) et sur /platform — et une var() non définie
//   invalide toute la pile font-family (les fallbacks ne s'appliquent pas).
//   Reste donc globale.
// • Space Grotesk (font-display, console admin m54) + Archivo (font-landing,
//   vitrine m55) + Archivo Black (template QR Kraainem) : déplacées vers
//   app/admin/[restaurantId]/layout.tsx et
//   components/restaurateurs/RestaurateursLanding.tsx — aucune classe qui les
//   référence n'apparaît sur les surfaces membres (vérifié par grep de
//   font-display / font-landing / --font-archivo-black au 2026-08-11).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-poppins", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas-neue", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains-mono", display: "swap" });
const brandFontVariables = `${inter.variable} ${poppins.variable} ${playfair.variable} ${dmSans.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`;

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
      </head>
      <body className={`${brandFontVariables} bg-gray-50 text-gray-900 antialiased`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
