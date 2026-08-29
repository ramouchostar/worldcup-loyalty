import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  // Stratégie "class" (.dark sur <html>) plutôt que "media" (préférence OS
  // seule) — la console /platform pose son propre bouton clair/sombre
  // (components/platform/PlatformShell.tsx). Aucune autre surface de l'app
  // n'utilise de variante `dark:` aujourd'hui : sans configuration explicite,
  // Tailwind appliquerait la stratégie "media" par défaut et le mode sombre
  // suivrait l'OS sans qu'on puisse le forcer depuis le bouton.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Couleurs de marque pilotées par variables CSS (canaux RGB) — permet
        // la charte graphique par établissement (lib/branding.ts) tout en
        // gardant les modificateurs d'opacité Tailwind (ex. brand-gold/40).
        // Défauts Boosteats définis dans app/globals.css.
        brand: {
          red: "rgb(var(--brand-red) / <alpha-value>)",
          gold: "rgb(var(--brand-gold) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
        },
        // Neutres fixes de la console restaurateur (redesign m54) — jamais
        // pilotés par établissement (contrairement à brand-*), au même titre
        // que l'ancien bg-gray-100 : un canevas neutre professionnel commun
        // à toutes les consoles, quelle que soit la charte du restaurant.
        ink: {
          DEFAULT: "#0A0A0A",
          body: "#3D3D3D",
          muted: "#5C5C56",
          faint: "#9A9A92",
        },
        paper: {
          DEFAULT: "#FAFAF7",
          subtle: "#F0F0EC",
          border: "#E2E2DC",
        },
        // Couleurs sémantiques de statut (redesign m54) — plus sourdes que
        // les red-600/amber-500 par défaut de Tailwind, cohérentes avec le
        // ton "console pro" plutôt qu'alerte grand public.
        danger: "#B8443A",
        warn: "#D4933A",
        good: "#4A8C3F",
        // Accent éditorial du site vitrine restaurateurs (redesign m55, design
        // Claude "Landing Restaurateurs") — fixe, indépendant des couleurs
        // brand-* par établissement (au même titre que ink/paper pour la
        // console admin).
        moss: {
          DEFAULT: "#7A8F3F",
          light: "#93A857",
          dark: "#677A33",
          tint: "#E8EDDC",
          tint2: "#CFDBB0",
        },
        // Surfaces sombres du site vitrine restaurateurs (redesign m55) —
        // hero, mockups produit, sections CTA. ink.DEFAULT reste le noir de
        // référence commun aux deux (console admin ET vitrine).
        night: {
          raised: "#141414",
          chrome: "#1F1F1F",
          line: "#2A2A2A",
          text: "#B8B8B0",
          faint: "#6E6E68",
        },
      },
      fontFamily: {
        // Police de marque par établissement (m48) — --brand-font posé par
        // brandStyle() ; défaut neutre (pile système) dans app/globals.css.
        brand: ["var(--brand-font)"],
        // Identité fixe de la console restaurateur (redesign m54) — titres et
        // étiquettes techniques, indépendants de la police d'établissement.
        display: ["var(--font-space-grotesk)"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        // Corps de texte du site vitrine restaurateurs (redesign m55).
        landing: ["var(--font-archivo)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
