import type { CSSProperties, ReactNode } from "react";

// Photos dans public/marketing/landing/. Toutes libres de droits (Unsplash,
// établissements et plats d'illustration) sauf `belchicken`, une vraie photo
// Belchicken (la photo d'en-tête des établissements en base), réservée au cas
// client Kraainem (décision de Mehdi, 2026-11-05).
export const PHOTOS = {
  poulet: "/marketing/landing/poulet.webp",
  burger: "/marketing/landing/burger.webp",
  salle: "/marketing/landing/salle.webp",
  cuisine: "/marketing/landing/cuisine.webp",
  clients: "/marketing/landing/clients.webp",
  /** Fond du héros : le patron sert deux habitués au comptoir (image d'illustration générée, fournie par Mehdi le 2026-11-05 ; à remplacer par une vraie photo). */
  comptoir: "/marketing/landing/comptoir-habitues.webp",
  /** Vraie photo Belchicken : tenders, frites, sauces et gobelets de la marque. */
  belchicken: "/marketing/landing/belchicken-tenders.webp",
} as const;

function StatusBar({ color }: { color: string }) {
  return (
    <div className="bx-status" style={{ color }} aria-hidden>
      <span>9:41</span>
      <svg viewBox="0 0 60 12" fill={color}>
        <rect x="0" y="6" width="3" height="6" rx="1" />
        <rect x="5" y="4" width="3" height="8" rx="1" />
        <rect x="10" y="2" width="3" height="10" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
        <rect x="32" y="1" width="22" height="10" rx="3" fill="none" stroke={color} strokeWidth="1.2" />
        <rect x="34" y="3" width="16" height="6" rx="1.5" />
      </svg>
    </div>
  );
}

// Un iPhone dessiné en CSS (maquette du 2026-11-04) : cadre, île, barre d'état.
export function IPhone({
  width,
  dark = false,
  wallpaper,
  label,
  lightStatus = false,
  children,
}: {
  width?: number;
  /** Écran sombre : barre d'état et barre d'accueil en blanc. */
  dark?: boolean;
  /** Fond d'écran : une image (url) ou un dégradé CSS. */
  wallpaper?: { image?: string; background?: string };
  label?: string;
  /** Barre d'état blanche seule (écran clair, mais photo sombre en haut). */
  lightStatus?: boolean;
  children: ReactNode;
}) {
  const style = width ? ({ "--w": `${width}px` } as CSSProperties) : undefined;
  return (
    <div className="bx-iphone" style={style} role={label ? "img" : undefined} aria-label={label}>
      <div className="bx-bezel">
        <div className={`bx-scr ${dark ? "bx-dark" : ""}`}>
          <div
            className="bx-wallp"
            style={wallpaper?.image ? { backgroundImage: `url(${wallpaper.image})` } : { background: wallpaper?.background ?? "#fff" }}
          />
          <div className="bx-island" />
          <StatusBar color={dark || lightStatus ? "#fff" : "#0B0D0A"} />
          {children}
          <div className="bx-home" />
        </div>
      </div>
    </div>
  );
}
