// ============================================================
// Filet « l'app a été fermée pendant la photo » (ADR 0056).
//
// Terrain 2026-09-14 : sur Android, ouvrir l'appareil photo du téléphone
// (<input capture>) met la page en arrière-plan ; faute de mémoire, le
// système la tue. Au retour, l'app redémarre sur l'écran vide, la photo n'a
// jamais atteint la page — aucun message, aucun appel serveur, rien à
// rattraper.
//
// On note l'heure juste avant d'ouvrir l'appareil photo, et on l'efface dès
// que la page reprend vie (photo reçue, retour au premier plan, annulation).
// Si la marque est encore là au montage suivant, c'est que la page n'a jamais
// repris vie : on le dit, et on propose la galerie.
//
// localStorage et non sessionStorage : une page tuée puis relancée depuis
// l'app installée repart dans une session neuve. Best-effort de bout en bout.
// ============================================================

const KEY = "boosteats_native_camera_opened_at";

/** Au-delà, une marque restée là ne dit plus rien du dernier geste. */
export const APP_CLOSED_WINDOW_MS = 5 * 60_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function markNativeCameraOpened(store: Store | null = browserStore(), now = Date.now()): void {
  try {
    store?.setItem(KEY, String(now));
  } catch {
    // stockage indisponible (navigation privée…) : pas de filet, pas d'erreur
  }
}

export function clearNativeCameraMark(store: Store | null = browserStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // idem
  }
}

/**
 * La page a-t-elle été fermée pendant que l'appareil photo était ouvert ?
 * Lit ET efface la marque : le message ne s'affiche qu'une fois.
 */
export function consumeAppClosedDuringCamera(store: Store | null = browserStore(), now = Date.now()): boolean {
  try {
    const raw = store?.getItem(KEY);
    if (raw == null) return false;
    store?.removeItem(KEY);
    const openedAt = Number(raw);
    return Number.isFinite(openedAt) && now >= openedAt && now - openedAt <= APP_CLOSED_WINDOW_MS;
  } catch {
    return false;
  }
}
