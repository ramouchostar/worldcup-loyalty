"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone, Bell, Check } from "lucide-react";
import { track } from "@/lib/analytics";
import { beaconFunnelStep } from "@/lib/funnel-beacon";
import {
  estInstallee,
  estIos,
  promptDifferé,
  surPromptInstall,
  lancerInstallation,
  installTranchee,
  noterInstallTranchee,
  noterPropositionFaite,
} from "@/lib/pwa-install";

// UNE feuille, deux interrupteurs (installer l'app / être notifié), posée sur
// l'écran de résultat du ticket — donc APRÈS le compte.
//
// ADR 0049 — deux choses se jouent ici.
//
// 1. LE RANG. L'installation reste après le compte, sur le même écran, et
//    jamais avant : sur iOS, ajouter le site à l'écran d'accueil crée un
//    conteneur de stockage séparé de Safari, et la photo du ticket vit
//    justement dans l'IndexedDB de Safari (lib/pending-ticket). Installer
//    l'app d'abord, c'est l'ouvrir sur un écran vierge, sans ticket et sans
//    cadeau. Le ticket doit être parti côté serveur avant qu'on parle d'app.
//    C'est pour ça que la feuille vit sur l'écran de résultat de la
//    soumission, pas sur l'aperçu OCR.
//
// 2. LE PRIX. Chaque demande est payée par le cadeau déjà gagné, jamais par
//    une promesse : le compte s'échange contre « réclame ton cadeau »
//    (ADR 0048 §5), l'app contre « pour le récupérer », les notifications
//    contre « pour savoir quand il t'attend ». Sans cadeau nommé, on ne
//    fabrique pas la promesse — on retombe sur un argument neutre.
//
// Portée : UNE FOIS PAR VISITE, plus une fois par appareil. Un tap sur le fond
// de la feuille ou « Plus tard » ne valent que pour la visite en cours ; seul
// un refus explicite du dialogue natif est définitif. Les rattrapages vivent
// ailleurs (carte d'installation permanente, ADR 0038).

// Clé de VISITE : sessionStorage, pas localStorage. C'est tout le changement
// de portée. (« Visite » au sens d'une session de navigateur sur l'appareil —
// rien n'est identifié, rien n'est mesuré : sans rapport avec l'« Arrivée »
// du glossaire.)
const K_VISITE = "post_ticket_sheet_visite";
// Notifications : le navigateur EST la mémoire (Notification.permission passe
// à "denied" sur refus, et n'y revient jamais tout seul). Aucune clé locale à
// tenir — celle d'avant (`push_prompted`) ne faisait que dupliquer, et mal :
// elle était posée même sur un tap dans le vide.

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
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-60 ${checked ? "bg-green-600" : "bg-gray-300"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

export function PostTicketSheet({
  restaurantId,
  reward = null,
  pending = false,
  onDone,
}: {
  restaurantId: string;
  // Nom du cadeau que ce ticket vient de débloquer (couche 1). C'est lui qui
  // paie les deux demandes de cette feuille. Null = rien d'atteint, grille non
  // configurée, ou cadeau déjà actif (ADR 0011) : on reste neutre.
  reward?: string | null;
  // Ticket parti en vérification (file admin, ADR 0008) : aucun cadeau à
  // nommer, mais l'écran promet « tu seras notifié » — c'est la notification
  // elle-même qui paie la demande.
  pending?: boolean;
  // Appelé dès que la feuille a fini son tour — refermée, ou jamais ouverte
  // faute de quelque chose à demander. C'est ce qui libère la question
  // d'équipe, qui passe APRÈS (séquence gain → compte → app → notifs →
  // équipes).
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [resolu, setResolu] = useState(false);
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
    try {
      if (sessionStorage.getItem(K_VISITE) === "true") {
        setResolu(true);
        return;
      }
      const inst = estInstallee();
      // Chaque interrupteur n'apparaît que s'il a encore un sens sur CET
      // appareil : app déjà installée, ou question de l'installation déjà
      // tranchée explicitement → pas de ligne ; permission de notification
      // déjà accordée ou refusée → pas de ligne (le navigateur est la source
      // de vérité, pas un drapeau qu'on aurait posé au passage).
      const iRow = !inst && !installTranchee();
      const pRow =
        "Notification" in window &&
        "serviceWorker" in navigator &&
        Notification.permission === "default";
      if (!iRow && !pRow) {
        setResolu(true);
        return;
      }
      // La feuille s'ouvre : la première proposition a eu lieu, la carte
      // permanente (ADR 0038) peut prendre le relais à partir de maintenant.
      sessionStorage.setItem(K_VISITE, "true");
      noterPropositionFaite();
      // Entonnoir (ADR 0037) — dénominateur de l'étage « App installée ».
      // Compté ici et pas au rendu du parent : la feuille ne s'ouvre que
      // quand elle a réellement quelque chose à demander (app pas installée,
      // permission pas tranchée), et c'est CE nombre qui donne un sens au
      // taux d'installation.
      beaconFunnelStep(restaurantId, "install_prompt_shown");
      setInstalled(inst);
      setInstallRow(iRow);
      setPushRow(pRow);
      // Tous les navigateurs iOS passent par la feuille Partager (Chrome/Firefox
      // iOS compris) — pas seulement Safari (correctif 2026-09-10).
      setIsIOS(estIos());
      setCanPrompt(!!promptDifferé());
      setOpen(true);
      return surPromptInstall((e) => setCanPrompt(!!e));
    } catch {
      // sessionStorage/localStorage indisponible → pas de feuille, jamais
      // d'erreur, et la suite du parcours n'est pas bloquée.
      setResolu(true);
    }
  }, []);

  // Passe la main une seule fois, quoi qu'il arrive (refermée ou jamais
  // ouverte) — sans quoi la question d'équipe resterait derrière une feuille
  // qui ne viendra pas.
  const passee = useRef(false);
  useEffect(() => {
    if (!resolu || passee.current) return;
    passee.current = true;
    onDone?.();
  }, [resolu, onDone]);

  /** Sortie « pour cette visite » : rien de définitif n'est posé ici. */
  function close() {
    setOpen(false);
    setResolu(true);
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
        return;
      }
      // "dismissed" — la personne a annulé le dialogue NATIF du navigateur.
      // Réponse explicite : la feuille arrête de proposer l'installation sur
      // cet appareil (la carte permanente, elle, reste — ADR 0038).
      noterInstallTranchee();
      setInstallRow(false);
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
      } else {
        // Refus explicite, mémorisé par le navigateur lui-même : la ligne ne
        // reviendra pas (Notification.permission reste "denied").
        setPushDenied(true);
      }
    } catch {
      // requestPermission indisponible
    }
    setPushBusy(false);
  }

  if (!open) return null;

  // Le cadeau paie les deux demandes. Nommé quand il existe — c'est ce qui
  // change tout entre « installe l'app » et « installe l'app pour récupérer
  // ton Finest burger ». Jamais « validé » ni « instantané » (ADR 0008), et
  // jamais un euro (ADR 0028).
  const cadeau = reward ? `ton ${reward}` : "ton cadeau";
  const titre = reward
    ? `${reward} — à récupérer au comptoir`
    : pending
      ? "On te tient au courant"
      : "Et maintenant ?";
  // Une ligne peut manquer (app déjà installée, permission déjà tranchée) :
  // annoncer « deux choses » quand il n'en reste qu'une se voit tout de suite.
  const uneSeuleLigne = !installRow || !pushRow;
  const sousTitre = pending
    ? "Ton ticket est en vérification. Encore faut-il pouvoir te prévenir dès qu'un cadeau t'attend."
    : reward
      ? `Encore ${uneSeuleLigne ? "une chose" : "deux choses"}, et ${cadeau} te retrouve à ta prochaine visite.`
      : uneSeuleLigne
        ? "Une option pour ne rien rater de tes cadeaux — c'est toi qui choisis."
        : "Deux options pour ne rien rater de tes cadeaux — c'est toi qui choisis.";
  const rienDeFait = !installed && !pushOn;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" aria-hidden="true" />
        <h2 className="text-xl font-black text-gray-900">{titre}</h2>
        <p className="text-gray-500 text-sm mt-1 mb-5">{sousTitre}</p>

        <div className="space-y-4">
          {installRow && (
            <div>
              <div className="flex items-center gap-3">
                <Smartphone className="w-6 h-6 shrink-0 text-gray-700" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Installer l&apos;app</p>
                  <p className="text-xs text-gray-500">
                    {reward
                      ? `Pour récupérer ${cadeau} à ta prochaine visite, sans rouvrir le navigateur.`
                      : "Tes cadeaux en un tap, sans ouvrir le navigateur."}
                  </p>
                </div>
                <Switch checked={installed} onClick={toggleInstall} label="Installer l'app" />
              </div>
              {showInstallHelp && !installed && (
                <div className="bg-gray-50 rounded-xl p-3 mt-2 space-y-2">
                  {isIOS ? (
                    <>
                      <p className="text-xs text-gray-700">
                        {/* ⬆️ ＋ ⋮ : ces trois glyphes ne sont pas des icônes de
                            notre interface mais une reproduction de celle du
                            navigateur — les remplacer par des icônes Lucide
                            montrerait au client un symbole qu'il ne verra pas
                            dans Safari ou Chrome. */}
                        1 · Tape l&apos;icône <span className="font-bold text-blue-600">Partager</span> ⬆️ en bas de ton navigateur
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
                      // Déclaration explicite, et le seul « j'ai répondu »
                      // possible sur iOS Safari : sans elle, la feuille
                      // reproposerait l'installation à chaque visite passée
                      // dans le navigateur (l'app installée, elle, est un
                      // conteneur séparé — estInstallee() y reste faux).
                      noterInstallTranchee();
                      setInstalled(true);
                      setShowInstallHelp(false);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 underline"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    C&apos;est fait
                  </button>
                </div>
              )}
            </div>
          )}

          {pushRow && (
            <div>
              <div className="flex items-center gap-3">
                <Bell className="w-6 h-6 shrink-0 text-gray-700" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Être notifié</p>
                  <p className="text-xs text-gray-500">
                    {reward
                      ? `Pour savoir quand ${cadeau} t'attend, et quand ton équipe monte.`
                      : "Quand un cadeau t'attend ou que ton équipe monte."}
                  </p>
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

        {/* Une seule sortie, et son libellé dit la vérité : « Plus tard » tant
            que rien n'est fait — et « plus tard » veut dire plus tard, la
            feuille reviendra à la prochaine visite. */}
        <button
          type="button"
          onClick={close}
          className={
            rienDeFait
              ? "w-full text-gray-500 font-semibold py-3.5 mt-4 hover:text-gray-700 transition-colors"
              : "w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors mt-6"
          }
        >
          {rienDeFait ? "Plus tard" : "Continuer"}
        </button>
      </div>
    </div>
  );
}
