"use client";

import { useEffect, useState } from "react";
import { BellRing, Share } from "lucide-react";

// ADR 0077 §2 — « Recevoir les alertes importantes sur ce téléphone ».
// Affichée sur l'accueil de la console tant que CE téléphone n'est pas abonné
// pour CET établissement. Un téléphone qui a déjà donné sa permission est
// réabonné en silence (l'abonnement côté serveur est idempotent) : la carte
// ne réapparaît pas à chaque visite.
//
// Sur iPhone, le push n'existe que pour l'app ajoutée à l'écran d'accueil :
// la carte le dit au lieu d'un bouton qui ne ferait rien.

type State = "hidden" | "offer" | "ios" | "busy" | "done" | "error";

const SNOOZE_DAYS = 14;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function snoozeKey(restaurantId: string) {
  return `console_push_later:${restaurantId}`;
}

// Ce téléphone a déjà activé les alertes de CETTE console. Sans ce repère, une
// permission accordée côté membre abonnerait le gérant sans qu'il l'ait demandé.
function activatedKey(restaurantId: string) {
  return `console_push_on:${restaurantId}`;
}

async function register(restaurantId: string, sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  const res = await fetch("/api/admin/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId, endpoint: json.endpoint, keys: json.keys }),
  });
  return res.ok;
}

export function ConsolePushCard({ restaurantId }: { restaurantId: string }) {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let snoozed = false;
    let activated = false;
    try {
      const until = Number(localStorage.getItem(snoozeKey(restaurantId)) ?? 0);
      snoozed = until > Date.now();
      activated = localStorage.getItem(activatedKey(restaurantId)) === "1";
    } catch {}

    if (!supported || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      if (ios && !standalone && !snoozed) setState("ios");
      return;
    }
    if (Notification.permission === "denied") return;
    if (Notification.permission === "granted" && activated) {
      // Déjà activé ici : on réabonne en silence (abonnement renouvelé par le navigateur).
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (sub) void register(restaurantId, sub);
          else if (!snoozed) setState("offer");
        })
        .catch(() => {});
      return;
    }
    if (!snoozed) setState("offer");
  }, [restaurantId]);

  async function activate() {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("hidden");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as unknown as ArrayBuffer,
        }));
      const ok = await register(restaurantId, sub);
      if (ok) {
        try {
          localStorage.setItem(activatedKey(restaurantId), "1");
        } catch {}
      }
      setState(ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  function later() {
    try {
      localStorage.setItem(snoozeKey(restaurantId), String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {}
    setState("hidden");
  }

  if (state === "hidden") return null;

  if (state === "done") {
    return (
      <div className="flex items-center gap-3 bg-good/10 border border-good/30 rounded-xl px-5 py-3.5 text-[13.5px] text-ink">
        <BellRing size={17} strokeWidth={1.8} className="text-good shrink-0" aria-hidden="true" />
        Alertes activées sur ce téléphone. Tu recevras le bilan de ton équipe et les rappels utiles.
      </div>
    );
  }

  return (
    <div className="bg-white border border-paper-border rounded-xl px-5 py-4 grid grid-cols-[34px_minmax(0,1fr)] sm:grid-cols-[34px_minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 items-center">
      <span className="w-[34px] h-[34px] rounded-full bg-paper-subtle text-ink flex items-center justify-center" aria-hidden="true">
        <BellRing size={16} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">Recevoir les alertes importantes sur ce téléphone</p>
        {state === "ios" ? (
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            Sur iPhone, ajoute d&apos;abord la console à ton écran d&apos;accueil : touche{" "}
            <Share size={12} strokeWidth={1.8} className="inline-block -mt-0.5" aria-label="Partager" />, puis « Sur l&apos;écran
            d&apos;accueil ». Ouvre-la depuis l&apos;icône, et cette carte proposera d&apos;activer les alertes.
          </p>
        ) : (
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            {state === "error"
              ? "L'activation n'a pas abouti. Réessaie dans un instant."
              : "Bilan de ton équipe en salle, rappels utiles. Jamais plus d'une par jour."}
          </p>
        )}
      </div>
      <div className="col-start-2 sm:col-start-auto flex items-center gap-2">
        {state !== "ios" && (
          <button
            type="button"
            onClick={() => void activate()}
            disabled={state === "busy"}
            className="bg-ink text-white text-[13px] font-bold px-3.5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {state === "busy" ? "…" : "Activer"}
          </button>
        )}
        <button type="button" onClick={later} className="text-[12.5px] font-semibold text-ink-muted hover:text-ink px-1">
          Plus tard
        </button>
      </div>
    </div>
  );
}
