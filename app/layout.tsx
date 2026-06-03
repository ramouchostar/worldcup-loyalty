import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "WorldCup Loyalty — Belchicken",
    template: "%s — WorldCup Loyalty",
  },
  description:
    "Programme de fidélité communautaire Coupe du Monde 2026. Commandez chez Belchicken, faites monter le score de votre équipe, gagnez des récompenses ensemble.",
  keywords: ["Belchicken", "fidélité", "WorldCup 2026", "Bruxelles", "fast-food", "récompenses"],
  authors: [{ name: "Belchicken" }],
  creator: "Belchicken",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WorldCup",
  },
  openGraph: {
    type: "website",
    locale: "fr_BE",
    url: APP_URL,
    siteName: "WorldCup Loyalty — Belchicken",
    title: "WorldCup Loyalty — Belchicken 🏆",
    description:
      "Supporte ton équipe et gagne des repas chez Belchicken. Programme de fidélité communautaire Coupe du Monde 2026.",
    images: [
      {
        url: `${APP_URL}/icons/icon.svg`,
        width: 512,
        height: 512,
        alt: "WorldCup Loyalty Belchicken",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "WorldCup Loyalty — Belchicken 🏆",
    description: "Supporte ton équipe et gagne des repas chez Belchicken.",
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
  maximumScale: 1,
  userScalable: false,
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
