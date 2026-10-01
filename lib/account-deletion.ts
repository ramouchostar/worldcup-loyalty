// Suppression de compte — la raison (facultative) et sa lecture.
// Logique pure, partagée par la page /compte/supprimer, la route
// /api/me/delete et les tests.
//
// Pourquoi : `data_requests` disait « un compte supprimé », jamais pourquoi.
// Sans la raison, impossible de savoir si on perd des clients par trop
// d'e-mails, par incompréhension ou parce qu'ils ne viennent plus.

export const DELETION_REASONS = [
  { key: "trop_de_messages", label: "Je reçois trop de messages" },
  { key: "ne_viens_plus", label: "Je ne vais plus dans ce restaurant" },
  { key: "pas_compris", label: "Je ne comprends pas comment ça marche" },
  { key: "cadeaux", label: "Les cadeaux ne m'intéressent pas" },
  { key: "donnees", label: "Je ne veux pas partager mes données" },
  { key: "autre", label: "Autre raison" },
] as const;

export type DeletionReason = (typeof DELETION_REASONS)[number]["key"];

const KEYS = new Set<string>(DELETION_REASONS.map((r) => r.key));
export const DELETION_DETAIL_MAX = 300;

/** Raison et précision nettoyées ; tout ce qui n'est pas reconnu devient null (la raison reste facultative). */
export function parseDeletionReason(body: unknown): { reason: DeletionReason | null; detail: string | null } {
  const b = (body && typeof body === "object" ? body : {}) as { reason?: unknown; detail?: unknown };
  const reason = typeof b.reason === "string" && KEYS.has(b.reason) ? (b.reason as DeletionReason) : null;
  const raw = typeof b.detail === "string" ? b.detail.trim().slice(0, DELETION_DETAIL_MAX) : "";
  return { reason, detail: reason && raw ? raw : null };
}

