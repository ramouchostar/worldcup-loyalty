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

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// "#C8102E" → "200 16 46" (canaux RGB, format attendu par
// rgb(var(--x) / <alpha-value>) — indispensable pour garder les modificateurs
// d'opacité Tailwind type bg-brand-gold/40).
export function hexToRgbChannels(hex: string): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToChannels(rgb) : null;
}

function rgbToChannels([r, g, b]: Rgb): string {
  return `${r} ${g} ${b}`;
}

export function isValidHex(hex: string): boolean {
  return HEX.test(hex.trim());
}

/* ── Garde-fou de contraste (audit UX 2026-08-11, WCAG 1.4.3) ─────────────
   Les couleurs de charte sont pilotées par établissement (m37/m48) : rien
   n'empêche un restaurateur de choisir un accent trop clair pour servir de
   texte sur fond blanc/crème (le défaut Boosteats #A9BB6E est lui-même à
   2,10:1). Les fonctions ci-dessous implémentent les formules WCAG standard
   et brandStyle() les applique — voir le commentaire de brandStyle pour la
   politique exacte par variable. */

const WHITE: Rgb = [255, 255, 255];

// Seuil AA texte normal (WCAG 1.4.3). Le ratio couleur↔blanc étant symétrique,
// le même seuil couvre `text-brand-red` sur fond blanc ET `text-white` sur
// fond `bg-brand-red`.
export const TEXT_CONTRAST_MIN = 4.5;

// Luminance relative WCAG (sRGB linéarisé) — https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Ratio de contraste WCAG : (L_claire + 0.05) / (L_sombre + 0.05), de 1 à 21.
export function contrastRatio(rgb1: Rgb, rgb2: Rgb): number {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const scale = (rgb: Rgb, f: number): Rgb => [
  Math.round(rgb[0] * f),
  Math.round(rgb[1] * f),
  Math.round(rgb[2] * f),
];

// Assombrit une couleur (multiplication proportionnelle des canaux RGB — la
// teinte est conservée, seule la luminosité descend) jusqu'à atteindre
// `target` contre le blanc. Une couleur déjà conforme est renvoyée telle
// quelle (zéro régression pour les chartes correctes et les défauts).
export function darkenToContrast(rgb: Rgb, target: number = TEXT_CONTRAST_MIN): Rgb {
  if (contrastRatio(rgb, WHITE) >= target) return rgb;
  // Recherche binaire du plus grand facteur suffisant : facteur 0 = noir
  // (21:1, passe toujours), facteur 1 = couleur d'origine (échoue, sinon
  // on aurait déjà retourné). Invariant : lo passe, hi échoue.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(scale(rgb, mid), WHITE) >= target) lo = mid;
    else hi = mid;
  }
  let out = scale(rgb, lo);
  // L'arrondi entier peut faire repasser d'un cheveu sous le seuil.
  while (contrastRatio(out, WHITE) < target && (out[0] > 0 || out[1] > 0 || out[2] > 0)) {
    out = [Math.max(0, out[0] - 1), Math.max(0, out[1] - 1), Math.max(0, out[2] - 1)];
  }
  return out;
}

// Style inline à poser sur le wrapper d'un layout scopé par établissement :
// surcharge les variables CSS de marque uniquement pour les couleurs définies
// (une couleur nulle laisse le défaut Boosteats de globals.css).
//
// Politique de contraste (audit UX 2026-08-11) :
//
// • --brand-red (accent principal) : assombri EN PLACE si < 4,5:1 contre le
//   blanc. Justification : dans le code, brand-red sert (1) de texte sur fond
//   clair et (2) de fond plein sous texte blanc (boutons `bg-brand-red
//   text-white`, popover Driver.js). Le ratio étant symétrique, un seul
//   assombrissement corrige les deux directions à la fois, et un bouton plus
//   sombre reste visuellement sûr — alors qu'une variable "-readable" que
//   personne ne consomme ne protégerait rien. Le défaut #6B7C3F est à
//   4,59:1 : il passe tel quel, zéro changement pour un resto sans charte
//   (globals.css n'est pas surchargé quand brand_primary est nul).
//
// • --brand-gold (accent secondaire) : JAMAIS modifié en place. C'est une
//   couleur volontairement claire, utilisée sur fonds sombres (header admin
//   `text-brand-gold` sur `bg-brand-dark` : 8,89:1 avec les défauts ; badge
//   plan `bg-brand-gold text-brand-dark`). L'assombrir à 4,5:1 contre le
//   blanc casserait ces usages (le défaut tomberait à ~4,1:1 sur fond
//   sombre) et changerait le rendu de tous les badges. À la place :
//   → RÈGLE D'USAGE : `text-brand-gold` = FOND SOMBRE UNIQUEMENT.
//   → Pour du texte doré sur fond clair (ex. dashboard membre, TeamManager),
//     consommer `--brand-gold-readable` : version assombrie à ≥ 4,5:1 contre
//     le blanc, toujours émise ici (défaut #A9BB6E à 2,10:1 → #6F7B48 à
//     4,56:1). Elle n'existe que sous un wrapper brandStyle() (/r/[id],
//     /admin/[id], qr/print) — pas de défaut dans globals.css.
export function brandStyle(b: Partial<Branding> | null | undefined): CSSProperties {
  const style: Record<string, string> = {};
  const parse = (hex: string | null | undefined): Rgb | null =>
    hex ? hexToRgb(hex) : null;

  const primary = parse(b?.brand_primary);
  const dark = parse(b?.brand_dark);
  const accent = parse(b?.brand_accent);

  if (primary) style["--brand-red"] = rgbToChannels(darkenToContrast(primary));
  if (dark) style["--brand-dark"] = rgbToChannels(dark);
  if (accent) style["--brand-gold"] = rgbToChannels(accent);
  // Toujours émise (accent choisi ou défaut) pour que les consommateurs
  // puissent s'y fier partout où brandStyle() est appliqué.
  const goldBase = accent ?? (hexToRgb(BRAND_DEFAULTS.accent) as Rgb);
  style["--brand-gold-readable"] = rgbToChannels(darkenToContrast(goldBase));

  const font = FONT_OPTIONS.find((f) => f.key === b?.brand_font);
  if (font) style["--brand-font"] = font.cssVar;
  return style as CSSProperties;
}
