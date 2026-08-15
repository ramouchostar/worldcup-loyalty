// Constantes du lien d'invitation restaurateur (ADR 0032) — isolées de
// lib/owner-invites.ts parce que le MIDDLEWARE en a besoin : il ne doit
// embarquer ni le client Supabase service-role ni la clé qui va avec (même
// règle que la duplication de la hiérarchie de routage post-login).

export const OWNER_INVITE_COOKIE = "pending_owner_invite";

// Le token voyage dans l'URL : on valide sa FORME avant tout usage (cookie,
// lookup base) pour ne pas transformer un segment d'URL arbitraire en requête.
export function isValidInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}
