// ============================================================
// D'où vient une arrivée sur la vitrine ? (ADR 0093) — pur, testé.
//
// Constat du 2026-11-09 sur 30 jours : 3 671 arrivées anonymes « direct » (sans utm) contre
// 1 963 par QR — 65 % des arrivées anonymes sans origine. Ce « direct » mélange des choses très
// différentes : aperçus de lien générés par des robots (WhatsApp, Slack, moteurs), réseaux sociaux,
// recherche, vieux QR sans utm, saisie directe. Sans les séparer, on ne sait pas d'où vient
// l'arrivage.
//
// Vie privée (ADR 0037) : on ne garde JAMAIS l'en-tête brut. Le « referer » et le « user-agent »
// sont lus, classés dans une liste CLOSE, puis jetés. Rien d'individuel n'est stocké.
// ============================================================

export const ARRIVAL_SOURCES = [
  "qr_code",      // QR imprimé (utm_source=qr_code) — inchangé
  "direct",       // aucun utm ni origine lisible : saisie, favori, application, QR ancien sans utm
  "apercu_lien",  // robot : aperçu de lien (WhatsApp, Slack, réseaux…), moteur ou outil d'audit
  "reseau_social",
  "recherche",
  "autre_site",
  "boosteats",    // renvoyé depuis notre propre site
  "utm_autre",    // un utm_source que nous n'avons pas prévu (campagne, flyer…)
] as const;
export type ArrivalSource = (typeof ARRIVAL_SOURCES)[number];

export function isArrivalSource(v: unknown): v is ArrivalSource {
  return typeof v === "string" && (ARRIVAL_SOURCES as readonly string[]).includes(v);
}

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|pinterest|embedly|quora|vkshare|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|go-http-client|okhttp\/|axios|node-fetch/i;

const SOCIAL = /(^|\.)(facebook|instagram|fb|l\.facebook|lm\.facebook|m\.facebook|tiktok|snapchat|twitter|x|t|linkedin|lnkd|pinterest|reddit|threads|whatsapp|wa|telegram|t\.me)\.(com|me|co|in|it|net)$/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|qwant|startpage|brave)\.[a-z.]+$/i;

function hostOf(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classe une arrivée. Priorité : utm connu > robot > origine (referer) > direct.
 * `ownHosts` : nos propres domaines (un clic interne n'est pas une arrivée extérieure).
 */
export function classifyArrival(input: {
  utmSource?: string | null;
  referer?: string | null;
  userAgent?: string | null;
  ownHosts?: readonly string[];
}): ArrivalSource {
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  if (utm === "qr_code") return "qr_code";
  if (input.userAgent && BOT_UA.test(input.userAgent)) return "apercu_lien";
  if (utm) return "utm_autre";
  const host = hostOf(input.referer);
  if (!host) return "direct";
  if ((input.ownHosts ?? []).some((h) => host === h || host.endsWith(`.${h}`))) return "boosteats";
  if (SOCIAL.test(host)) return "reseau_social";
  if (SEARCH.test(host)) return "recherche";
  return "autre_site";
}

export const ARRIVAL_LABELS: Record<string, string> = {
  qr_code: "QR imprimé",
  direct: "sans origine",
  apercu_lien: "aperçus de lien / robots",
  reseau_social: "réseaux sociaux",
  recherche: "recherche",
  autre_site: "autre site",
  boosteats: "notre site",
  utm_autre: "autre campagne (utm)",
};
