// Lecture de réponse HTTP tolérante + messages d'échec vrais — générique.
//
// Leçon de l'incident scan (2026-08-22) : `await res.json()` à l'aveugle lève
// sur un 413/502 de la plateforme (corps TEXTE, pas JSON) et finit en
// « erreur réseau » trompeuse. Toute mutation/upload côté client passe par
// ici : on lit le texte, on tente le JSON, et on produit un message par
// statut. Pur, sans dépendance : testable (lib/fetch-json.test.ts).

export type JsonResult<T> = { ok: boolean; status: number; data: T | null };

export async function readJsonSafe<T = Record<string, unknown>>(res: Response): Promise<JsonResult<T>> {
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  if (text) {
    try { data = JSON.parse(text) as T; } catch { data = null; }
  }
  return { ok: res.ok, status: res.status, data };
}

// Message d'échec générique (fichiers, formulaires). Pour la photo de ticket,
// lib/receipt-upload-errors.ts spécialise le 413.
export function describeHttpFailure(status: number, serverMessage: string | null | undefined): string {
  // Le message explicite du serveur (notre JSON) prime toujours.
  if (serverMessage && serverMessage.trim()) return serverMessage.trim();
  if (status === 413) return "Le fichier envoyé est trop lourd (limite d'environ 4 Mo). Allège-le ou découpe-le, puis réessaie.";
  if (status === 429) return "Trop de demandes en peu de temps. Attends quelques minutes avant de réessayer.";
  if (status === 401) return "Ta session a expiré. Reconnecte-toi puis réessaie.";
  if (status === 403) return "Action non autorisée pour ce compte.";
  if (status === 404) return "Introuvable — la page a peut-être changé, recharge-la.";
  if (status === 502 || status === 503 || status === 504) return "Le serveur a mis trop de temps à répondre. Réessaie dans un instant.";
  if (status >= 500) return "Erreur côté serveur. Réessaie dans un instant.";
  return "Envoi impossible. Réessaie.";
}

// Raccourci pour les handlers : `const { ok, data, error } = await postJson(...)`.
export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<JsonResult<T> & { error: string | null }> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, data: null, error: "Erreur réseau. Vérifie ta connexion et réessaie." };
  }
  const r = await readJsonSafe<T>(res);
  const serverMessage = (r.data as { error?: unknown } | null)?.error;
  return {
    ...r,
    error: r.ok ? null : describeHttpFailure(r.status, typeof serverMessage === "string" ? serverMessage : null),
  };
}
