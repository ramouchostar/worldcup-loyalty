"use client";

import { useSyncExternalStore } from "react";

// L'écran d'ordinateur (seuil `lg` de Tailwind) : le panier y est toujours visible et la fiche d'un plat tient en deux
// colonnes. Un seul des deux habillages est rendu : jamais deux champs « prénom » dans la page.

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export const useWide = (): boolean => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
