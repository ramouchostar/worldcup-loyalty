// ADR 0069 §2 — lancer un audit depuis un lien Google Maps collé tel quel.
//
// Liens rencontrés :
//   https://www.google.com/maps/place/Nom/@50.8,4.3,17z/data=!4m6!3m5!1s0x47c3…:0x1d2f…   → CID
//   https://maps.google.com/?cid=2101937459120000000                                       → CID
//   https://maps.app.goo.gl/AbC… (partage appli Maps)             → redirige vers /maps/place/…
//   https://share.google/AbC… (partage Google)                     → redirige vers /search?q=Nom&kgmid=…
// Le CID (identifiant Google Maps) est la cible la plus sûre pour DataForSEO ;
// à défaut, le nom lu dans le lien (`q=`).
//
// La résolution suit les redirections À LA MAIN et seulement vers des hôtes
// Google (garde anti-SSRF : on ne fait jamais suivre une URL arbitraire au serveur).

export type MapsTarget = { cid: string; name: string | null } | { cid: null; name: string };

const ALLOWED_HOSTS = /^(www\.)?(google\.(com|be|fr|nl|lu|de|co\.uk)|maps\.google\.(com|be|fr|nl|lu|de|co\.uk)|maps\.app\.goo\.gl|goo\.gl|share\.google|consent\.google\.com)$/i;
const MAX_HOPS = 6;

export function isAllowedMapsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** « 0x47c3dd20ef3fd815:0xdfe9727ecf5ecd1 » → CID décimal (la deuxième moitié). */
export function cidFromFeatureId(featureId: string): string | null {
  const m = featureId.match(/0x[0-9a-f]+:(0x[0-9a-f]+)/i);
  if (!m) return null;
  try {
    return BigInt(m[1]).toString(10);
  } catch {
    return null;
  }
}

/** Lit un lien sans le suivre. null = rien d'exploitable dans ce lien-là. */
export function parseMapsUrl(raw: string): MapsTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  // Page de consentement : la vraie destination est dans `continue`.
  const next = u.searchParams.get("continue");
  if (u.hostname.startsWith("consent.") && next) return parseMapsUrl(next);

  const decoded = decodeURIComponent(u.pathname + u.search);
  const placeName = u.pathname.match(/\/maps\/place\/([^/@]+)/)?.[1];
  const name = placeName ? decodeURIComponent(placeName.replace(/\+/g, " ")) : u.searchParams.get("q");

  const cidParam = u.searchParams.get("cid") ?? u.searchParams.get("ludocid");
  if (cidParam && /^\d+$/.test(cidParam)) return { cid: cidParam, name };

  const fromFeature = decoded.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ?? decoded.match(/(0x[0-9a-f]{6,}:0x[0-9a-f]{6,})/i)?.[1];
  if (fromFeature) {
    const cid = cidFromFeatureId(fromFeature);
    if (cid) return { cid, name };
  }
  // /search?q=Nom (share.google) ou /maps/search/Nom : seulement le nom.
  const searchName = name ?? u.pathname.match(/\/maps\/search\/([^/@]+)/)?.[1]?.replace(/\+/g, " ");
  if (searchName && /\/(search|maps)/.test(u.pathname)) return { cid: null, name: decodeURIComponent(searchName) };
  return null;
}

// Cookie de consentement Google (sinon redirection vers consent.google.com).
const CONSENT_COOKIE = "SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmZyIAEaBgiA_LyaBg";

/**
 * Un lien share.google ne donne que le nom et un `kgmid` (identifiant Knowledge
 * Graph). Le nom seul est ambigu : « Krusty Smash Burgers » a plusieurs
 * adresses à Bruxelles et la recherche par nom a trouvé la mauvaise
 * (constaté le 2026-09-24). La recherche Maps par kgmid renvoie l'identifiant
 * de la bonne fiche, d'où le CID exact.
 */
export async function cidFromKgmid(kgmid: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!/^\/[gm]\/[0-9a-z_]+$/i.test(kgmid)) return null;
  try {
    const res = await fetcher(`https://www.google.com/search?tbm=map&hl=fr&gl=be&kgmid=${encodeURIComponent(kgmid)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36", Cookie: CONSENT_COOKIE },
    });
    const body = await res.text();
    const feature = body.match(/0x[0-9a-f]{6,}:0x[0-9a-f]{6,}/i)?.[0];
    return feature ? cidFromFeatureId(feature) : null;
  } catch {
    return null;
  }
}

export type ResolveResult = { ok: true; target: MapsTarget; hops: string[] } | { ok: false; error: string; hops: string[] };

export async function resolveMapsLink(raw: string, fetcher: typeof fetch = fetch): Promise<ResolveResult> {
  const hops: string[] = [];
  let url = raw.trim();
  // Le meilleur nom vu en chemin : share.google finit souvent sur une page de
  // consentement qui ne dit plus rien, après être passé par /search?q=Nom.
  let best: MapsTarget | null = null;
  const done = (error: string): ResolveResult => (best ? { ok: true, target: best, hops } : { ok: false, error, hops });

  for (let i = 0; i <= MAX_HOPS; i++) {
    if (!isAllowedMapsUrl(url)) return i === 0 ? { ok: false, error: "Ce n'est pas un lien Google Maps.", hops } : done("Le lien mène hors de Google.");
    hops.push(url);
    const parsed = parseMapsUrl(url);
    if (parsed?.cid) return { ok: true, target: parsed, hops };
    if (parsed) best = parsed;
    const kgmid = new URL(url).searchParams.get("kgmid");
    if (kgmid) {
      const cid = await cidFromKgmid(kgmid, fetcher);
      if (cid) return { ok: true, target: { cid, name: parsed?.name ?? null }, hops };
    }
    if (new URL(url).hostname.startsWith("consent.")) return done("Aucun établissement lisible dans ce lien.");
    let res: Response;
    try {
      res = await fetcher(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Boosteats audit)" } });
    } catch {
      return done("Lien injoignable.");
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    return done("Aucun établissement lisible dans ce lien.");
  }
  return done("Trop de redirections.");
}
