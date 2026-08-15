import { CHART } from "./chart-tokens";

export type FunnelStep = { label: string; value: number; hint: string };

// Entonnoir d'activation — barres horizontales, une par étape, largeur
// proportionnelle à la première. Peu de lignes et chacune porte sa valeur :
// tout est étiqueté directement, pas de survol à découvrir.
//
// Le taux affiché est relatif à l'étape PRÉCÉDENTE, pas au total : c'est la
// marche qu'on peut réparer. « 40 % des actifs n'ont pas de catalogue » est
// une action ; « 12 % du total arrivent au bout » n'en est pas une.
export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">Aucun établissement dans ce périmètre.</p>;
  }

  const top = Math.max(steps[0].value, 1);

  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const previous = i > 0 ? steps[i - 1].value : null;
        const rate = previous && previous > 0 ? Math.round((step.value / previous) * 100) : null;
        const width = Math.max((step.value / top) * 100, step.value > 0 ? 2 : 0);
        const lost = previous !== null ? previous - step.value : 0;

        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-sm font-semibold text-gray-900">{step.label}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {rate !== null && (
                  <span className={lost > 0 ? "font-semibold text-gray-600" : "font-semibold text-good"}>
                    {rate} %
                  </span>
                )}
                {rate !== null && lost > 0 && <> · −{lost} perdu{lost > 1 ? "s" : ""}</>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 rounded-full" style={{ background: CHART.grid }}>
                <div
                  className="h-3 rounded-full"
                  style={{ width: `${width}%`, background: CHART.hue }}
                />
              </div>
              <span className="text-sm font-bold text-gray-900 tabular-nums w-8 text-right shrink-0">
                {step.value}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{step.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}
