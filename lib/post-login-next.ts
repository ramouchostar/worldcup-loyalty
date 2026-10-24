import { safeRedirectPath } from "./message-links";

// ADR 0087 §1 — un lien de rappel (notification, e-mail) vers une page de la
// console survit à la connexion. Le middleware garde la destination dans un
// cookie court au moment de renvoyer vers /login ; la connexion (mot de passe,
// lien magique, Google) le consomme et y ramène. Un cookie plutôt qu'un
// paramètre : il traverse l'aller-retour du lien magique et de Google, comme
// pending_restaurant_id. Pur : partagé par le middleware (edge) et le serveur.

export const POST_LOGIN_NEXT_COOKIE = "post_login_next";
export const POST_LOGIN_NEXT_MAX_AGE = 30 * 60;

/** Seules les pages d'UN établissement de la console sont gardées (jamais une URL externe). */
export function consoleReturnPath(path: string | null | undefined): string | null {
  const safe = safeRedirectPath(path ? decodeURIComponentSafe(path) : null);
  if (!safe || safe.length > 300) return null;
  return /^\/admin\/[a-z0-9-]+\/[^?#]+/.test(safe) && !safe.startsWith("/admin/coupon/") ? safe : null;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}
