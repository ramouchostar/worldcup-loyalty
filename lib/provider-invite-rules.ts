// ============================================================
// Réserver un prestataire (ADR 0084) — qui peut accepter une invitation.
//
// Le lien est lié à UNE adresse : un prestataire voit les brefs des
// restaurateurs et sera payé, une invitation transférée par message ne doit
// pas ouvrir son compte à quelqu'un d'autre. Fonction PURE : l'instant et
// l'adresse du compte connecté sont des entrées.
// ============================================================

export type InviteRow = {
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type InviteVerdict = "valid" | "revoked" | "accepted" | "expired" | "email-mismatch";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * `userEmail` = l'adresse du compte connecté, ou `undefined` pour juger le lien seul (page vue
 * avant connexion). Un compte sans adresse connue ne peut jamais accepter.
 */
export function judgeInvite(row: InviteRow, now: Date, userEmail?: string | null): InviteVerdict {
  if (row.revoked_at) return "revoked";
  if (row.accepted_at) return "accepted";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  if (userEmail !== undefined && normalizeEmail(userEmail) !== normalizeEmail(row.email)) return "email-mismatch";
  return "valid";
}
