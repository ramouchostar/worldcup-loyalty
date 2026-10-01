// D'où vient un restaurateur qui s'inscrit (rapport d'audit, landing, lien
// envoyé à la main…). Les paramètres UTM du premier lien sont capturés par le
// middleware dans un cookie (30 jours) : ils survivent à l'inscription, au
// lien de confirmation ouvert plus tard et à la connexion Google, puis sont
// écrits sur l'établissement à sa création (`restaurants.signup_attribution`).
// Jamais envoyé à Google : c'est une ligne en base, lue sur /platform.

export const PARTNER_ATTRIBUTION_COOKIE = "partner_attribution";
export const PARTNER_ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "source"] as const;
type Key = (typeof KEYS)[number];

export type PartnerAttribution = Partial<Record<Key, string>> & { landing?: string; at?: string };

const SAFE = /^[\w.\-~:@ ]{1,80}$/;

/** Les paramètres d'attribution d'une URL, ou null s'il n'y en a aucun. */
export function readAttribution(params: URLSearchParams, landing: string, now: Date): PartnerAttribution | null {
  const out: PartnerAttribution = {};
  for (const k of KEYS) {
    const v = params.get(k)?.trim();
    if (v && SAFE.test(v)) out[k] = v;
  }
  // Ancien lien du rapport d'audit : `?source=audit` sans UTM.
  if (!out.utm_source && out.source) out.utm_source = out.source;
  if (!out.utm_source) return null;
  out.landing = landing.slice(0, 120);
  out.at = now.toISOString();
  return out;
}

export function encodeAttribution(a: PartnerAttribution): string {
  return encodeURIComponent(JSON.stringify(a));
}

export function decodeAttribution(raw: string | undefined): PartnerAttribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const out: PartnerAttribution = {};
    for (const k of [...KEYS, "landing", "at"] as const) {
      const v = parsed[k];
      if (typeof v === "string" && v.length <= 120) out[k] = v;
    }
    return out.utm_source ? out : null;
  } catch {
    return null;
  }
}

/** Le lien « Démarrer » d'un rapport d'audit : chaque rapport est identifiable. */
export function auditSignupHref(auditId: string): string {
  const q = new URLSearchParams({
    utm_source: "audit",
    utm_medium: "rapport",
    utm_campaign: "audit_restaurant",
    utm_content: auditId,
  });
  return `/become-a-partner?${q.toString()}`;
}
