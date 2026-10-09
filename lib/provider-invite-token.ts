// Constantes du lien d'invitation PRESTATAIRE (ADR 0084) — isolées de
// lib/providers.ts parce que le MIDDLEWARE en a besoin : il ne doit embarquer
// ni le client Supabase service-role ni la clé qui va avec (même règle que
// lib/owner-invite-token.ts, dont il réutilise la validation de forme).

export { isValidInviteToken } from "./owner-invite-token";

/** Cookie httpOnly posé quand un visiteur non connecté ouvre son lien : il le ramène sur son invitation après connexion. */
export const PROVIDER_INVITE_COOKIE = "pending_provider_invite";

/** La page d'invitation est publique à dessein (le prestataire n'a pas encore de compte). */
export const PROVIDER_INVITE_PATH = /^\/prestataire\/invitation\/([^/]+)$/;
