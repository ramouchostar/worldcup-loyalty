// Logo Boosteats — une seule source pour toutes les surfaces de la marque
// (vitrine, page membres, connexion, plateforme). Les fichiers vivent dans
// public/brand/ : le nom est en tracés (Manrope ExtraBold), il s'affiche
// pareil sans la police. Jamais sur une surface aux couleurs d'un
// établissement (ADR 0015) ni dans la console restaurateur (ADR 0054 :
// logo et nom de l'établissement en tête).

type Variant = "horizontal" | "symbol" | "wordmark";
type Tone = "dark" | "light"; // couleur du nom : sombre sur fond clair, clair sur fond sombre

const SOURCES: Record<Variant, Record<Tone, string>> = {
  horizontal: { dark: "/brand/boosteats-logo-horizontal.svg", light: "/brand/boosteats-logo-horizontal-clair.svg" },
  // Le symbole porte sa propre tuile sombre : identique sur les deux fonds.
  symbol:{ dark: "/brand/boosteats-symbole.svg", light: "/brand/boosteats-symbole.svg" },
  wordmark: { dark: "/brand/boosteats-wordmark.svg", light: "/brand/boosteats-wordmark-clair.svg" },
};

export function BoosteatsLogo({
  variant = "horizontal",
  tone = "dark",
  className,
  decorative = false,
}: {
  variant?: Variant;
  tone?: Tone;
  // La hauteur se règle ici (ex. "h-7 w-auto") ; la largeur suit le ratio.
  className?: string;
  // Vrai quand le nom est déjà écrit à côté : le logo est alors muet.
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SOURCES[variant][tone]} alt={decorative ? "" : "Boosteats"} className={className} />
  );
}
