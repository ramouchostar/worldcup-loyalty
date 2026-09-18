// ============================================================
// « Ce que tes points permettent » (ADR 0061 §5) — une ligne, deux tons.
//
// Après chaque ticket, le client doit comprendre ce qu'il a gagné ou ce
// qu'il est près de gagner : l'article le plus généreux à sa portée (« tu
// peux déjà l'avoir » / « à ta prochaine visite », selon que les points
// disponibles suffisent), sinon les points qui manquent pour le suivant.
// Noms et proportion de barre — jamais de coût, jamais d'euro (ADR 0007).
//
// `tone="dark"` : sur le dégradé vert de l'écran de succès ; `"light"` : sur
// la carte blanche du visiteur.
// ============================================================
import { foodIconUrl } from "@/lib/food-icon";
import { menuImageUrl } from "@/lib/menu-images";
import type { PointsGoal } from "@/lib/catalogue";

function Picture({ name, imagePath, className }: { name: string; imagePath: string | null; className: string }) {
  const photo = menuImageUrl(imagePath);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo ?? foodIconUrl(name)}
      alt=""
      aria-hidden="true"
      className={photo ? `${className} rounded-lg object-cover` : className}
    />
  );
}

export default function PointsGoalLine({ goal, tone }: { goal: PointsGoal; tone: "dark" | "light" }) {
  const box = tone === "dark" ? "bg-white/15 text-white" : "bg-white border border-gray-200 text-gray-900";
  const muted = tone === "dark" ? "text-white/80" : "text-gray-600";
  const track = tone === "dark" ? "bg-white/20" : "bg-gray-100";
  const bar = tone === "dark" ? "bg-white" : "bg-green-600";

  if (goal.reachable) {
    return (
      <div className={`${box} rounded-2xl p-3 flex items-center gap-3 text-left max-w-xs mx-auto`}>
        <Picture name={goal.reachable.name} imagePath={goal.reachable.imagePath} className="w-12 h-12 shrink-0" />
        <div className="min-w-0">
          <p className={`text-xs ${muted}`}>
            {goal.reachableNow ? "Avec tes points, tu peux déjà avoir" : "À ta prochaine visite, tes points t'offrent"}
          </p>
          <p className="font-bold leading-tight truncate">{goal.reachable.name}</p>
        </div>
      </div>
    );
  }

  if (goal.next) {
    return (
      <div className={`${box} rounded-2xl p-3 text-left max-w-xs mx-auto`}>
        <div className="flex items-center gap-3">
          <Picture name={goal.next.name} imagePath={goal.next.imagePath} className="w-10 h-10 shrink-0" />
          <p className={`text-sm ${muted}`}>
            Plus que <span className="font-bold">{goal.next.missing.toLocaleString("fr-BE")} points</span> pour{" "}
            <span className="font-bold">{goal.next.name}</span>
          </p>
        </div>
        <div className={`mt-2 h-2 ${track} rounded-full overflow-hidden`}>
          <div className={`h-full ${bar} rounded-full`} style={{ width: `${Math.max(goal.next.pct, 4)}%` }} />
        </div>
      </div>
    );
  }

  return null;
}
