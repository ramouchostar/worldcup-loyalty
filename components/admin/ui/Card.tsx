import type { ReactNode } from "react";

// La carte de la console — UNE variante, là où le code en faisait coexister
// trois : `rounded-2xl shadow-sm border-gray-100`, `rounded-xl
// border-paper-border` et `rounded-lg border-gray-200`. Celle retenue est
// celle du dashboard (redesign m54) : pas d'ombre, un filet `paper-border`.
// Une console est un plan de travail, pas une pile de cartes qui flottent.

export function Card({
  children,
  className = "",
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  /** `p-0` pour une carte qui porte une liste à filets (voir `CardRow`). */
  padding?: string;
}) {
  return (
    <div className={`bg-white border border-paper-border rounded-xl ${padding} ${className}`}>
      {children}
    </div>
  );
}

// Ligne d'une liste posée dans une carte `padding="p-0"` — le filet sépare,
// jamais une carte par ligne (l'empilement de cartes hache la lecture).
export function CardRow({
  children,
  first = false,
  className = "",
}: {
  children: ReactNode;
  /** La première ligne n'a pas de filet au-dessus. */
  first?: boolean;
  className?: string;
}) {
  return (
    <div className={`px-5 py-3.5 ${first ? "" : "border-t border-paper-border"} ${className}`}>
      {children}
    </div>
  );
}

// Étiquette de section en capitales mono — le repère de lecture de la console
// (« ▶ À FAIRE AUJOURD'HUI », « CE QUE LE PROGRAMME T'A RAPPORTÉ »). JetBrains
// Mono et l'interlettrage large la distinguent d'un titre : c'est un intitulé
// de rubrique, pas une phrase.
const LABEL_TONES = {
  accent: "text-brand-red",
  gold: "text-brand-gold",
  muted: "text-ink-faint",
} as const;

export function SectionLabel({
  children,
  tone = "accent",
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof LABEL_TONES;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[11px] tracking-[0.12em] uppercase ${LABEL_TONES[tone]} ${className}`}
    >
      {children}
    </p>
  );
}
