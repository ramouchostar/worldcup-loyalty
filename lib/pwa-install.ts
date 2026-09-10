// ADR 0038 — Rattrapage de l'installation de l'app.
//
// Le navigateur ne propose `beforeinstallprompt` qu'UNE fois par chargement,
// et seulement là où il le décide (Chrome/Android, pas iOS). Qui rate ce
// moment n'a, sans nous, aucun second chemin : c'est ce que ce module rend
// possible — capter l'événement une fois pour toutes et le rendre disponible
// à n'importe quelle surface, quand le visiteur y revient.
//
// Client uniquement : tout ici touche `window`.
import { track } from "./analytics";

export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Abonne = (e: InstallPromptEvent | null) => void;

let differe: InstallPromptEvent | null = null;
const abonnes = new Set<Abonne>();

// Capture au chargement du module : l'événement part souvent AVANT que React
// ne monte quoi que ce soit. L'attendre dans un `useEffect`, c'est le rater.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    differe = e as InstallPromptEvent;
    abonnes.forEach((cb) => cb(differe));
  });
  window.addEventListener("appinstalled", () => {
    differe = null;
    abonnes.forEach((cb) => cb(null));
    // Plan de tracking : l'événement était déclaré mais jamais émis. Vue
    // agrégée GA4 (Android/Chrome seulement, sous consentement) — la mesure
    // fiable par membre est la balise AppInstallBeacon (mode installé).
    track("pwa_installed", {});
  });
}

export function promptDifferé(): InstallPromptEvent | null {
  return differe;
}

/** S'abonne aux changements ; retourne la fonction de désabonnement. */
export function surPromptInstall(cb: Abonne): () => void {
  abonnes.add(cb);
  return () => abonnes.delete(cb);
}

/** L'app tourne-t-elle déjà comme une app installée ? */
export function estInstallee(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS Safari : le seul cas où l'installation existe mais où le navigateur
 * n'offre AUCUN déclencheur programmatique. Il faut décrire les gestes.
 */
export function estIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
}

/** Pur, testable : iOS quel que soit le navigateur. */
export function detecteIos(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua);
}

/**
 * iOS, TOUS navigateurs : Apple n'autorise aucun déclenchement programmatique
 * de l'installation, et Chrome/Firefox iOS passent par la MÊME feuille
 * Partager que Safari — les instructions « menu ⋮ » (Android) y sont fausses.
 * Signalé par le porteur (2026-09-10) : la carte doit décrire les bons gestes
 * sur tout iOS, pas seulement Safari.
 */
export function estIos(): boolean {
  if (typeof window === "undefined") return false;
  return detecteIos(navigator.userAgent);
}

/**
 * L'app est-elle DÉJÀ installée alors qu'on navigue dans le navigateur ?
 * `display-mode: standalone` (estInstallee) ne le voit pas — il ne dit vrai
 * que DANS l'app. getInstalledRelatedApps (Chrome/Android, avec l'entrée
 * `related_applications` du manifest) répond ; ailleurs l'API n'existe pas et
 * on répond false — la carte s'affiche, comme avant. Best-effort.
 */
export async function verifieAppDejaInstallee(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const nav = navigator as unknown as {
      getInstalledRelatedApps?: () => Promise<{ platform: string }[]>;
    };
    if (!nav.getInstalledRelatedApps) return false;
    const apps = await nav.getInstalledRelatedApps();
    return apps.length > 0;
  } catch {
    return false;
  }
}

// ── Une seule règle, partagée par les deux surfaces ─────────────────────────
//
// ADR 0038 §4 : jamais deux fois la même question sur le même écran. La
// PREMIÈRE proposition d'installation est la feuille post-ticket
// (PostTicketSheet) — l'étape « pwa » de l'onboarding membre qui posait ces
// clés à l'origine n'existe plus (retirée avec le tour de bienvenue, ADR 0044).
// Tant que cette première proposition est due, la carte permanente se tait ;
// ensuite elle prend le relais.
//
// ADR 0049 — deux clés, deux portées, parce qu'elles répondent à deux
// questions différentes. Les avoir confondues est exactement ce qui faisait
// qu'un tap sur le fond de la feuille consommait la proposition pour de bon :
//
//   • CLE_PWA_VUE — la première proposition a EU LIEU. Passe la main à la
//     carte permanente. Définitif, par appareil.
//   • CLE_PWA_TRANCHEE — la question de l'installation a été TRANCHÉE sur cet
//     appareil, dans un sens ou dans l'autre : dialogue natif annulé, ou
//     « c'est fait » déclaré sur le chemin manuel (iOS, où aucun refus
//     programmatique n'existe). La feuille arrête de la proposer ; la carte
//     permanente, elle, reste — ce qui doit disparaître c'est l'installation
//     faite, pas le fait de l'avoir refusée (ADR 0038, alternatives rejetées).
//
// La réapparition de la feuille elle-même ne se joue PAS ici : c'est une clé
// de visite (sessionStorage), portée par le composant.
export const CLE_PWA_VUE = "pwa_prompted";
export const CLE_PWA_TRANCHEE = "pwa_install_settled";

/** La première proposition d'installation (la feuille) est-elle encore due ? */
export function premierePropositionDue(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CLE_PWA_VUE) !== "true";
}

/** Marque la première proposition comme faite — la carte permanente peut suivre. */
export function noterPropositionFaite(): void {
  try {
    localStorage.setItem(CLE_PWA_VUE, "true");
  } catch {
    // stockage indisponible (navigation privée) : la feuille se reposera, sans
    // erreur. Mieux qu'une question qui disparaît.
  }
}

/** La question de l'installation est-elle tranchée sur cet appareil ? */
export function installTranchee(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CLE_PWA_TRANCHEE) === "true";
  } catch {
    return false;
  }
}

/**
 * Note une réponse EXPLICITE à la question de l'installation : dialogue natif
 * annulé, ou « c'est fait » déclaré sur le chemin manuel. « Plus tard » et un
 * tap sur le fond de la feuille n'appellent jamais ceci — ils ne valent que
 * pour la visite en cours.
 */
export function noterInstallTranchee(): void {
  try {
    localStorage.setItem(CLE_PWA_TRANCHEE, "true");
  } catch {}
}

/** Consomme le prompt natif. Retourne true si l'installation a été acceptée. */
export type ResultatInstallation = "accepted" | "dismissed" | "unavailable";

export async function lancerInstallation(): Promise<ResultatInstallation> {
  if (!differe) return "unavailable";
  const evenement = differe;
  // L'événement est à USAGE UNIQUE : consommé ici pour toutes les surfaces
  // (une seule source de vérité — le bug « le bouton ne fait rien » venait
  // de références gardées après consommation).
  differe = null;
  abonnes.forEach((cb) => cb(null));
  try {
    await evenement.prompt();
    const { outcome } = await evenement.userChoice;
    return outcome;
  } catch {
    // Référence périmée (déjà consommée, ou invalidée par le navigateur) :
    // JAMAIS d'échec silencieux — l'appelant affiche le chemin manuel.
    return "unavailable";
  }
}
