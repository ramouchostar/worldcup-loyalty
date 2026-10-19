// ============================================================
// Réserver un prestataire (ADR 0084, PR P) — vérifier qu'un lien (le QR code d'une impression) mène quelque part.
//
// Le serveur va chercher l'adresse que le restaurateur a écrite : c'est le geste qui ouvre la porte aux attaques par
// redirection vers le réseau interne (SSRF). Règles : https seulement, sans identifiant, jamais une adresse IP écrite
// en dur ni un nom qui se résout vers une adresse privée, loopback ou locale, redirections suivies à la main (3 au plus)
// et re-vérifiées à chaque saut, délai court, aucun corps lu. Fonctions PURES pour le jugement (testées) ; la partie
// réseau est dans lib/qr-check.ts.
// ============================================================

export const MAX_URL_LENGTH = 500;

export type UrlIssue = "empty" | "too_long" | "invalid" | "not_https" | "credentials" | "ip_literal" | "no_dot" | "blocked_host";

/** Le lien est-il admissible AVANT de le chercher ? (https, un vrai nom de domaine, pas d'identifiants.) */
export function judgeUrl(raw: string): { ok: true; url: URL } | { ok: false; issue: UrlIssue } {
  const text = raw.trim();
  if (!text) return { ok: false, issue: "empty" };
  if (text.length > MAX_URL_LENGTH) return { ok: false, issue: "too_long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, issue: "invalid" };
  }
  if (url.protocol !== "https:") return { ok: false, issue: "not_https" };
  if (url.username || url.password) return { ok: false, issue: "credentials" };
  const host = url.hostname.toLowerCase();
  // Une adresse IP écrite en dur (v4 ou v6) : on n'en veut pas, même publique — un QR vers « 203.0.113.9 » est un signal d'alerte.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) return { ok: false, issue: "ip_literal" };
  if (!host.includes(".")) return { ok: false, issue: "no_dot" };
  if (isBlockedHostname(host)) return { ok: false, issue: "blocked_host" };
  return { ok: true, url };
}

/** Des noms qui désignent la machine ou le réseau interne, quelle que soit leur résolution. */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home") || h.endsWith(".corp") || h === "metadata.google.internal";
}

/** Une adresse résolue est-elle privée, locale ou réservée ? (v4 et v6, y compris v4 écrite en v6.) */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (mapped) return isPrivateAddress(mapped[1]);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (v4) {
    const [p, q, r, s] = v4.slice(1).map(Number);
    if ([p, q, r, s].some((n) => n > 255)) return true;
    if (p === 0 || p === 10 || p === 127) return true; // réseau « ce réseau », privé, loopback
    if (p === 100 && q >= 64 && q <= 127) return true; // partage d'adresses des opérateurs (CGNAT)
    if (p === 169 && q === 254) return true; // lien local, dont les métadonnées des clouds
    if (p === 172 && q >= 16 && q <= 31) return true;
    if (p === 192 && q === 168) return true;
    if (p === 192 && q === 0 && r === 0) return true;
    if (p === 192 && q === 0 && r === 2) return true; // documentation
    if (p === 198 && (q === 18 || q === 19)) return true; // bancs d'essai
    if (p === 198 && q === 51 && r === 100) return true;
    if (p === 203 && q === 0 && r === 113) return true;
    if (p >= 224) return true; // multicast, réservé, diffusion
    return false;
  }
  if (a.includes(":")) {
    if (a === "::" || a === "::1") return true;
    if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) return true; // fe80::/10 lien local
    if (a.startsWith("fc") || a.startsWith("fd")) return true; // fc00::/7 privé
    if (a.startsWith("ff")) return true; // multicast
    if (a.startsWith("2001:db8")) return true; // documentation
    if (a.startsWith("64:ff9b")) return true; // NAT64 : cache une adresse v4
    return false;
  }
  return true; // ce n'est pas une adresse : on refuse par prudence
}

export const URL_ISSUE_TEXT: Record<UrlIssue, string> = {
  empty: "Colle l'adresse que le QR code doit ouvrir.",
  too_long: "Cette adresse est trop longue (500 caractères au plus).",
  invalid: "Ce n'est pas une adresse valide.",
  not_https: "L'adresse doit commencer par https://",
  credentials: "Retire l'identifiant et le mot de passe de l'adresse.",
  ip_literal: "Utilise un nom de site (par exemple monrestaurant.be), pas une adresse en chiffres.",
  no_dot: "Cette adresse n'est pas celle d'un site.",
  blocked_host: "Cette adresse n'est pas celle d'un site public.",
};
