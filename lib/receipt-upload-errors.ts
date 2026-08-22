// Messages d'échec d'envoi de photo — côté client (page de scan).
//
// Incident 2026-08 : toute photo > 4,5 Mo est rejetée par Vercel AVANT notre
// code (413 FUNCTION_PAYLOAD_TOO_LARGE, corps texte). Le client faisait
// `res.json()` → exception → « Erreur réseau, vérifie ta connexion » : message
// faux qui poussait à réessayer en boucle. Ici : chaque statut a un message
// vrai et actionnable. Pur, sans dépendance : testable.

// Plafond Vercel ≈ 4,5 Mo : on garde une marge pour le reste du multipart.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function describeUploadFailure(
  status: number,
  serverMessage: string | null | undefined
): string {
  if (status === 413) {
    return "La photo est trop lourde pour être envoyée. Reprends-la directement depuis l'app (elle sera allégée automatiquement), ou choisis une photo plus légère.";
  }
  if (status === 429) {
    return "Trop d'essais en peu de temps. Attends quelques minutes avant de réessayer.";
  }
  if (status === 401) {
    return "Ta session a expiré. Reconnecte-toi puis réessaie.";
  }
  // Un message serveur explicite (notre JSON) prime toujours ; les 502/503/504
  // SANS message sont ceux de la plateforme (corps texte) → générique honnête.
  if (serverMessage && serverMessage.trim()) return serverMessage.trim();
  if (status === 504 || status === 502 || status === 503) {
    return "Le serveur a mis trop de temps à répondre. Réessaie dans un instant.";
  }
  if (status >= 500) return "Erreur côté serveur. Réessaie dans un instant.";
  return "Envoi impossible. Réessaie.";
}

// Lit une réponse fetch sans jamais lever sur un corps non-JSON (413/502 de
// la plateforme renvoient du texte).
export async function readJsonSafe<T = Record<string, unknown>>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  if (text) {
    try { data = JSON.parse(text) as T; } catch { data = null; }
  }
  return { ok: res.ok, status: res.status, data };
}
