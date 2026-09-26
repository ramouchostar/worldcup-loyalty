// Marque de l'établissement dans la console (ADR 0015) — le logo déposé aux
// réglages, ou la pastille à initiale tant qu'il n'y en a pas.
//
// Le logo est TOUJOURS posé sur une pastille blanche, jamais à nu : l'en-tête
// de la console est sur `brand_dark`, et rien ne garantit qu'un logo
// d'établissement contraste avec sa propre couleur sombre — un logo
// monochrome noir y disparaîtrait purement et simplement. Le blanc est aussi
// le fond sur lequel la grande majorité des logos ont été dessinés.
//
// `object-contain` et non `cover` : un logo est un dessin, pas une photo. Le
// recadrer couperait un mot ou un symbole.

const SIZES = {
  sm: { box: "w-7 h-7", pad: "p-[3px]", radius: "rounded-md", initial: "text-[12px]" },
  md: { box: "w-9 h-9", pad: "p-1", radius: "rounded-lg", initial: "text-[15px]" },
} as const;

export function RestaurantMark({
  name,
  logoUrl,
  size = "md",
  className = "",
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];

  if (logoUrl) {
    return (
      <span
        className={`${s.box} ${s.pad} ${s.radius} bg-white flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="max-w-full max-h-full object-contain" />
      </span>
    );
  }

  return (
    <span
      className={`${s.box} ${s.radius} bg-paper-subtle flex items-center justify-center font-display font-bold text-ink ${s.initial} shrink-0 ${className}`}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
