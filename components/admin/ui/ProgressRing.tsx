import type { ReactNode } from "react";

// Anneau d'objectif — le chiffre du jour de la vue simple (ADR 0064) : « 3
// sur 4 tickets aujourd'hui ». Un seul par écran : c'est le point focal, pas
// un motif décoratif à répéter.
//
// SVG pur, aucun état : il se rend côté serveur. Sur fond sombre (l'encart
// `bg-ink` de l'accueil), piste en blanc transparent, progression en blanc,
// puis en `good` quand l'objectif est atteint — la bonne nouvelle en vert,
// jamais dans la couleur de l'établissement (ADR 0048 §7).

export function ProgressRing({
  value,
  max,
  size = 112,
  stroke = 10,
  surface = "dark",
  label,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  surface?: "light" | "dark";
  /** Nom accessible (« 3 tickets sur un objectif de 4 »). */
  label: string;
  /** Contenu centré — en général le chiffre. */
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const met = max > 0 && value >= max;
  const track = surface === "dark" ? "stroke-white/15" : "stroke-paper-subtle";
  const fill = met ? "stroke-good" : surface === "dark" ? "stroke-white" : "stroke-ink";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={track} />
        {ratio > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            className={fill}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
