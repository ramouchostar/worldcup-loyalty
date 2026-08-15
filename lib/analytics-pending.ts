// File d'attente pour les événements qui se produisent au moment d'une
// redirection.
//
// Pourquoi ce détour : `sign_up`, `login` et la complétion de profil se
// concluent par une redirection serveur (`redirect()` dans une Server Action)
// ou par un aller-retour OAuth chez Google. Dans les deux cas, le code qui
// suit l'appel ne s'exécute jamais — impossible d'émettre l'événement sur
// place.
//
// Le formulaire dépose donc une *intention*, et l'événement n'est réellement
// envoyé qu'à l'arrivée sur une page dont l'accès prouve que l'utilisateur est
// authentifié (cf. AnalyticsIdentity, monté dans les layouts qui ont déjà
// résolu `user`). Un abandon en cours de route — mot de passe refusé, OAuth
// annulé chez Google — ne produit donc aucun événement.
//
// sessionStorage et non localStorage : l'intention ne doit pas survivre à la
// fermeture de l'onglet, et elle survit bien à la redirection OAuth (même
// onglet, même origine au retour). Contrepartie assumée : une inscription
// confirmée par email dans un *autre* onglet perd son `sign_up`.

import { track, type AnalyticsEventMap, type AnalyticsEventName } from "./analytics";

const QUEUE_KEY = "boosteats:pending-events";

type QueuedEvent = {
  [K in AnalyticsEventName]: { name: K; params: AnalyticsEventMap[K] };
}[AnalyticsEventName];

/** Deux étapes d'un même parcours peuvent être en attente (compte → profil). */
const MAX_QUEUED = 4;

function readQueue(): QueuedEvent[] {
  try {
    const raw = window.sessionStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

/** Enregistre l'intention juste avant de déclencher la navigation. */
export function queueEvent<K extends AnalyticsEventName>(
  name: K,
  params: AnalyticsEventMap[K],
): void {
  if (typeof window === "undefined") return;
  try {
    const queue = readQueue();
    queue.push({ name, params } as QueuedEvent);
    window.sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
  } catch {
    // Navigation privée, quota plein — on perd la mesure, pas le parcours.
  }
}

/** Émet les événements en attente puis vide la file. Idempotent. */
export function flushEvents(): void {
  if (typeof window === "undefined") return;

  let queue: QueuedEvent[] = [];
  try {
    queue = readQueue();
    if (queue.length === 0) return;
    window.sessionStorage.removeItem(QUEUE_KEY);
  } catch {
    return;
  }

  // `track` est générique et n'accepte pas un couple (name, params) issu d'une
  // union : le compilateur ne peut plus lier les deux. La correspondance a
  // déjà été vérifiée à l'écriture, par la signature de `queueEvent` — d'où ce
  // cast, volontairement isolé sur cette seule ligne.
  const emit = track as (name: AnalyticsEventName, params: object) => void;
  for (const event of queue) emit(event.name, event.params);
}
