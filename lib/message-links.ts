// Suivi des clics sans traceur tiers (ADR 0063 §6) : chaque lien d'un e-mail
// vers NOTRE domaine passe par /c/<envoi>?to=<chemin>, qui note le clic puis
// redirige. Les liens sortants (WhatsApp, Google…) ne sont pas touchés.
// Pur : testable, et partagé par l'expéditeur et la route de redirection.

import type { RenderedEmail } from "./email-templates/kit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSendId(value: string): boolean {
  return UUID_RE.test(value);
}

// Chemin de destination sûr : relatif à notre domaine, jamais une URL
// externe déguisée (« //evil.com », « /\evil.com ») — sinon /c/ devient une
// redirection ouverte, l'outil préféré de l'hameçonnage.
export function safeRedirectPath(to: string | null | undefined): string | null {
  if (!to) return null;
  if (!to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(to)) return null;
  return to;
}

export function trackedUrl(appUrl: string, sendId: string, path: string): string {
  return `${appUrl}/c/${sendId}?to=${encodeURIComponent(path)}`;
}

// Le lien d'arrêt n'est pas un clic d'intérêt : il ne passe pas par /c.
function isUntracked(path: string): boolean {
  return path.startsWith("/e/");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Réécrit les liens absolus vers `appUrl` du HTML (attributs href, où `&`
// est encodé `&amp;`) et de la version texte. Ne touche ni aux images ni aux
// liens d'un autre domaine.
export function trackLinks(content: RenderedEmail, appUrl: string, sendId: string): RenderedEmail {
  const base = appUrl.replace(/\/+$/, "");
  const hrefRe = new RegExp(`href="${escapeRe(base)}(/[^"]*)"`, "g");
  const html = content.html.replace(hrefRe, (match, path: string) => {
    if (isUntracked(path)) return match;
    const decoded = path.replace(/&amp;/g, "&");
    return `href="${trackedUrl(base, sendId, decoded).replace(/&/g, "&amp;")}"`;
  });
  const textRe = new RegExp(`${escapeRe(base)}(/[^\\s)]*)`, "g");
  const text = content.text.replace(textRe, (match, path: string) => (isUntracked(path) ? match : trackedUrl(base, sendId, path)));
  return { ...content, html, text };
}

// Les scanners de sécurité des messageries (Outlook, antivirus) ouvrent les
// liens avant le destinataire. On ne compte pas ce qui se déclare robot.
export function looksLikeBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawler|spider|preview|scanner|slurp|facebookexternalhit|whatsapp|curl|wget|python|headless/i.test(userAgent);
}
