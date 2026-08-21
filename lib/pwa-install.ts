// ADR 0038 — Rattrapage de l'installation de l'app.
//
// Le navigateur ne propose `beforeinstallprompt` qu'UNE fois par chargement,
// et seulement là où il le décide (Chrome/Android, pas iOS). Qui rate ce
// moment n'a, sans nous, aucun second chemin : c'est ce que ce module rend
// possible — capter l'événement une fois pour toutes et le rendre disponible
// à n'importe quelle surface, quand le visiteur y revient.
//
// Client uniquement : tout ici touche `window`.

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

// Clés posées par l'étape « pwa » de l'onboarding membre (OnboardingFlow).
// Exportées ici pour que la carte permanente sache si cette étape est encore
// en train de s'afficher : proposer l'installation deux fois sur le même écran
// n'aide personne. La carte est le SECOND chemin, pas un doublon du premier.
export const CLE_PWA_VUE = "pwa_prompted";
export const CLE_PWA_REPORTEE = "pwa_snoozed_until";

/** L'onboarding est-il encore en train de proposer l'installation ? */
export function onboardingProposeDeja(): boolean {
  if (typeof window === "undefined") return false;
  const reportee = localStorage.getItem(CLE_PWA_REPORTEE);
  const enPause = !!reportee && Date.now() < Number(reportee);
  return localStorage.getItem(CLE_PWA_VUE) !== "true" && !enPause;
}

/** Consomme le prompt natif. Retourne true si l'installation a été acceptée. */
export async function lancerInstallation(): Promise<boolean> {
  if (!differe) return false;
  const evenement = differe;
  differe = null;
  abonnes.forEach((cb) => cb(null));
  await evenement.prompt();
  const { outcome } = await evenement.userChoice;
  return outcome === "accepted";
}
