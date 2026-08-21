"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TeamRecognitionPrompt, type PromptSuggestion } from "./TeamRecognitionPrompt";
import { CLE_PWA_VUE, CLE_PWA_REPORTEE } from "@/lib/pwa-install";

// ── beforeinstallprompt captured early (fires before React mounts) ─────────
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let _deferredInstall: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredInstall = e as BeforeInstallPromptEvent;
  });
}

// ── localStorage keys ──────────────────────────────────────────────────────
// Partagées avec la carte d'installation permanente (ADR 0038) : elle s'efface
// tant que cette étape-ci est encore due, pour ne pas proposer deux fois la
// même chose sur le même écran.
const K_PWA_DONE  = CLE_PWA_VUE;
const K_PWA_SNZ   = CLE_PWA_REPORTEE;
const K_PUSH_DONE = "push_prompted";
const K_PUSH_SNZ  = "push_snoozed_until";
const K_TOUR      = "tour_done";
const SNOOZE_24H  = 24 * 60 * 60 * 1000;

// ── helpers ────────────────────────────────────────────────────────────────
function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function iosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
}

function snoozed(key: string): boolean {
  const v = localStorage.getItem(key);
  return !!v && Date.now() < Number(v);
}

function snooze(key: string) {
  localStorage.setItem(key, String(Date.now() + SNOOZE_24H));
}

function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

// ── Stage machine ──────────────────────────────────────────────────────────
// ADR 0031 — l'étape « teams » vient APRÈS le tour : la dernière bulle du tour
// explique justement à quoi sert une équipe. Poser la question avant, c'est la
// poser à quelqu'un qui ne sait pas encore ce qu'il choisit.
type Stage = "pwa" | "push" | "tour" | "teams" | "done";

function pushEligible(): boolean {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    Notification.permission === "default" &&
    localStorage.getItem(K_PUSH_DONE) !== "true" &&
    !snoozed(K_PUSH_SNZ)
  );
}

// Fin de parcours : la question d'équipe si elle est due (état serveur), sinon
// terminé. Jamais de localStorage ici — la relance à une semaine vit sur
// memberships pour survivre au changement d'appareil.
function afterTour(hasTeamPrompt: boolean): Stage {
  return hasTeamPrompt ? "teams" : "done";
}

function computeStage(hasTeamPrompt: boolean): Stage {
  if (
    !standalone() &&
    localStorage.getItem(K_PWA_DONE) !== "true" &&
    !snoozed(K_PWA_SNZ)
  ) return "pwa";

  if (pushEligible()) return "push";

  if (localStorage.getItem(K_TOUR) !== "true") return "tour";

  return afterTour(hasTeamPrompt);
}

function nextAfter(current: "pwa" | "push", hasTeamPrompt: boolean): Stage {
  if (current === "pwa" && pushEligible()) return "push";
  return localStorage.getItem(K_TOUR) !== "true" ? "tour" : afterTour(hasTeamPrompt);
}

const TOUR_STEPS = [
  { element: "#tour-nav-commande",       title: "Scanne ton ticket 📸",      description: "Après chaque visite, prends ton ticket en photo ici." },
  { element: "#tour-nav-actions",        title: "Gagne des jetons ⭐",        description: "Laisse un avis Google, suis-nous sur les réseaux. Chaque action = un jeton." },
  { element: "#tour-nav-recompenses",    title: "Tes cadeaux 🎁",            description: "Retrouve ici ce que tu gagnes sur ta prochaine visite." },
  { element: "#tour-community-progress", title: "La force de ton équipe ⚡", description: "Plus votre équipe commande, plus vos cadeaux grossissent. Le classement complet est à un tap d'ici." },
];

// ── Component ──────────────────────────────────────────────────────────────
export function OnboardingFlow({
  teamPrompt = null,
}: {
  // Propositions de communautés dues pour ce membre (ADR 0031) — calculées
  // côté serveur, null si le membre a déjà une équipe, si la relance n'est pas
  // échue, ou si l'établissement n'a rien déclaré.
  teamPrompt?: { suggestions: PromptSuggestion[] } | null;
}) {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const hasTeamPrompt = !!teamPrompt && teamPrompt.suggestions.length > 0;
  const promptRef = useRef(hasTeamPrompt);
  // Les propositions du montage : elles doivent survivre au router.refresh()
  // déclenché par l'adhésion (le serveur ne les renvoie plus ensuite).
  const suggestionsRef = useRef(teamPrompt?.suggestions ?? []);
  const [stage, setStage]     = useState<Stage | null>(null);
  const [isIOS, setIsIOS]     = useState(false);
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    // Pick up early-captured prompt + listen for late arrivals
    if (_deferredInstall) setInstall(_deferredInstall);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      _deferredInstall = e as BeforeInstallPromptEvent;
      setInstall(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    setIsIOS(iosSafari());
    setStage(computeStage(promptRef.current));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    // Volontairement figé au montage : après une adhésion, router.refresh()
    // vide teamPrompt côté serveur — rejouer cet effet démonterait l'écran de
    // succès avant que le membre ne l'ait vu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Launch driver.js when we reach the tour stage
  useEffect(() => {
    if (stage !== "tour") return;
    const driverObj = driver({
      popoverClass: "brand-popover",
      allowClose: false,
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: "Suivant →",
      prevBtnText: "← Retour",
      doneBtnText: "C'est parti ! 🔥",
      onDestroyStarted: () => {
        localStorage.setItem(K_TOUR, "true");
        driverObj.destroy();
        setStage(afterTour(promptRef.current));
      },
      steps: TOUR_STEPS.map((s) => ({
        element: s.element,
        popover: { title: s.title, description: s.description, side: "top" as const, align: "center" as const },
      })),
    });
    const t = setTimeout(() => driverObj.drive(), 400);
    return () => clearTimeout(t);
  }, [stage]);

  // ── Question d'équipe (ADR 0031) ───────────────────────────────────────
  if (stage === "teams") {
    return (
      <TeamRecognitionPrompt
        restaurantId={restaurantId}
        suggestions={suggestionsRef.current}
        onDone={() => setStage("done")}
      />
    );
  }

  if (stage === null || stage === "done" || stage === "tour") return null;

  // ── PWA handlers ───────────────────────────────────────────────────────
  async function handleAndroidInstall() {
    if (install) {
      await install.prompt();
      const { outcome } = await install.userChoice;
      if (outcome !== "accepted") return; // native dialog dismissed — let user choose Plus tard
    }
    localStorage.setItem(K_PWA_DONE, "true");
    setStage(nextAfter("pwa", promptRef.current));
  }

  function donePWA() {
    localStorage.setItem(K_PWA_DONE, "true");
    setStage(nextAfter("pwa", promptRef.current));
  }

  function snoozePWA() {
    snooze(K_PWA_SNZ);
    setStage(nextAfter("pwa", promptRef.current));
  }

  // ── Push handlers ──────────────────────────────────────────────────────
  async function activatePush() {
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
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
          } catch { /* subscription failed silently */ }
        }
      } else {
        localStorage.setItem("push_refused", "true");
        localStorage.setItem("push_dismissed", "1");
      }
    } catch { /* requestPermission not supported */ }
    localStorage.setItem(K_PUSH_DONE, "true");
    setPushBusy(false);
    setStage(nextAfter("push", promptRef.current));
  }

  function refusePush() {
    localStorage.setItem(K_PUSH_DONE, "true");
    localStorage.setItem("push_refused", "true");
    localStorage.setItem("push_dismissed", "1");
    setStage(nextAfter("push", promptRef.current));
  }

  function snoozePush() {
    snooze(K_PUSH_SNZ);
    setStage(nextAfter("push", promptRef.current));
  }

  // ── PWA modal ──────────────────────────────────────────────────────────
  if (stage === "pwa") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
          <div className="text-center mb-5">
            <p className="text-4xl mb-3">📲</p>
            <h2 className="text-xl font-black text-gray-900">
              Installe l&apos;app sur ton téléphone
            </h2>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              Accède à tes cadeaux en un tap,<br />sans ouvrir le navigateur.
            </p>
          </div>

          {isIOS && (
            <div className="bg-gray-50 rounded-2xl p-4 mb-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-brand-dark text-brand-gold rounded-full flex items-center justify-center font-black text-xs shrink-0">
                  1
                </div>
                <p className="text-sm text-gray-700 pt-0.5">
                  Tape l&apos;icône{" "}
                  <span className="font-bold text-blue-600">Partager</span>{" "}
                  <span className="text-lg">⬆️</span> en bas de Safari
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-brand-dark text-brand-gold rounded-full flex items-center justify-center font-black text-xs shrink-0">
                  2
                </div>
                <p className="text-sm text-gray-700 pt-0.5">
                  Puis{" "}
                  <span className="font-bold text-gray-900">
                    &laquo;&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;&raquo;
                  </span>{" "}
                  <span className="text-lg">＋</span>
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {isIOS ? (
              <>
                <button
                  onClick={donePWA}
                  className="w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors"
                >
                  C&apos;est fait ✅
                </button>
                <button
                  onClick={snoozePWA}
                  className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
                >
                  Plus tard
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleAndroidInstall}
                  className="w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors"
                >
                  Installer l&apos;app
                </button>
                <button
                  onClick={snoozePWA}
                  className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
                >
                  Plus tard
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Push modal ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
        <div className="text-center mb-6">
          <p className="text-4xl mb-3">🔔</p>
          <h2 className="text-xl font-black text-gray-900">Ne rate aucun cadeau</h2>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            On t&apos;avertit quand ton équipe monte<br />en puissance ou quand tu as un bonus.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={activatePush}
            disabled={pushBusy}
            className="w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors disabled:opacity-50"
          >
            {pushBusy ? "Activation…" : "Activer les notifications"}
          </button>
          <button
            onClick={snoozePush}
            disabled={pushBusy}
            className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
          >
            Plus tard
          </button>
          <button
            onClick={refusePush}
            disabled={pushBusy}
            className="w-full text-gray-400 text-sm py-1 hover:text-gray-500 transition-colors"
          >
            Non merci
          </button>
        </div>
      </div>
    </div>
  );
}
