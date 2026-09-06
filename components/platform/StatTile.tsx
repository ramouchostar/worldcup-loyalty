import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Trend, TrendWeek } from "@/lib/member-stats";

// Rangée de chiffres d'en-tête de /platform/members — une tuile = un libellé,
// une valeur, l'écart avec la SEMAINE PRÉCÉDENTE, et la courbe des 12 dernières
// semaines glissantes.
//
// Trois règles de lecture, tenues par le composant :
//  1. l'écart porte toujours sur la mesure hebdomadaire nommée dans l'indice
//     (« 4 nouveaux membres sur 7 jours ») — jamais sur le cumul affiché en
//     gros, qui ne baisse jamais et rendrait toute flèche mensongère ;
//  2. la direction n'est JAMAIS portée par la seule couleur : flèche + signe +
//     « vs sem. préc. » sont écrits, la couleur ne fait que confirmer ;
//  3. la courbe n'a qu'une série — pas de légende, pas de second axe, pas de
//     valeur posée sur chaque point ; le survol donne semaine par semaine.
//
// Le vert/orangé de l'écart est un statut (bon/à surveiller), pas une couleur
// de série : la courbe reste en gris d'encre pour qu'aucune des deux ne parle
// à la place de l'autre.

const SPARK_W = 132;
const SPARK_H = 36;
const SPARK_PAD = 4;

function Sparkline({ weeks, describe }: { weeks: TrendWeek[]; describe: (w: TrendWeek) => string }) {
  if (weeks.length < 2) return null;

  const values = weeks.map((w) => w.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const innerW = SPARK_W - SPARK_PAD * 2;
  const innerH = SPARK_H - SPARK_PAD * 2;

  const x = (i: number) => SPARK_PAD + (i * innerW) / (weeks.length - 1);
  // Série plate (souvent : que des zéros) → ligne au milieu plutôt qu'une
  // division par zéro ou une fausse dent de scie.
  const y = (v: number) => (span === 0 ? SPARK_PAD + innerH / 2 : SPARK_PAD + innerH - ((v - min) / span) * innerH);

  const points = weeks.map((w, i) => `${x(i).toFixed(1)},${y(w.value).toFixed(1)}`).join(" ");
  const lastX = x(weeks.length - 1);
  const lastY = y(values[values.length - 1]);
  const slot = SPARK_W / weeks.length;

  // La courbe occupe toute la largeur de la tuile (`preserveAspectRatio="none"`,
  // l'échelle horizontale suit le conteneur) SANS étirer ses traits :
  // `vector-effect="non-scaling-stroke"` fige l'épaisseur en pixels écran. Le
  // point de fin est donc dessiné en trait, pas en <circle> — un cercle, lui,
  // serait aplati en ellipse par cette mise à l'échelle non uniforme. Un
  // sous-chemin de longueur nulle terminé en `round` rend un disque parfait.
  const dot = `M${lastX.toFixed(1)},${lastY.toFixed(1)} l0,0`;

  return (
    <svg
      width="100%"
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="mt-3 block overflow-visible"
      role="img"
      aria-label={`Évolution sur ${weeks.length} semaines : ${weeks.map(describe).join(" ; ")}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="#4b5563"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Point de fin = la semaine en cours, la seule qu'on désigne. L'anneau
          blanc le détache de la ligne quand la courbe repart vers le haut. */}
      <path d={dot} stroke="#ffffff" strokeWidth={11} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={dot} stroke="#111827" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {/* Zones de survol : plus larges que les points, une par semaine. Le
          <title> natif sert d'infobulle sans une ligne de JavaScript. */}
      {weeks.map((w, i) => (
        <rect key={w.start} x={i * slot} y={0} width={slot} height={SPARK_H} fill="transparent">
          <title>{describe(w)}</title>
        </rect>
      ))}
    </svg>
  );
}

function DeltaChip({ trend, format }: { trend: Trend; format: (n: number) => string }) {
  const diff = trend.current - trend.previous;
  const flat = Math.abs(diff) < 0.05;
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  // Les quatre mesures vont dans le même sens : monter est bon. L'orangé
  // signale un recul à regarder — jamais du rouge, qui crierait la panne.
  const cls = flat
    ? "bg-gray-100 text-gray-500"
    : diff > 0
      ? "bg-green-50 text-green-700"
      : "bg-amber-50 text-amber-700";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
      title={`Semaine en cours : ${format(trend.current)} — semaine précédente : ${format(trend.previous)}`}
    >
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      {flat ? "stable" : `${diff > 0 ? "+" : "−"}${format(Math.abs(diff))}`}
      <span className="font-medium opacity-70">vs sem. préc.</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  trend,
  describeWeek,
  format = (n) => String(n),
}: {
  label: string;
  /** Déjà formatée — « 142 », « 2,5 », « — » quand la mesure n'existe pas encore. */
  value: string;
  /** Ce que compte la courbe, en toutes lettres : c'est ce que l'écart compare. */
  hint: string;
  trend: Trend;
  describeWeek: (w: TrendWeek) => string;
  format?: (n: number) => string;
}) {
  return (
    <div className="flex h-full flex-col bg-white px-5 py-4">
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* Chiffres proportionnels (pas de tabular-nums) : à cette taille, une
            valeur courte paraîtrait décousue si chaque chiffre avait la
            largeur d'un 0. */}
        <span className="text-3xl font-bold leading-none text-gray-900">{value}</span>
        <DeltaChip trend={trend} format={format} />
      </div>
      <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      <div className="mt-auto">
        <Sparkline weeks={trend.weeks} describe={describeWeek} />
      </div>
    </div>
  );
}
