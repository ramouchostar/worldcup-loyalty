import type { CSSProperties } from "react";

// Charte graphique par établissement (ADR 0015 — identité neutre par défaut,
// chaque resto peut soumettre ses couleurs + logo). Les 3 couleurs mappent
// les 3 jetons de marque historiques Boosteats :
//   brand_primary → --brand-red   (accent principal, boutons)
//   brand_dark    → --brand-dark  (en-têtes, fonds sombres)
//   brand_accent  → --brand-gold  (mises en avant, badges)
// Défauts = identité réelle Boosteats (agence), alignés le 2026-07-28 sur le
// kit source (vert olive + fond quasi noir + surfaces crème). Doivent
// correspondre EXACTEMENT à globals.css, sinon régression visuelle.

export const BRAND_DEFAULTS = {
  primary: "#6B7C3F",
  dark: "#0C1509",
  accent: "#A9BB6E",
} as const;

export type Branding = {
  logo_url: string | null;
  brand_primary: string | null;
  brand_dark: string | null;
  brand_accent: string | null;
  brand_font: string | null;
  hero_image_url: string | null;
};

// Polices curées (m48) — liste fermée pour éviter d'injecter une police/domaine
// arbitraire. `cssVar` référence la variable générée par next/font/google sur
// <body> (voir app/layout.tsx) ; `key` est la valeur stockée en base.
export const FONT_OPTIONS: { key: string; label: string; cssVar: string }[] = [
  { key: "inter", label: "Inter", cssVar: "var(--font-inter)" },
  { key: "poppins", label: "Poppins", cssVar: "var(--font-poppins)" },
  { key: "playfair", label: "Playfair Display", cssVar: "var(--font-playfair)" },
  { key: "dm_sans", label: "DM Sans", cssVar: "var(--font-dm-sans)" },
  { key: "bebas_neue", label: "Bebas Neue", cssVar: "var(--font-bebas-neue)" },
];

const HEX = /^#([0-9a-fA-F]{6})$/;

// "#C8102E" → "200 16 46" (canaux RGB, format attendu par
// rgb(var(--x) / <alpha-value>) — indispensable pour garder les modificateurs
// d'opacité Tailwind type bg-brand-gold/40).
export function hexToRgbChannels(hex: string): string | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function isValidHex(hex: string): boolean {
  return HEX.test(hex.trim());
}

// Style inline à poser sur le wrapper d'un layout scopé par établissement :
// surcharge les variables CSS de marque uniquement pour les couleurs définies
// (une couleur nulle laisse le défaut Boosteats de globals.css).
export function brandStyle(b: Partial<Branding> | null | undefined): CSSProperties {
  const style: Record<string, string> = {};
  const set = (varName: string, hex: string | null | undefined) => {
    if (!hex) return;
    const ch = hexToRgbChannels(hex);
    if (ch) style[varName] = ch;
  };
  set("--brand-red", b?.brand_primary);
  set("--brand-dark", b?.brand_dark);
  set("--brand-gold", b?.brand_accent);
  const font = FONT_OPTIONS.find((f) => f.key === b?.brand_font);
  if (font) (style as Record<string, string>)["--brand-font"] = font.cssVar;
  return style as CSSProperties;
}
