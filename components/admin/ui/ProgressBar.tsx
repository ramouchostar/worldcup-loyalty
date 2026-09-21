// Barre de progression de la console — la liste de lancement, le passage à
// l'étape suivante, le prochain cap (ADR 0064). Elle remplace les barres
// posées à la main (`bg-paper-subtle rounded-full h-2` + une largeur en
// style inline), qui divergeaient d'une page à l'autre.
//
// Deux fonds, comme `StatTile` : `light` sur le papier, `dark` sur un encart
// sombre. Deux tons : `neutral` (on avance) et `good` (c'est atteint). Jamais
// `brand-*` : l'accent de l'établissement résout en rouge chez Kraainem, et
// une progression rouge se lit comme une alerte.
//
// Le chiffre n'est pas porté par la barre : il est écrit à côté (« 66 / 100 »)
// — la couleur et la longueur ne suffisent pas à dire une valeur.

export function ProgressBar({
  value,
  max,
  tone = "neutral",
  surface = "light",
  label,
  className = "",
}: {
  value: number;
  max: number;
  tone?: "neutral" | "good";
  surface?: "light" | "dark";
  /** Nom accessible de la barre (« Tickets validés sur 90 jours »). */
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  const track = surface === "dark" ? "bg-white/15" : "bg-paper-subtle";
  const fill = tone === "good" ? "bg-good" : surface === "dark" ? "bg-white" : "bg-ink";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={`w-full h-2 rounded-full ${track} ${className}`}
    >
      {/* 2 % minimum : une barre vide et une barre à 1 % ne se distinguent pas */}
      <div className={`h-2 rounded-full ${fill}`} style={{ width: `${value > 0 ? Math.max(2, pct) : 0}%` }} />
    </div>
  );
}
