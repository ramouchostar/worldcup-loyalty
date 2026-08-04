import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
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
      },
      fontFamily: {
        // Police de marque par établissement (m48) — --brand-font posé par
        // brandStyle() ; défaut neutre (pile système) dans app/globals.css.
        brand: ["var(--brand-font)"],
      },
    },
  },
  plugins: [],
};

export default config;
