"use client";

import { useState, useEffect } from "react";

export function PushPrompt() {
  const [status, setStatus] = useState<"idle" | "granted" | "denied" | "loading" | "unsupported">("idle");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "granted") setStatus("granted");
    else if (Notification.permission === "denied") setStatus("denied");
  }, []);

  async function subscribe() {
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      setStatus("granted");
    } catch {
      setStatus("denied");
    }
  }

  if (status === "granted" || status === "denied" || status === "unsupported") return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
      <span className="text-2xl">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-blue-900 text-sm">Alertes communautaires</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Sois notifié quand ta communauté franchit un palier.
        </p>
      </div>
      <button
        onClick={subscribe}
        disabled={status === "loading"}
        className="shrink-0 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {status === "loading" ? "…" : "Activer"}
      </button>
    </div>
  );
}
