import type { HealthMetric, Tier } from "@/lib/health-metrics";

// Tuile de métrique de santé produit — la valeur calculée en tête, puis les
// trois paliers de lecture (bon / mitigé / faible) avec celui du moment mis
// en évidence. Les trois paliers sont TOUJOURS affichés, même quand un seul
// compte : c'est la grille de lecture qui donne son sens au chiffre.
export function HealthMetricTile({
  title,
  description,
  metric,
  tierLabels,
  thresholds,
  denominatorLabel,
}: {
  title: string;
  description: string;
  metric: HealthMetric;
  tierLabels: Record<Tier, string>;
  thresholds: { goodMin: number; midMin: number };
  denominatorLabel: string;
}) {
  const { rate, numerator, denominator, tier } = metric;
  const noData = rate === null;

  const HEADLINE: Record<Tier, { bg: string; border: string; text: string; label: string }> = {
    good: { bg: "bg-green-50", border: "border-green-200", text: "text-green-900", label: "text-green-700" },
    mid: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", label: "text-amber-700" },
    low: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", label: "text-gray-500" },
  };
  const head = HEADLINE[tier];

  const BUCKETS: { key: Tier; range: string; bg: string; text: string; ring: string }[] = [
    { key: "good", range: `≥ ${thresholds.goodMin} %`, bg: "bg-green-50", text: "text-green-800", ring: "ring-green-400" },
    { key: "mid", range: `${thresholds.midMin}–${thresholds.goodMin} %`, bg: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-400" },
    { key: "low", range: `< ${thresholds.midMin} %`, bg: "bg-gray-100", text: "text-gray-600", ring: "ring-gray-400" },
  ];

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-bold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">{description}</p>

      <div className={`rounded-xl border p-4 mb-3 ${head.bg} ${head.border}`}>
        <p className={`text-4xl font-bold tabular-nums ${head.text}`}>
          {noData ? "—" : `${Math.round(rate)} %`}
        </p>
        <p className={`text-xs font-semibold uppercase tracking-wide mt-1 ${head.label}`}>
          {noData ? "Pas encore de données" : tierLabels[tier]}
        </p>
        <p className="text-xs text-gray-400 mt-1 tabular-nums">
          {numerator} / {denominator} {denominatorLabel}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {BUCKETS.map((b) => (
          <div
            key={b.key}
            className={`rounded-lg py-2 px-1 ${b.bg} ${!noData && tier === b.key ? `ring-2 ${b.ring}` : ""}`}
          >
            <p className={`text-xs font-bold tabular-nums ${b.text}`}>{b.range}</p>
            <p className={`text-[10px] uppercase leading-tight mt-0.5 ${b.text}`}>{tierLabels[b.key]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
