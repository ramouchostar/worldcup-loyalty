import type { ReactNode } from "react";

// Un chiffre et ce qu'il veut dire — la tuile du dashboard (« CA de tes
// clients du programme », « nouveaux inscrits »), reprise partout où la
// console pose un nombre en gros.
//
// `tabular-nums` n'est pas un détail : sans lui, une colonne de montants
// danse à chaque rafraîchissement SWR (30 s) parce que les chiffres n'ont pas
// tous la même largeur.
//
// Deux fonds : `light` sur le papier de la console, `dark` sur les encarts
// `brand-dark` (la section « ce que le programme t'a rapporté »).

export function StatTile({
  value,
  label,
  hint,
  surface = "light",
  accent = false,
  size = "md",
  className = "",
}: {
  value: ReactNode;
  label: ReactNode;
  /** Précision sous l'étiquette (variation vs mois précédent, détail…). */
  hint?: ReactNode;
  surface?: "light" | "dark";
  /** Met le chiffre en `brand-gold` — un seul par groupe, sinon plus rien ne ressort. */
  accent?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const dark = surface === "dark";
  const valueColor = accent ? "text-brand-gold" : dark ? "text-white" : "text-ink";
  return (
    <div className={className}>
      <p
        className={`font-display font-bold tabular-nums ${
          size === "sm" ? "text-lg" : "text-2xl"
        } ${valueColor}`}
      >
        {value}
      </p>
      <p className={`text-[11.5px] mt-1 ${dark ? "text-white/70" : "text-ink-muted"}`}>
        {label}
        {hint && <span className={dark ? "text-white/50" : "text-ink-faint"}> {hint}</span>}
      </p>
    </div>
  );
}
