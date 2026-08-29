"use client";

import { useEffect, useRef, useState } from "react";

// Cache le résumé du backlog (BacklogSummary.tsx) dès qu'on scrolle vers le
// bas, pour laisser toute la hauteur d'écran à la liste/au Kanban en
// dessous — et le refait apparaître dès qu'on remonte, même légèrement,
// sans attendre le retour en haut de page (motif « app bar qui se cache »).
// Isolé dans son propre hook : si l'essai ne convient pas, il suffit de ne
// plus l'appeler (BacklogSummary retombe en flux normal, toujours déplié)
// sans toucher au reste du composant.
export function useScrollCollapse(revealThresholdPx = 24) {
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y <= revealThresholdPx) {
          setCollapsed(false);
        } else if (delta > 4) {
          setCollapsed(true);
        } else if (delta < -4) {
          setCollapsed(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [revealThresholdPx]);

  return collapsed;
}
