import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Analytics } from "@/components/analytics/Analytics";
import { CookieBanner } from "@/components/analytics/CookieBanner";
import { SITE_ORIGIN } from "@/lib/site";

// Polices curées de la charte graphique (m48, lib/branding.ts FONT_OPTIONS).
// Toutes montées ici, quel que soit l'établissement — c'est --brand-font
// (posé par brandStyle() dans les layouts /admin/[id] et /r/[id]) qui choisit
// laquelle s'applique. Rester listé, jamais chargé depuis un domaine externe
// à la requête.
//
// Les fichiers sont DANS LE DÉPÔT (app/fonts/*.woff2, sous-ensemble latin, licence OFL, voir app/fonts/LICENSES.md) et
// chargés par next/font/local : plus aucun accès réseau pendant le build. Avec next/font/google, le build échouait quand
// Google ne répondait pas (2026-11-13, PR #435, #441, #444, #445). Les noms de variables CSS sont inchangés. Pour changer
// de police ou de graisse : scripts/fonts/fetch-fonts.mjs, puis cette liste.
const inter = localFont({ src: [{ path: "./fonts/inter-normal-100-900.woff2", weight: "100 900", style: "normal" }], variable: "--font-inter", display: "swap" });
// Manrope — police de titre par défaut de l'app membre (2026-09-12). Uber
// Move / Uber Move Text, demandées en référence, sont propriétaires et non
// licenciables : Manrope reprend la géométrie typée des titres Uber, Inter
// le corps de texte. Variable (200–800) : une seule requête pour toutes les
// graisses. Comme les autres, elle reste montée ici et n'entre en jeu que
// via --brand-display-font (app/globals.css).
const manrope = localFont({ src: [{ path: "./fonts/manrope-normal-200-800.woff2", weight: "200 800", style: "normal" }], variable: "--font-manrope", display: "swap" });
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-normal-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-normal-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-normal-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins", display: "swap",
});
// Police à empattements : le repli de secours est ajusté sur Times New Roman, pas sur Arial.
const playfair = localFont({ src: [{ path: "./fonts/playfair-display-normal-400-900.woff2", weight: "400 900", style: "normal" }], variable: "--font-playfair", display: "swap", adjustFontFallback: "Times New Roman" });
const dmSans = localFont({ src: [{ path: "./fonts/dm-sans-normal-100-1000.woff2", weight: "100 1000", style: "normal" }], variable: "--font-dm-sans", display: "swap" });
const bebasNeue = localFont({ src: [{ path: "./fonts/bebas-neue-normal-400.woff2", weight: "400", style: "normal" }], variable: "--font-bebas-neue", display: "swap" });
// Console restaurateur (redesign m54) — identité visuelle fixe de l'outil
// d'administration, indépendante de --brand-font (qui reste réservé à la
// page membre/QR par établissement, cf. BrandingForm). Space Grotesk pour
// les titres, JetBrains Mono pour les étiquettes techniques (labels, badges).
const spaceGrotesk = localFont({ src: [{ path: "./fonts/space-grotesk-normal-500_600_700.woff2", weight: "500 700", style: "normal" }], variable: "--font-space-grotesk", display: "swap" });
// Police à chasse fixe : pas d'ajustement du repli sur Arial (largeur de lettre différente).
const jetbrainsMono = localFont({ src: [{ path: "./fonts/jetbrains-mono-normal-400_500_600.woff2", weight: "400 600", style: "normal" }], variable: "--font-jetbrains-mono", display: "swap", adjustFontFallback: false });
// Landing publique restaurateurs (redesign m55, design Claude "Landing
// Restaurateurs") — identité éditoriale du site vitrine Boosteats, distincte
// de --brand-font (par établissement) et de Space Grotesk/JetBrains Mono
// (console admin). Chargée globalement comme les autres polices curées, mais
// appliquée seulement via la classe utilitaire font-landing.
const archivo = localFont({
  src: [
    { path: "./fonts/archivo-normal-400_500_600_700.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/archivo-italic-400_500_600_700.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-archivo", display: "swap",
});
// Template QR Belchicken Kraainem (design Claude "Templates QR Belchicken")
// — display du support imprimé, distinct d'Archivo (corps) et non exposé
// dans FONT_OPTIONS (pas sélectionnable comme --brand-font).
const archivoBlack = localFont({ src: [{ path: "./fonts/archivo-black-normal-400.woff2", weight: "400", style: "normal" }], variable: "--font-archivo-black", display: "swap" });
// Police unique de Boosteats (charte anti-slop, 2026-11-05) : d'abord la landing,
// puis les pages publiques, la console et la plateforme. L'app membre garde la
// police de l'établissement (ADR 0015).
const instrumentSans = localFont({ src: [{ path: "./fonts/instrument-sans-normal-400_500_600_700.woff2", weight: "400 700", style: "normal" }], variable: "--font-instrument", display: "swap" });
const brandFontVariables = `${instrumentSans.variable} ${inter.variable} ${manrope.variable} ${poppins.variable} ${playfair.variable} ${dmSans.variable} ${bebasNeue.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${archivo.variable} ${archivoBlack.variable}`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_ORIGIN;

// Branding plateforme neutre (ADR 0015) — le nom d'un établissement
// n'apparaît que sur ses propres surfaces, jamais dans les métadonnées
// globales partagées par tous les restos.
export const metadata: Metadata = {
  // Adresse de base : les URL relatives (canonical, images) deviennent absolues.
  metadataBase: new URL(APP_URL),
  title: {
    default: "Boosteats",
    template: "%s — Boosteats",
  },
  // Défaut neutre (2026-11-01) : les pages publiques posent leur propre texte,
  // les pages membre aussi ; celui-ci ne parle plus de l'ancien produit.
  description:
    "Boosteats aide les restaurants à faire revenir leurs clients et à en faire venir de nouveaux : fidélité sans rien brancher, pub de quartier, chiffre du jour.",
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
      "Faites revenir vos clients et faites venir le quartier. Rien à brancher : le ticket de caisse suffit.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Boosteats",
    description: "Faites revenir vos clients et faites venir le quartier. Rien à brancher : le ticket de caisse suffit.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  // Vérification du domaine pour Meta Business (pixel / publicités).
  verification: {
    other: { "facebook-domain-verification": "qtgjelufmtpn5zvsny25v2l22elr23" },
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
    // Les variables de police vivent sur <html>, pas sur <body> : le preflight
    // Tailwind pose `font-family: theme(fontFamily.sans)` sur <html>, et une
    // `var()` non définie à cet endroit invalide toute la déclaration (retour
    // au Times du navigateur). Vérifié en rendu réel le 2026-09-12.
    <html lang="fr" className={brandFontVariables}>
      <head>
        <link rel="icon" href="/brand/boosteats-symbole.svg" type="image/svg+xml" />
        <link rel="icon" href="/icons/icon-boosteats.png" type="image/png" sizes="512x512" />
        <link rel="icon" href="/api/icons/192" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/api/icons/192" />
        {/* Consent Mode v2 + gtag.js. Monté dans le <head> et avant tout le
            reste : les valeurs de consentement par défaut doivent être posées
            avant que gtag.js n'ait la moindre chance d'écrire un cookie. */}
        <Analytics />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
        <ServiceWorkerRegister />
        <CookieBanner />
      </body>
    </html>
  );
}
