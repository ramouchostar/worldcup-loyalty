// Anneau de progression « camembert » — un jeton = une action sociale
// accomplie, 4 jetons = une récompense (TOKENS_PER_PORTION, cf.
// app/r/[restaurantId]/micro-rewards/page.tsx). Chaque quart se colore au
// fur et à mesure, étoile au centre façon jeton/pièce (gamification).

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function wedgePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const GAP_DEG = 10;
const STAR_PATH = "M12 2.5l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.6l-5.6 3 1.4-6.3-4.8-4.3 6.4-.6L12 2.5Z";

export function TokenProgressRing({
  total,
  completed,
  size = 44,
}: {
  total: number;
  completed: number;
  size?: number;
}) {
  const strokeWidth = size * 0.13;
  const radius = (size - strokeWidth) / 2;
  const segAngle = 360 / total;
  const complete = completed >= total;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: total }).map((_, i) => (
          <path
            key={i}
            d={wedgePath(
              size / 2,
              size / 2,
              radius,
              i * segAngle + GAP_DEG / 2,
              (i + 1) * segAngle - GAP_DEG / 2
            )}
            fill="none"
            stroke={i < completed ? "#f59e0b" : "#e5e7eb"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="transition-colors duration-500"
          />
        ))}
      </svg>
      <div
        className={`absolute inset-0 m-auto flex items-center justify-center rounded-full bg-white transition-shadow duration-500 ${
          complete ? "ring-2 ring-amber-300" : ""
        }`}
        style={{
          width: size * 0.6,
          height: size * 0.6,
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08), 0 1px 1px rgba(255,255,255,0.7)",
        }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.36} height={size * 0.36} fill="#f59e0b" aria-hidden="true">
          <path d={STAR_PATH} />
        </svg>
      </div>
      <span className="sr-only">
        {completed}/{total} jetons
      </span>
    </div>
  );
}
