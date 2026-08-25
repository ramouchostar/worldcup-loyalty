// ============================================================
// Ticket en attente côté navigateur (ADR 0040 — onboarding visiteur).
//
// Un visiteur photographie son ticket AVANT d'avoir un compte. La photo
// préparée (JPEG allégé, lib/receipt-image-client) est gardée en IndexedDB
// le temps de la connexion (OAuth = navigation complète, un state React ne
// survit pas). Au retour (`?resume=1`), l'écran de scan la recharge et
// enchaîne l'analyse. Client uniquement. Tout est best-effort : navigation
// privée ou IndexedDB indisponible → on retombe sur « reprends la photo »,
// jamais une erreur bloquante.
// ============================================================

const DB_NAME = "boosteats-pending-ticket";
const STORE = "tickets";
// Au-delà, la photo est considérée abandonnée (et le ticket est probablement
// encore dans la poche du membre s'il veut recommencer).
const MAX_AGE_MS = 30 * 60_000;

type StoredTicket = { blob: Blob; name: string; type: string; createdAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

/** Garde la photo préparée en attendant la connexion. Best-effort. */
export async function savePendingTicket(restaurantId: string, file: File): Promise<boolean> {
  try {
    const value: StoredTicket = { blob: file, name: file.name, type: file.type, createdAt: Date.now() };
    await tx("readwrite", (s) => s.put(value, restaurantId));
    return true;
  } catch {
    return false;
  }
}

/** Photo en attente pour cet établissement, ou null (absente, expirée, IDB indisponible). */
export async function loadPendingTicket(restaurantId: string): Promise<File | null> {
  try {
    const v = (await tx("readonly", (s) => s.get(restaurantId))) as StoredTicket | undefined;
    if (!v?.blob || Date.now() - v.createdAt > MAX_AGE_MS) return null;
    return new File([v.blob], v.name || "ticket.jpg", { type: v.type || "image/jpeg" });
  } catch {
    return null;
  }
}

export async function clearPendingTicket(restaurantId: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(restaurantId));
  } catch {
    // rien — la photo expirera d'elle-même
  }
}
