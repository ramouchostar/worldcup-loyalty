"use client";

import { useEffect } from "react";

// ADR 0077 §4 — signale une ouverture de la console au plus une fois par heure
// et par établissement sur ce navigateur. Sans stockage local disponible, on
// s'abstient plutôt que de compter chaque page.
export function ConsoleVisitBeacon({ restaurantId }: { restaurantId: string }) {
  useEffect(() => {
    const hourKey = new Date().toISOString().slice(0, 13); // l'heure UTC suffit pour dédoublonner
    const key = `console_visit:${restaurantId}`;
    try {
      if (localStorage.getItem(key) === hourKey) return;
      localStorage.setItem(key, hourKey);
    } catch {
      return;
    }
    void fetch("/api/admin/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
      keepalive: true,
    }).catch(() => {});
  }, [restaurantId]);
  return null;
}
