"use client";

import { useEffect } from "react";
import s from "./report.module.css";

// ADR 0069 §6 — le PDF est la page partagée elle-même, imprimée par le
// navigateur (« Enregistrer au format PDF ») : une seule mise en page.
export function PrintButton() {
  return (
    <button type="button" className={s.btnGhost} onClick={() => window.print()}>
      Télécharger en PDF
    </button>
  );
}

/** `?pdf=1` : ouvre directement la boîte d'impression, une fois la carte chargée. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}
