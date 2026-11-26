// ADR 0108 §4 — l'espace de commande est à l'image du restaurant : ses couleurs et sa police (déjà en base, polices du
// dépôt, ADR 0101). Logique PURE et testée. La couleur choisie par un établissement n'est pas toujours lisible : le texte
// posé dessus et la couleur des liens sont CALCULÉS pour tenir le contraste de la charte (4,5:1, ADR 0090).

import type { CSSProperties } from "react";
import { BRAND_DEFAULTS, FONT_OPTIONS, brandStyle, isValidHex, type Branding } from "../branding";

/** Sans police choisie : celle de la maquette validée (Instrument Sans). */
const DEFAULT_FONT = "var(--font-instrument), ui-sans-serif, system-ui, sans-serif";
const WHITE = "#FFFFFF";
const INK = "#1C1C1A";
/** Le fond le plus sombre sur lequel un lien se pose (encadrés `paper-subtle`). */
const SUBTLE = "#F0F0EC";

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** La même teinte, assombrie d'un cran. */
function darker(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.floor(v * 0.9).toString(16).padStart(2, "0"));
  return `#${c.join("")}`.toUpperCase();
}

export type CommanderColors = {
  /** La couleur du restaurant : fond des boutons principaux et pastille sans logo. */
  accent: string;
  /** Le texte posé sur `accent`. */
  onAccent: string;
  /** La même teinte, lisible en texte sur fond clair (liens, cases cochées). */
  accentText: string;
  /** Le bord d'un bouton principal : visible même quand la couleur du restaurant est très claire (3:1). */
  accentEdge: string;
};

export function commanderColors(primary: string | null | undefined): CommanderColors {
  const accent = primary && isValidHex(primary) ? primary.trim().toUpperCase() : BRAND_DEFAULTS.primary;
  const onAccent = contrast(accent, WHITE) >= 4.5 ? WHITE : contrast(accent, INK) >= 4.5 ? INK : "#000000";
  let accentText = accent;
  while (contrast(accentText, SUBTLE) < 4.5) accentText = darker(accentText);
  return { accent, onAccent, accentText, accentEdge: contrast(accent, WHITE) >= 3 ? accent : accentText };
}

/** Les seules couleurs lisibles, en variables `--co-*` : pour un bloc posé dans un autre écran (l'accueil membre). */
export function commanderColorVars(primary: string | null | undefined): CSSProperties {
  const c = commanderColors(primary);
  return { "--co-accent": c.accent, "--co-on-accent": c.onAccent, "--co-accent-text": c.accentText, "--co-accent-edge": c.accentEdge } as CSSProperties;
}

/** Le style à poser sur le conteneur de l'espace : variables de marque, police, couleurs lisibles. */
export function commanderStyle(branding: Partial<Branding> | null | undefined): CSSProperties {
  const chosen = FONT_OPTIONS.some((f) => f.key === branding?.brand_font);
  return {
    ...brandStyle(branding),
    ...(chosen ? {} : { "--brand-font": DEFAULT_FONT, "--brand-display-font": DEFAULT_FONT }),
    ...commanderColorVars(branding?.brand_primary),
  } as CSSProperties;
}
