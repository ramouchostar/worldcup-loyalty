"use client";

import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

type Status = "idle" | "granted" | "denied" | "loading" | "unsupported" | "error";

export function PushPrompt() {
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }

    // Permission granted — vérifie si une souscription est réellement active
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setStatus(sub ? "granted" : "idle"))
        .catch(() => setStatus("granted"));
    }
  }, []);

  async function subscribe() {
    setStatus("loading");
    setErrMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); return; }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setErrMsg("Clé VAPID manquante.");
        setStatus("error");
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      // Désabonner l'ancienne souscription si elle existe (clés VAPID changées)
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrMsg(data.error ?? `Erreur ${res.status}`);
        setStatus("error");
        return;
      }

      setStatus("granted");
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  if (status === "granted" || status === "denied" || status === "unsupported") return null;

  return (
    <div className={`border rounded-xl p-4 flex items-center gap-3 ${
      status === "error" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"
    }`}>
      <span className="text-2xl">🔔</span>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${status === "error" ? "text-red-900" : "text-blue-900"}`}>
          {status === "error" ? "Échec de l'activation" : "Alertes communautaires"}
        </p>
        <p className={`text-xs mt-0.5 ${status === "error" ? "text-red-700" : "text-blue-700"}`}>
          {status === "error"
            ? (errMsg ?? "Réessaie ou vérifie que tu es connecté.")
            : "Sois notifié quand ta communauté franchit un palier."}
        </p>
      </div>
      <button
        onClick={subscribe}
        disabled={status === "loading"}
        className={`shrink-0 text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50 transition-colors ${
          status === "error"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {status === "loading" ? "…" : status === "error" ? "Réessayer" : "Activer"}
      </button>
    </div>
  );
}
