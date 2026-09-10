"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import {
  estInstallee,
  estIos,
  lancerInstallation,
  premierePropositionDue,
  promptDifferé,
  surPromptInstall,
  verifieAppDejaInstallee,
  type InstallPromptEvent,
} from "@/lib/pwa-install";

// ADR 0038 — L'endroit où l'on peut TOUJOURS installer l'app, par opposition
// au moment unique de la feuille post-ticket (PostTicketSheet, membre) ou du
// navigateur.
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
  // Incident 2026-09-10 (signalé par le porteur) : deux branches de la carte
  // n'avaient AUCUNE action au tap. Chaque branche a désormais un bouton —
  // quand le navigateur n'offre pas d'installation en un clic (iOS : Apple
  // ne l'autorise à personne ; ailleurs : pas d'invite native), le bouton
  // déplie CE guide au lieu de laisser un texte mort.
  const [guideOuvert, setGuideOuvert] = useState(false);

  // ADR 0038 §4 — la feuille post-ticket est la première proposition ; tant
  // qu'elle est due, cette carte se tait (elle est le SECOND chemin).
  const [premiereDue, setPremiereDue] = useState(false);

  useEffect(() => {
    setInstallee(estInstallee());
    // Tous les navigateurs iOS passent par la feuille Partager (Chrome et
    // Firefox iOS compris) — les instructions « menu ⋮ » y étaient fausses.
    setIos(estIos());
    setPrompt(promptDifferé());
    setPremiereDue(audience === "membre" && premierePropositionDue());
    // App déjà installée mais consultée DANS le navigateur : display-mode ne
    // le voit pas, getInstalledRelatedApps oui (Chrome/Android + manifest
    // related_applications) — la carte se tait au lieu d'un geste mort.
    let annule = false;
    void verifieAppDejaInstallee().then((deja) => {
      if (deja && !annule) setInstallee(true);
    });
    const desabonner = surPromptInstall(setPrompt);
    return () => {
      annule = true;
      desabonner();
    };
  }, [audience]);

  const visible = !installee && !premiereDue;
  const vouvoie = audience === "restaurateur";

  useEffect(() => {
    if (visible) track("pwa_install_prompted", { audience, surface });
  }, [visible, audience, surface]);

  if (!visible) return null;

  async function installer() {
    setEnCours(true);
    const resultat = await lancerInstallation();
    setEnCours(false);
    if (resultat === "accepted") setInstallee(true);
    // "dismissed" / "unavailable" : la lib a notifié les abonnés (prompt →
    // null), la carte bascule d'elle-même sur le chemin manuel « Ajouter à
    // l'écran d'accueil » — plus jamais un clic muet ni un bouton gelé.
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

          {!ios && prompt ? (
            // Android/Chrome avec invite native : l'installation en un clic.
            <button
              onClick={installer}
              disabled={enCours}
              className="mt-3 bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {enCours ? "Installation…" : "Installer l'app"}
            </button>
          ) : (
            // iOS (Apple n'autorise aucun déclenchement en un clic) ou
            // navigateur sans invite native : un VRAI bouton, qui tente
            // d'abord l'installation (une invite a pu arriver entre-temps)
            // puis déplie le guide des gestes — jamais un texte mort.
            <>
              <button
                onClick={async () => {
                  if (!ios) {
                    const resultat = await lancerInstallation();
                    if (resultat === "accepted") {
                      setInstallee(true);
                      return;
                    }
                    if (resultat === "dismissed") return; // refus explicite : on n'insiste pas
                  }
                  setGuideOuvert((g) => !g);
                }}
                className="mt-3 bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              >
                Installer l&apos;app
              </button>
              {guideOuvert && (
                <div className="mt-2 bg-gray-50 rounded-xl p-3">
                  {ios ? (
                    <ol className="space-y-1.5 text-xs text-gray-700">
                      <li>
                        1. {vouvoie ? "Touchez" : "Tape"} l&apos;icône{" "}
                        <span className="font-semibold text-blue-600">Partager</span> ⬆️ en bas de{" "}
                        {vouvoie ? "votre" : "ton"} navigateur
                      </li>
                      <li>
                        2. Puis <span className="font-semibold">« Sur l&apos;écran d&apos;accueil »</span> ＋
                      </li>
                      <li className="text-gray-400">
                        (Sur iPhone, Apple n&apos;autorise pas l&apos;installation en un clic — ces deux gestes suffisent.)
                      </li>
                    </ol>
                  ) : (
                    <p className="text-xs text-gray-700">
                      {vouvoie ? "Ouvrez" : "Ouvre"} le menu{" "}
                      <span className="font-bold">⋮</span> de {vouvoie ? "votre" : "ton"} navigateur,
                      puis{" "}
                      <span className="font-semibold">« Ajouter à l&apos;écran d&apos;accueil »</span> ou{" "}
                      <span className="font-semibold">« Installer l&apos;application »</span>.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
