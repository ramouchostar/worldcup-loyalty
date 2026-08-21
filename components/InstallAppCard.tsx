"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import {
  estInstallee,
  estIosSafari,
  lancerInstallation,
  onboardingProposeDeja,
  promptDifferé,
  surPromptInstall,
  type InstallPromptEvent,
} from "@/lib/pwa-install";

// ADR 0038 — L'endroit où l'on peut TOUJOURS installer l'app, par opposition
// au moment unique de l'onboarding (OnboardingFlow, membre) ou du navigateur.
// Disparaît de lui-même une fois l'app installée : rien à masquer à la main,
// aucun réglage à retenir.

type Audience = "membre" | "restaurateur";
type Ton = "accueil" | "discret";

const TEXTES: Record<Audience, { titre: string; pourquoi: string }> = {
  membre: {
    titre: "Installe l'app sur ton téléphone",
    pourquoi:
      "Un raccourci sur l'écran d'accueil, et les notifications quand ton équipe progresse ou qu'un cadeau t'attend.",
  },
  restaurateur: {
    titre: "Installez la console sur votre téléphone",
    pourquoi:
      "Un raccourci sur l'écran d'accueil pour valider les tickets et suivre vos chiffres sans passer par le navigateur.",
  },
};

export function InstallAppCard({
  audience,
  surface,
  ton = "discret",
}: {
  audience: Audience;
  /** D'où la proposition est faite — sert la mesure, pas l'affichage. */
  surface: string;
  ton?: Ton;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installee, setInstallee] = useState(true); // rien avant vérification
  const [ios, setIos] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const [onboardingEnCours, setOnboardingEnCours] = useState(false);

  useEffect(() => {
    setInstallee(estInstallee());
    setIos(estIosSafari());
    setPrompt(promptDifferé());
    // Côté membre, l'onboarding pose déjà la question au premier passage :
    // tant qu'il est dû, cette carte se tait.
    setOnboardingEnCours(audience === "membre" && onboardingProposeDeja());
    return surPromptInstall(setPrompt);
  }, [audience]);

  const visible = !installee && !onboardingEnCours;
  const vouvoie = audience === "restaurateur";

  useEffect(() => {
    if (visible) track("pwa_install_prompted", { audience, surface });
  }, [visible, audience, surface]);

  if (!visible) return null;

  async function installer() {
    setEnCours(true);
    const accepte = await lancerInstallation();
    setEnCours(false);
    if (accepte) setInstallee(true);
  }

  const cadre =
    ton === "accueil"
      ? "border-brand-gold/50 bg-brand-gold/10"
      : "border-gray-200 bg-white";

  return (
    <section className={`rounded-2xl border p-4 ${cadre}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden="true">
          📲
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm text-gray-900">{TEXTES[audience].titre}</h2>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{TEXTES[audience].pourquoi}</p>

          {ios ? (
            // iOS Safari n'expose aucun déclencheur : on décrit les deux gestes.
            <ol className="mt-3 space-y-1.5 text-xs text-gray-700">
              <li>
                1. {vouvoie ? "Touchez" : "Tape"} l&apos;icône{" "}
                <span className="font-semibold text-blue-600">Partager</span> ⬆️ en bas de Safari
              </li>
              <li>
                2. Puis <span className="font-semibold">« Sur l&apos;écran d&apos;accueil »</span> ＋
              </li>
            </ol>
          ) : prompt ? (
            <button
              onClick={installer}
              disabled={enCours}
              className="mt-3 bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {enCours ? "Installation…" : "Installer l'app"}
            </button>
          ) : (
            // Navigateur sans invite native (Firefox, Chrome de bureau avant
            // que l'événement ne parte…) : le chemin manuel existe toujours.
            <p className="mt-3 text-xs text-gray-500">
              {vouvoie ? "Ouvrez" : "Ouvre"} le menu de{" "}
              {vouvoie ? "votre" : "ton"} navigateur, puis{" "}
              <span className="font-semibold text-gray-700">
                « Ajouter à l&apos;écran d&apos;accueil »
              </span>
              .
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
