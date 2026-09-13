import type { ReactNode } from "react";

// Pastille de statut — remplace les paires `bg-red-100 text-red-800`,
// `bg-green-100 text-green-800`, `bg-amber-100 text-amber-800`… semées dans
// la console (116 occurrences de couleurs Tailwind brutes, sans garantie de
// contraste).
//
// Quatre tons, pas plus. Les jetons `danger` / `warn` / `good` sont mesurés
// AA sur `paper` (5,12 / 4,60 / 4,61:1 — design system, 2026-09-12) ; les
// teintes brutes de Tailwind ne l'étaient pas.
//
// Règle de produit : le ROUGE ne sert qu'à ce qui est cassé ou refusé. Un
// libellé descriptif (« > €200 », « OCR < 70 % ») est une information, pas
// une alerte — il prend `neutral`. Sans ça, tout est rouge et plus rien ne
// se remarque.

const TONES = {
  neutral: "bg-paper-subtle text-ink-body",
  good: "bg-good/12 text-good",
  warn: "bg-warn/12 text-warn",
  danger: "bg-danger/12 text-danger",
} as const;

const SOLID_TONES = {
  neutral: "bg-ink text-white",
  good: "bg-good text-white",
  warn: "bg-warn text-white",
  danger: "bg-danger text-white",
} as const;

export type BadgeTone = keyof typeof TONES;

export function StatusBadge({
  children,
  tone = "neutral",
  solid = false,
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  /** Pastille pleine — réservée aux compteurs (le « 3 » d'une file d'attente). */
  solid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap ${
        solid ? SOLID_TONES[tone] : TONES[tone]
      } ${className}`}
    >
      {children}
    </span>
  );
}
