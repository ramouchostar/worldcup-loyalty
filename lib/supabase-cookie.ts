// Nom du cookie de session Supabase, figé (2026-10-02).
//
// @supabase/ssr le déduit de l'adresse du projet : `sb-<1er segment de
// l'hôte>-auth-token`. Sur kdbyemmsdgybzqfphxup.supabase.co, c'est
// `sb-kdbyemmsdgybzqfphxup-auth-token` ; sur un domaine personnalisé
// (auth.boosteats.be) ce serait `sb-auth-auth-token`, et changer
// NEXT_PUBLIC_SUPABASE_URL déconnecterait tous les membres d'un coup.
// Tous les clients (navigateur, serveur, middleware, callback) passent donc
// ce nom explicitement — l'adresse peut changer, la session reste.
export const SUPABASE_COOKIE_OPTIONS = { name: "sb-kdbyemmsdgybzqfphxup-auth-token" } as const;
