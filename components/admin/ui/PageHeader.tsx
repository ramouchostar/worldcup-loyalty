import type { ReactNode } from "react";

// En-tête de page de la console — un seul bloc pour les 22 pages, qui le
// recopiaient à la main (21 d'entre elles étaient restées sur
// `text-2xl font-bold text-gray-900`, le style d'avant le redesign m54 ;
// seul le dashboard avait la typographie de la console).
//
// Space Grotesk (`font-display`) + `tracking-[-0.02em]` : l'identité de
// l'outil, indépendante de la police choisie par l'établissement (m48) —
// contrairement à l'app membre, la console ne change pas de police d'un
// restaurant à l'autre.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Bouton ou lien aligné à droite du titre (« Exporter », « Nouveau »…). */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <p className="text-ink-muted text-[13.5px] mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
