"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // En développement, aucun service worker : un ancien resté installé
    // servait la page depuis son cache et la faisait recharger en boucle.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failure is non-fatal — app still works online
    });
  }, []);

  return null;
}
