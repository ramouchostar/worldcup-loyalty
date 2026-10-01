// ADR 0075 — le brouillon d'inscription : les établissements trouvés sur Google
// et corrigés par le restaurateur AVANT qu'il ait un compte. Il ne touche pas la
// base : il vit dans le navigateur et part avec la demande de compte (métadonnées
// d'inscription). Le serveur le revalide ici, jamais cru tel quel.
// Module pur : importé par le navigateur et par le serveur.

export const DRAFT_STORAGE_KEY = "partner_draft_v1";
/** Posé au clic « Continuer » : le brouillon est fini, il peut être enregistré. */
export const DRAFT_READY_KEY = "partner_draft_ready";
export const DRAFT_MAX_ESTABLISHMENTS = 10;

/** Champs que le restaurateur peut corriger, comparés à la fiche Google. */
export const PREFILL_FIELDS = ["name", "address", "sector", "phone", "website"] as const;
type PrefillField = (typeof PREFILL_FIELDS)[number];

export type DraftEstablishment = {
  /** Identifiant de la fiche Google ; absent pour une saisie à la main. */
  placeId: string | null;
  name: string;
  address: string;
  /** Commune ou quartier (ADR 0016) — la maille de /secteurs. */
  sector: string;
  phone: string;
  website: string;
  mapsUrl: string;
  cuisine: string[];
  /** Valeurs lues sur Google, pour savoir ce que le restaurateur a corrigé. */
  google: Partial<Record<PrefillField, string>> | null;
};

export type Draft = { establishments: DraftEstablishment[] };

/** Ce que l'API de fiche renvoie au navigateur. */
export type PlacePrefill = {
  placeId: string;
  name: string;
  address: string;
  sector: string;
  phone: string;
  website: string;
  mapsUrl: string;
  cuisine: string[];
};

/**
 * Type de cuisine depuis la catégorie Google (« Restaurant de hamburgers »,
 * « Pizzeria », « Restaurant italien »). La catégorie générique
 * « Restaurant » ne dit rien : pas de type.
 */
export function cuisineFromCategory(category: string | null | undefined): string[] {
  let c = (category ?? "").trim();
  if (!c) return [];
  c = c.replace(/^restaurant\s+/i, "").replace(/^(de|du|des)\s+/i, "").replace(/^d['’]/i, "").trim();
  if (!c || /^restaurant$/i.test(c)) return [];
  return [c.charAt(0).toUpperCase() + c.slice(1)].map((x) => x.slice(0, 40));
}

/** Retire « https:// », « www. » et la barre finale : plus lisible à corriger. */
export function displayWebsite(url: string | null | undefined): string {
  return (url ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanUrl(v: unknown): string {
  const s = clean(v, 300);
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function emptyEstablishment(): DraftEstablishment {
  return { placeId: null, name: "", address: "", sector: "", phone: "", website: "", mapsUrl: "", cuisine: [], google: null };
}

export function fromPrefill(p: PlacePrefill): DraftEstablishment {
  return {
    placeId: p.placeId,
    name: p.name,
    address: p.address,
    sector: p.sector,
    phone: p.phone,
    website: displayWebsite(p.website),
    mapsUrl: p.mapsUrl,
    cuisine: p.cuisine,
    google: { name: p.name, address: p.address, sector: p.sector, phone: p.phone, website: displayWebsite(p.website) },
  };
}

/** Un établissement est enregistrable s'il a un nom et une commune. */
export function missingFields(e: DraftEstablishment): ("name" | "sector")[] {
  const out: ("name" | "sector")[] = [];
  if (clean(e.name, 120).length < 2) out.push("name");
  if (clean(e.sector, 80).length < 2) out.push("sector");
  return out;
}

/** Les champs que le restaurateur a changés par rapport à la fiche Google. */
export function correctedFields(e: DraftEstablishment): PrefillField[] {
  if (!e.google) return [];
  const norm = (v: string | undefined) => clean(v ?? "", 300).toLowerCase();
  return PREFILL_FIELDS.filter((f) => norm(e[f]) !== norm(e.google?.[f]));
}

/**
 * Revalide un brouillon venu du navigateur ou des métadonnées d'inscription :
 * champs nettoyés, établissements incomplets écartés, doublons de fiche
 * retirés, plafond appliqué. Ne lève jamais : un brouillon illisible = vide.
 */
export function sanitizeDraft(raw: unknown): Draft {
  const list = (raw as { establishments?: unknown })?.establishments;
  if (!Array.isArray(list)) return { establishments: [] };
  const seen = new Set<string>();
  const out: DraftEstablishment[] = [];
  for (const item of list) {
    if (out.length >= DRAFT_MAX_ESTABLISHMENTS) break;
    const r = (item ?? {}) as Record<string, unknown>;
    const placeId = typeof r.placeId === "string" && /^[\w-]{10,300}$/.test(r.placeId) ? r.placeId : null;
    if (placeId && seen.has(placeId)) continue;
    const g = (r.google ?? null) as Record<string, unknown> | null;
    const e: DraftEstablishment = {
      placeId,
      name: clean(r.name, 120),
      address: clean(r.address, 200),
      sector: clean(r.sector, 80),
      phone: clean(r.phone, 40),
      website: clean(r.website, 300),
      mapsUrl: cleanUrl(r.mapsUrl),
      cuisine: Array.isArray(r.cuisine)
        ? r.cuisine.map((c) => clean(c, 40)).filter(Boolean).slice(0, 5)
        : [],
      google: g && placeId
        ? Object.fromEntries(PREFILL_FIELDS.map((f) => [f, clean(g[f], 300)]))
        : null,
    };
    if (missingFields(e).length) continue;
    if (placeId) seen.add(placeId);
    out.push(e);
  }
  return { establishments: out };
}

/** Identifiant d'URL : le nom, plus la commune si deux établissements portent le même nom. */
export function slugBase(e: DraftEstablishment, all: DraftEstablishment[]): string {
  const sameName = all.filter((x) => x.name.toLowerCase() === e.name.toLowerCase()).length > 1;
  return sameName ? `${e.name} ${e.sector}` : e.name;
}

export { cleanUrl as normalizeWebsite };
