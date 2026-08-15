"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = "idle" | "visible" | "subscribing" | "done";

export function PushNotificationBanner() {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      Notification.permission !== "default" ||
      localStorage.getItem("push_dismissed") === "1"
    ) return;

    setState("visible");
  }, []);

  async function subscribe() {
    setState("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("visible");
        return;
      }
      // Le canal push conditionne toutes les notifications d'incitation
      // (ADR 0009) : son taux d'acceptation est un indicateur de rétention.
      track("push_permission_granted", {});

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setState("idle"); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      setState("done");
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("idle");
    }
  }

  function dismiss() {
    localStorage.setItem("push_dismissed", "1");
    setState("idle");
  }

  if (state === "idle") return null;

  if (state === "done") {
    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-3 flex items-center gap-3">
        <span aria-hidden="true">✅</span>
        <p className="text-sm text-green-800 font-medium">Notifications activées !</p>
      </div>
    );
  }

  return (
    <div className="bg-brand-dark/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
      <span className="text-xl shrink-0" aria-hidden="true">🔔</span>
      <p className="text-sm text-white flex-1 min-w-0">
        Reçois une alerte quand ta communauté franchit un palier.
      </p>
      <button
        onClick={subscribe}
        disabled={state === "subscribing"}
        className="shrink-0 bg-brand-gold text-brand-dark text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60 transition-opacity"
      >
        {state === "subscribing" ? "…" : "Activer"}
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 text-gray-400 hover:text-white text-xl leading-none transition-colors"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
