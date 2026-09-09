"use client";

import { useEffect } from "react";
import { estInstallee } from "@/lib/pwa-install";

// Complément ADR 0038 — MESURE de l'installation : quand l'app tourne en mode
// installé (standalone Android / iOS), on le signale au serveur une fois par
// session d'onglet. C'est le seul signal fiable sur toutes les plateformes
// (iOS n'émet jamais `appinstalled`). Aucune donnée envoyée à Google.
const CLE_SESSION = "app_open_reported";

function plateforme(): "ios" | "android" | "desktop" | "other" {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/.test(ua)) return "desktop";
  return "other";
}

// `restaurantId` sert l'entonnoir (ADR 0037) : l'étage « App installée » est
// compté par établissement, comme tous les autres. La balise reste le seul
// signal fiable multiplateforme, et elle est authentifiée — c'est pour ça que
// cet étage n'a pas besoin de passer par la liste close de `/api/funnel`.
export function AppInstallBeacon({ restaurantId }: { restaurantId?: string }) {
  useEffect(() => {
    if (!estInstallee()) return;
    try {
      if (sessionStorage.getItem(CLE_SESSION)) return;
      sessionStorage.setItem(CLE_SESSION, "1");
    } catch {
      /* stockage indisponible : on signale quand même */
    }
    fetch("/api/me/app-install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: plateforme(), restaurantId }),
      keepalive: true,
    }).catch(() => {});
  }, [restaurantId]);
  return null;
}
