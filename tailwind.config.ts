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
        // Accent vert électrique réservé à /platform (app/globals.css) — ne
        // JAMAIS l'utiliser hors de app/platform/** et components/platform/**,
        // au même titre qu'ink/paper ne sortent jamais de la console admin.
        platform: {
          accent: "rgb(var(--platform-accent) / <alpha-value>)",
        },
        // Neutres fixes de la console restaurateur (redesign m54) — jamais
        // pilotés par établissement (contrairement à brand-*), au même titre
        // que l'ancien bg-gray-100 : un canevas neutre professionnel commun
        // à toutes les consoles, quelle que soit la charte du restaurant.
        ink: {
          DEFAULT: "#0A0A0A",
          body: "#3D3D3D",
          muted: "#5C5C56",
          // Assombri le 2026-09-12 (#9A9A92 -> #6F6F68) : l'ancienne valeur
          // donnait 2,71:1 sur paper, sous le minimum AA de 4,5:1 alors
          // qu'elle porte des étiquettes de 11px et des chevrons (3:1 pour
          // une icône). Reste distinct de muted (4,84:1 vs 6,44:1).
          faint: "#6F6F68",
        },
        paper: {
          DEFAULT: "#FAFAF7",
          subtle: "#F0F0EC",
          border: "#E2E2DC",
        },
        // Couleurs sémantiques de statut (redesign m54) — plus sourdes que
        // les red-600/amber-500 par défaut de Tailwind, cohérentes avec le
        // ton "console pro" plutôt qu'alerte grand public.
        // Contraste vérifié sur paper (#FAFAF7) le 2026-09-12 : danger passait
        // déjà (5,12:1), warn (2,50:1) et good (3,93:1) échouaient en petit
        // texte — valeurs remontées au premier ton qui franchit 4,5:1, sans
        // changer de teinte. Le blanc posé dessus (bg-good/bg-warn) y gagne
        // aussi (4,11 -> 4,82).
        danger: "#B8443A",
        warn: "#9E6612",
        good: "#467F3B",
        // Accent éditorial du site vitrine restaurateurs (redesign m55, design
        // Claude "Landing Restaurateurs") — fixe, indépendant des couleurs
        // brand-* par établissement (au même titre que ink/paper pour la
        // console admin). Aligné sur le vert électrique du design (2026-08-29)
        // — coïncide en valeur avec platform.accent mais reste un token
        // Tailwind distinct, propre au site vitrine, jamais utilisé dans
        // app/platform/** ni components/platform/**.
        moss: {
          DEFAULT: "#A2C523",
          light: "#B8D953",
          dark: "#83A115",
          tint: "#EFF6D8",
          tint2: "#D8EA9E",
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
        // Police par défaut de TOUTE l'app (2026-09-12) — remplace la pile
        // système que Tailwind pose sur <body>. Couvre les surfaces sans
        // wrapper d'établissement : connexion, /join, /coupon, pages
        // publiques. Les surfaces qui posent une police explicite gardent la
        // leur (font-brand, font-display, font-landing, font-mono).
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        // Police de marque par établissement (m48) — --brand-font posé par
        // brandStyle() ; défaut neutre (pile système) dans app/globals.css.
        brand: ["var(--brand-font)"],
        // Titres de l'app membre (2026-09-12) — Manrope par défaut, mais
        // brandStyle() la remplace par la police de l'établissement quand il
        // en a choisi une : un resto garde une seule police, comme avant m48.
        "brand-display": ["var(--brand-display-font)"],
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
