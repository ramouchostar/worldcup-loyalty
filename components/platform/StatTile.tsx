// Tuile de chiffre — la forme correcte quand la donnée est UN nombre : pas de
// graphique à une barre, pas de camembert à une part. Le libellé dit quoi, la
// valeur dit combien, l'indice dit sur quelle période.
export function StatTile({
  label,
  value,
  hint,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Variation signée déjà formatée (« +2 vs mois dernier »). */
  delta?: { text: string; direction: "up" | "down" | "flat" };
  tone?: "neutral" | "accent";
}) {
  const deltaTone =
    delta?.direction === "up" ? "text-good" : delta?.direction === "down" ? "text-danger" : "text-gray-400";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${tone === "accent" ? "text-brand-red" : "text-gray-900"}`}>
        {typeof value === "number" ? value.toLocaleString("fr-BE") : value}
      </p>
      {delta && <p className={`text-xs font-semibold mt-0.5 ${deltaTone}`}>{delta.text}</p>}
      {hint && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}
