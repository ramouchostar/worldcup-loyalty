"use client";

import { useEffect, useRef, useState } from "react";

// Partagé par tout menu "fait main" de la console plateforme (FlatSelect.tsx,
// AssigneePicker dans app/platform/backlog/backlog-ui.tsx) : un menu porté en
// portail vers <body> et positionné en `fixed` doit se refermer dès que ses
// coordonnées ne sont plus valables — scroll, resize, Échap — sinon il reste
// visuellement détaché de son déclencheur. Ne calcule PAS les coordonnées
// lui-même (l'ancrage diffère selon l'appelant : aligné à gauche et à la
// largeur du champ pour un select, aligné à droite pour un petit avatar) —
// juste le cycle de vie ouvert/fermé et le ref du déclencheur.
export function useAnchoredMenu<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, triggerRef };
}
