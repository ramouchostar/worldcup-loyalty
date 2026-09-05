const FOOD_ICONS = {
  burger: "🍔",
  pizza: "🍕",
  sushi: "🍣",
} as const;

// Décor purement visuel (landing publique restaurateurs) : icônes food en
// filigrane pour rappeler le secteur, jamais un cadeau ou un article réel
// (voir ADR 0042/0043 — ceux-ci restent portés par les cartes dédiées).
export function FloatingFoodIcon({
  icon,
  className = "",
}: {
  icon: keyof typeof FOOD_ICONS;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none select-none absolute text-4xl sm:text-5xl opacity-[0.12] ${className}`}
    >
      {FOOD_ICONS[icon]}
    </span>
  );
}
