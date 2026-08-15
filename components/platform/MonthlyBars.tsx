"use client";

import { useState } from "react";
import { CHART } from "./chart-tokens";

export type BarPoint = { key: string; label: string; value: number };

// Colonnes mensuelles — UNE mesure par graphique (jamais deux échelles sur le
// même axe : deux mesures = deux graphiques). Une seule série, donc pas de
// légende : le titre dit ce qui est tracé.
//
// Les valeurs ne sont pas toutes étiquetées — seuls le maximum et le dernier
// mois le sont. Un nombre sur chaque barre ne se lit plus ; le survol donne le
// point exact et « Voir les chiffres » porte la série complète.
export function MonthlyBars({
  title,
  subtitle,
  points,
  format = (n) => n.toLocaleString("fr-BE"),
}: {
  title: string;
  subtitle?: string;
  points: BarPoint[];
  format?: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const max = Math.max(...points.map((p) => p.value), 0);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const lastKey = points[points.length - 1]?.key;
  // Le maximum le plus RÉCENT : sur une série en croissance, plusieurs mois
  // partagent souvent la même valeur record — étiqueter le dernier évite un
  // label orphelin au milieu du graphique.
  const maxKey = max > 0 ? [...points].reverse().find((p) => p.value === max)?.key : undefined;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <header className="mb-4">
        <h3 className="font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </header>

      {total === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Aucune donnée sur les {points.length} derniers mois.
        </p>
      ) : (
        <>
          <div className="flex items-stretch gap-2">
            {/* Graduations : le haut et le zéro seulement — les valeurs
                intermédiaires vivent dans le survol et le tableau. */}
            <div className="flex flex-col justify-between text-[10px] text-gray-400 tabular-nums shrink-0 pt-[18px]">
              <span>{format(max)}</span>
              <span>0</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-end gap-[2px] h-40 border-b" style={{ borderColor: CHART.grid }}>
                {points.map((p) => {
                  const isHovered = hovered === p.key;
                  const showValue = isHovered || p.key === maxKey || p.key === lastKey;
                  const heightPct = max > 0 ? (p.value / max) * 100 : 0;

                  return (
                    <button
                      key={p.key}
                      type="button"
                      onMouseEnter={() => setHovered(p.key)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(p.key)}
                      onBlur={() => setHovered(null)}
                      aria-label={`${p.label} : ${format(p.value)}`}
                      className="flex-1 h-full flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded"
                    >
                      {/* Bandeau d'étiquette de hauteur fixe : réservé même
                          quand rien ne s'affiche, pour que toutes les colonnes
                          partagent la même ligne de base — une étiquette n'est
                          donc jamais rognée par le haut du graphique. */}
                      <span className="h-[18px] flex items-end text-[10px] font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                        {showValue ? format(p.value) : ""}
                      </span>
                      <span className="w-full flex-1 flex items-end justify-center">
                        <span
                          className="w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                          style={{
                            // Plancher visuel : un mois non nul mais minuscule
                            // reste visible plutôt que de disparaître à 0px.
                            // Un mois à zéro n'a pas de barre du tout — pas une
                            // barre grise qu'on confondrait avec une valeur.
                            height: `${p.value > 0 ? Math.max(heightPct, 2) : 0}%`,
                            background: CHART.hue,
                            opacity: hovered && !isHovered ? 0.5 : 1,
                          }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-[2px] mt-1.5">
                {points.map((p) => (
                  <span
                    key={p.key}
                    className={`flex-1 text-center text-[10px] leading-tight ${
                      hovered === p.key ? "text-gray-900 font-semibold" : "text-gray-400"
                    }`}
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Vue tableau — les valeurs ne dépendent jamais du seul graphique
              (lecture au clavier, copie vers un tableur). */}
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
              Voir les chiffres
            </summary>
            <table className="w-full text-xs mt-2">
              <tbody>
                {points.map((p) => (
                  <tr key={p.key} className="border-t border-gray-50">
                    <td className="py-1 text-gray-500 font-mono">{p.key}</td>
                    <td className="py-1 text-right font-semibold text-gray-900 tabular-nums">
                      {format(p.value)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200">
                  <td className="py-1 font-semibold text-gray-700">Total</td>
                  <td className="py-1 text-right font-bold text-gray-900 tabular-nums">{format(total)}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
