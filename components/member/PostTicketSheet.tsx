"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import {
  estInstallee,
  estIosSafari,
  promptDifferé,
  surPromptInstall,
  lancerInstallation,
  CLE_PWA_VUE,
} from "@/lib/pwa-install";

// Étape 08 (backlog onboarding) — UNE feuille, deux interrupteurs (installer
// l'app / être notifié), posée sur l'écran de succès du PREMIER ticket validé
// de l'appareil. Remplace les deux modales successives + le tour guidé qui
// accueillaient l'arrivée au dashboard avant même qu'un cadeau soit gagné.
// Une seule apparition par appareil ; les rattrapages vivent ailleurs
// (carte d'installation permanente, ADR 0038).

const K_SHEET = "post_ticket_sheet_done";
const K_PUSH_DONE = "push_prompted"; // partagée avec l'ancien flux — jamais deux fois

function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function Switch({ checked, busy, onClick, label }: { checked: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-60 ${checked ? "bg-brand-red" : "bg-gray-300"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

export function PostTicketSheet({
  restaurantId,
  hold = false,
}: {
  restaurantId: string;
  // Étape 10 — la question d'équipe passe d'abord sur le même écran : tant
  // qu'elle est visible, la feuille attend son tour.
  hold?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [installRow, setInstallRow] = useState(false);
  const [pushRow, setPushRow] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);

  useEffect(() => {
    if (hold) return;
    try {
      if (localStorage.getItem(K_SHEET) === "true") return;
      const inst = estInstallee();
      // Chaque interrupteur n'apparaît que s'il a encore un sens sur CET
      // appareil (app déjà installée, permission déjà tranchée → rien).
      const iRow = !inst && localStorage.getItem(CLE_PWA_VUE) !== "true";
      const pRow =
        "Notification" in window &&
        "serviceWorker" in navigator &&
        Notification.permission === "default" &&
        localStorage.getItem(K_PUSH_DONE) !== "true";
      if (!iRow && !pRow) return;
      setInstalled(inst);
      setInstallRow(iRow);
      setPushRow(pRow);
      setIsIOS(estIosSafari());
      setCanPrompt(!!promptDifferé());
      setOpen(true);
      return surPromptInstall((e) => setCanPrompt(!!e));
    } catch {
      // localStorage indisponible → pas de feuille, jamais d'erreur
    }
  }, [hold]);

  function close() {
    try {
      localStorage.setItem(K_SHEET, "true");
      // La feuille EST le premier passage : la carte permanente (ADR 0038) et
      // les autres surfaces de rattrapage prennent le relais ensuite.
      localStorage.setItem(CLE_PWA_VUE, "true");
      localStorage.setItem(K_PUSH_DONE, "true");
    } catch {}
    setOpen(false);
  }

  async function toggleInstall() {
    if (installed) return;
    if (canPrompt && !isIOS) {
      const resultat = await lancerInstallation();
      if (resultat === "accepted") {
        setInstalled(true);
        setShowInstallHelp(false);
        return;
      }
      if (resultat === "unavailable") {
        // Référence épuisée/périmée : repli visible immédiat, jamais un tap muet.
        setShowInstallHelp(true);
      }
      // "dismissed" : l'utilisateur a refusé le dialogue natif — on n'insiste pas.
      return;
    }
    // iOS Safari (aucun déclencheur programmatique) ou prompt indisponible :
    // on décrit les gestes, « C'est fait » bascule l'interrupteur.
    setShowInstallHelp((s) => !s);
  }

  async function togglePush() {
    if (pushOn || pushBusy) return;
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setPushOn(true);
        setPushDenied(false);
        track("push_permission_granted", {});
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (vapidKey) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const old = await reg.pushManager.getSubscription();
            if (old) await old.unsubscribe();
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...sub.toJSON(), restaurantId }),
            });
          } catch {
            // abonnement silencieusement raté — la permission, elle, est acquise
          }
        }
        try {
          localStorage.setItem(K_PUSH_DONE, "true");
        } catch {}
      } else {
        setPushDenied(true);
      }
    } catch {
      // requestPermission indisponible
    }
    setPushBusy(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" aria-hidden="true" />
        <h2 className="text-xl font-black text-gray-900">Et maintenant ?</h2>
        <p className="text-gray-500 text-sm mt-1 mb-5">
          Deux options pour ne rien rater de tes cadeaux — c&apos;est toi qui choisis.
        </p>

        <div className="space-y-4">
          {installRow && (
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">📲</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Installer l&apos;app</p>
                  <p className="text-xs text-gray-500">Tes cadeaux en un tap, sans ouvrir le navigateur.</p>
                </div>
                <Switch checked={installed} onClick={toggleInstall} label="Installer l'app" />
              </div>
              {showInstallHelp && !installed && (
                <div className="bg-gray-50 rounded-xl p-3 mt-2 space-y-2">
                  {isIOS ? (
                    <>
                      <p className="text-xs text-gray-700">
                        1 · Tape l&apos;icône <span className="font-bold text-blue-600">Partager</span> ⬆️ en bas de Safari
                      </p>
                      <p className="text-xs text-gray-700">
                        2 · Puis <span className="font-bold">« Sur l&apos;écran d&apos;accueil »</span> ＋
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-700">
                      Ouvre le menu <span className="font-bold">⋮</span> de ton navigateur, puis{" "}
                      <span className="font-bold">« Installer l&apos;application »</span>.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setInstalled(true);
                      setShowInstallHelp(false);
                    }}
                    className="text-xs font-semibold text-brand-red underline"
                  >
                    C&apos;est fait ✅
                  </button>
                </div>
              )}
            </div>
          )}

          {pushRow && (
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">🔔</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Être notifié</p>
                  <p className="text-xs text-gray-500">Quand un cadeau t&apos;attend ou que ton équipe monte.</p>
                </div>
                <Switch checked={pushOn} busy={pushBusy} onClick={togglePush} label="Être notifié" />
              </div>
              {pushDenied && (
                <p className="text-xs text-amber-700 mt-1.5">
                  Notifications bloquées par le navigateur — tu peux les réactiver dans ses réglages.
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          className="w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors mt-6"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
