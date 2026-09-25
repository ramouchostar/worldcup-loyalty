// ADR 0069 — le volet SEO : le site du restaurant et sa place dans Google.
// Demande du porteur (2026-09-25) : « chercher le site web du resto, voir
// comment on est positionné, voir le score SEO ».
//
// Trois mesures, chacune pouvant échouer seule (motif conservé) :
//  1. le site lui-même, lu par nous (titre, description, balisage Restaurant,
//     mobile, cohérence adresse / téléphone avec la fiche, carte, commande) ;
//  2. la vitesse mobile, par l'API PageSpeed Insights de Google (gratuite) ;
//  3. le rang du site dans Google pour « spécialité + commune » (DataForSEO,
//     ≈ 0,002 $).
// La grille Google Maps vit dans le volet Concurrents.

import { organicSearch } from "./dataforseo";
import type { SeoGap } from "./signals";

export type SeoStatus = "ok" | "partiel" | "manquant" | "non_verifie";

export interface SeoCheck {
  key: string;
  label: string;
  points: number;
  status: SeoStatus;
  detail?: string;
}

export interface SiteFacts {
  url: string;
  finalUrl: string | null;
  https: boolean;
  status: number | null;
  title: string | null;
  description: string | null;
  h1: string | null;
  viewport: boolean;
  lang: string | null;
  noindex: boolean;
  schemaTypes: string[];
  schemaHasAddress: boolean;
  schemaHasHours: boolean;
  phoneOnPage: boolean;
  postalOnPage: boolean;
  menuLink: boolean;
  menuIsPdf: boolean;
  orderLinks: { direct: boolean; platforms: string[] };
  imagesWithoutAlt: number;
  images: number;
  bytes: number;
}

const PLATFORMS: [RegExp, string][] = [
  [/ubereats\.com/i, "Uber Eats"],
  [/deliveroo\./i, "Deliveroo"],
  [/takeaway\.com|just-eat/i, "Takeaway.com"],
];

const text = (s: string | undefined | null) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;
const digits = (s: string) => s.replace(/\D/g, "");

/** Lit le HTML d'une page d'accueil (fonction pure, testée sur des extraits). */
export function readSite(html: string, url: string, finalUrl: string | null, status: number | null, fiche: { phone: string | null; postalCode: string | null }): SiteFacts {
  const head = html.slice(0, 200_000);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (n: string) => {
    const m = metas.find((t) => (attr(t, "name") ?? attr(t, "property") ?? "").toLowerCase() === n);
    return m ? attr(m, "content") : null;
  };
  const schemaBlocks = [...head.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = new Set<string>();
  let hasAddress = false;
  let hasHours = false;
  for (const b of schemaBlocks) {
    try {
      const walk = (x: unknown) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(walk);
        const o = x as Record<string, unknown>;
        const t = o["@type"];
        for (const v of Array.isArray(t) ? t : [t]) if (typeof v === "string") types.add(v);
        if (o.address) hasAddress = true;
        if (o.openingHours || o.openingHoursSpecification) hasHours = true;
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(b));
    } catch {
      /* balisage invalide : ignoré, compté comme absent */
    }
  }
  const links = [...head.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], label: text(m[2]).toLowerCase() }));
  const menu = links.find((l) => /menu|carte/.test(l.label) || /menu|carte/i.test(l.href));
  const platforms = [...new Set(links.flatMap((l) => PLATFORMS.filter(([re]) => re.test(l.href)).map(([, n]) => n)))];
  const direct = links.some((l) => /command|order|livraison|emporter|click/.test(l.label) && !PLATFORMS.some(([re]) => re.test(l.href)));
  const imgs = head.match(/<img\b[^>]*>/gi) ?? [];
  const bodyText = text(head.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
  const phone = fiche.phone ? digits(fiche.phone).replace(/^0/, "") : null;
  return {
    url,
    finalUrl,
    https: (finalUrl ?? url).startsWith("https://"),
    status,
    title: text(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || null,
    description: meta("description") || meta("og:description"),
    h1: text(head.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || null,
    viewport: !!meta("viewport"),
    lang: head.match(/<html[^>]*\slang\s*=\s*["']([^"']+)["']/i)?.[1] ?? null,
    noindex: /noindex/i.test(meta("robots") ?? ""),
    schemaTypes: [...types],
    schemaHasAddress: hasAddress,
    schemaHasHours: hasHours,
    phoneOnPage: !!phone && phone.length >= 8 && digits(bodyText).includes(phone.slice(-8)),
    postalOnPage: !!fiche.postalCode && bodyText.includes(fiche.postalCode),
    menuLink: !!menu,
    menuIsPdf: !!menu && /\.pdf(\?|$)/i.test(menu.href),
    orderLinks: { direct, platforms },
    imagesWithoutAlt: imgs.filter((t) => !attr(t, "alt")).length,
    images: imgs.length,
    bytes: html.length,
  };
}

const RESTAURANT_TYPES = /Restaurant|FoodEstablishment|LocalBusiness|FastFoodRestaurant/i;

export function scoreSite(site: SiteFacts | null, speed: number | null, organic: { rank: number | null; keyword: string } | null, ctx: { keyword: string; commune: string | null }): { score: number | null; checks: SeoCheck[] } {
  const c: SeoCheck[] = [];
  const kw = ctx.keyword.toLowerCase();
  const town = ctx.commune?.toLowerCase() ?? null;
  if (!site) {
    c.push({ key: "site", label: "Site web", points: 20, status: "manquant", detail: "Pas de site : Google n'a rien d'autre que la fiche pour vous classer" });
  } else {
    const t = site.title?.toLowerCase() ?? "";
    c.push({ key: "https", label: "Site sécurisé (https)", points: 5, status: site.https ? "ok" : "manquant" });
    c.push({
      key: "titre", label: "Titre de la page", points: 10,
      status: !site.title ? "manquant" : t.includes(kw) || (town && t.includes(town)) ? (site.title.length <= 65 ? "ok" : "partiel") : "partiel",
      detail: site.title ? `« ${site.title.slice(0, 90)} »` : undefined,
    });
    c.push({
      key: "description", label: "Description pour Google", points: 8,
      status: !site.description ? "manquant" : site.description.length >= 70 && site.description.length <= 170 ? "ok" : "partiel",
      detail: site.description ? `${site.description.length} caractères` : undefined,
    });
    c.push({ key: "h1", label: "Titre principal (H1)", points: 4, status: site.h1 ? "ok" : "manquant", detail: site.h1 ? `« ${site.h1.slice(0, 60)} »` : undefined });
    c.push({ key: "mobile", label: "Adapté au mobile", points: 8, status: site.viewport ? "ok" : "manquant" });
    const isRestaurant = site.schemaTypes.some((x) => RESTAURANT_TYPES.test(x));
    c.push({
      key: "schema", label: "Balisage « Restaurant » pour Google", points: 12,
      status: isRestaurant && site.schemaHasAddress ? (site.schemaHasHours ? "ok" : "partiel") : "manquant",
      detail: site.schemaTypes.length ? site.schemaTypes.join(", ") : "aucun",
    });
    c.push({
      key: "nap", label: "Même adresse et téléphone que la fiche", points: 10,
      status: site.phoneOnPage && site.postalOnPage ? "ok" : site.phoneOnPage || site.postalOnPage ? "partiel" : "manquant",
    });
    c.push({ key: "menu", label: "Carte lisible sur le site", points: 5, status: site.menuLink ? (site.menuIsPdf ? "partiel" : "ok") : "manquant", detail: site.menuIsPdf ? "en PDF : Google la lit mal" : undefined });
    c.push({
      key: "commande", label: "Commande directe depuis le site", points: 6,
      status: site.orderLinks.direct ? "ok" : site.orderLinks.platforms.length ? "partiel" : "manquant",
      detail: site.orderLinks.platforms.length ? `renvoie vers ${site.orderLinks.platforms.join(", ")}` : undefined,
    });
    if (site.noindex) c.push({ key: "noindex", label: "Site visible par Google", points: 10, status: "manquant", detail: "la page demande à Google de ne pas l'indexer" });
  }
  c.push({
    key: "vitesse", label: "Vitesse sur mobile", points: 12,
    status: speed == null ? "non_verifie" : speed >= 0.9 ? "ok" : speed >= 0.5 ? "partiel" : "manquant",
    detail: speed != null ? `${Math.round(speed * 100)}/100 selon Google PageSpeed` : undefined,
  });
  c.push({
    key: "google", label: `Rang dans Google pour « ${organic?.keyword ?? ctx.keyword} »`, points: 20,
    status: !organic ? "non_verifie" : organic.rank == null ? "manquant" : organic.rank <= 3 ? "ok" : organic.rank <= 10 ? "partiel" : "manquant",
    detail: organic ? (organic.rank == null ? "hors des 20 premiers" : `${organic.rank}e`) : undefined,
  });
  const verified = c.filter((x) => x.status !== "non_verifie");
  const max = verified.reduce((a, x) => a + x.points, 0);
  const W = { ok: 1, partiel: 0.5, manquant: 0, non_verifie: 0 } as const;
  return { score: max ? Math.round((verified.reduce((a, x) => a + x.points * W[x.status], 0) / max) * 100) : null, checks: c };
}

export async function fetchSite(url: string, fiche: { phone: string | null; postalCode: string | null }): Promise<SiteFacts> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; BoosteatsAudit/1.0)", "Accept-Language": "fr-BE,fr" } });
    const html = await res.text();
    return readSite(html, url, res.url, res.status, fiche);
  } finally {
    clearTimeout(t);
  }
}

/** Score de performance mobile (0 à 1) par l'API PageSpeed Insights, ou le motif de l'échec. */
export async function mobileSpeed(url: string): Promise<{ score: number | null; error: string | null }> {
  const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance${key}`, { signal: ctrl.signal });
    // Sans clé, Google limite très vite (429, constaté le 2026-09-25) : PAGESPEED_API_KEY (gratuite).
    if (res.status === 429) return { score: null, error: key ? "quota PageSpeed atteint" : "clé PAGESPEED_API_KEY absente (quota Google sans clé dépassé)" };
    if (!res.ok) return { score: null, error: `PageSpeed ${res.status}` };
    const j = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number | null } } } };
    return { score: j.lighthouseResult?.categories?.performance?.score ?? null, error: null };
  } catch (e) {
    return { score: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

const GAP_OF: Record<string, SeoGap> = {
  site: "seo_pas_de_site",
  titre: "seo_titre",
  description: "seo_description",
  schema: "seo_schema",
  nap: "seo_nap",
  mobile: "seo_mobile",
  vitesse: "seo_vitesse",
  google: "seo_rang_google",
  commande: "seo_commande_plateformes",
  menu: "seo_menu",
};

/** Manques SEO pour le moteur de scénarios (seulement ce qui a été vérifié). */
export function seoGaps(checks: SeoCheck[]): SeoGap[] {
  return checks.filter((c) => (c.status === "manquant" || c.status === "partiel") && GAP_OF[c.key]).map((c) => GAP_OF[c.key]);
}

const PLATFORM_DOMAINS = /ubereats\.com|deliveroo\.|takeaway\.com|just-eat/i;

/** Une plateforme de livraison apparaît avant le site dans Google (ou le site n'y est pas). */
export function platformsOutrank(organic: SeoResult["organic"]): boolean | null {
  if (!organic) return null;
  const firstPlatform = organic.top.find((t) => PLATFORM_DOMAINS.test(t.domain));
  if (!firstPlatform) return false;
  return organic.rank == null || firstPlatform.rank < organic.rank;
}

export interface SeoResult {
  site: SiteFacts | null;
  siteError: string | null;
  speed: number | null;
  speedError: string | null;
  organic: { keyword: string; rank: number | null; top: { rank: number; title: string; domain: string }[] } | null;
  organicError: string | null;
  score: number | null;
  checks: SeoCheck[];
}

const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export async function measureSeo(input: { url: string | null; phone: string | null; postalCode: string | null; keyword: string; commune: string | null; calls: Record<string, number> }): Promise<{ result: SeoResult; cost: number }> {
  let site: SiteFacts | null = null;
  let siteError: string | null = null;
  const isSocial = !!input.url && /facebook\.com|instagram\.com|linktr\.ee/i.test(input.url);
  const url = input.url && !isSocial ? input.url : null;
  const query = `${input.keyword} ${input.commune ?? "Bruxelles"}`;
  const [siteRes, speedRes, organicRes] = await Promise.allSettled([
    url ? fetchSite(url, { phone: input.phone, postalCode: input.postalCode }) : Promise.reject(new Error(isSocial ? "Le « site » de la fiche est une page de réseau social." : "Pas de site sur la fiche Google.")),
    url ? mobileSpeed(url) : Promise.resolve({ score: null, error: "pas de site" }),
    organicSearch(query),
  ]);
  if (siteRes.status === "fulfilled") site = siteRes.value;
  else siteError = siteRes.reason instanceof Error ? siteRes.reason.message : String(siteRes.reason);
  const speed = speedRes.status === "fulfilled" ? speedRes.value.score : null;
  const speedError = speedRes.status === "fulfilled" ? speedRes.value.error : String(speedRes.reason);
  let organic: SeoResult["organic"] = null;
  let organicError: string | null = null;
  let cost = 0;
  if (organicRes.status === "fulfilled") {
    input.calls.dataforseo = (input.calls.dataforseo ?? 0) + 1;
    cost += organicRes.value.cost;
    const ours = url ? domainOf(url) : null;
    const hit = ours ? organicRes.value.items.find((i) => domainOf(i.url) === ours) : null;
    organic = { keyword: query, rank: hit?.rank ?? null, top: organicRes.value.items.slice(0, 5).map((i) => ({ rank: i.rank, title: i.title, domain: domainOf(i.url) ?? i.url })) };
  } else organicError = organicRes.reason instanceof Error ? organicRes.reason.message : String(organicRes.reason);
  const { score, checks } = scoreSite(site, speed, organic, { keyword: input.keyword, commune: input.commune });
  const speedCheck = checks.find((c) => c.key === "vitesse");
  if (speedCheck && speed == null && speedError) speedCheck.detail = speedError;
  return { result: { site, siteError, speed, speedError, organic, organicError, score, checks }, cost };
}
