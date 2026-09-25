// ADR 0069 — client DataForSEO (Business Data, Google). SERVEUR UNIQUEMENT.
//
// Deux appels : la fiche complète (`my_business_info/live`, ≈ 0,003 $) et les
// avis datés (`reviews/task_post` puis `task_get`, file prioritaire ≈ 1 min,
// ≈ 0,0015 $ par tranche de 10 avis). Identifiants en Basic Auth
// (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD) ; sans eux, `isConfigured()` est
// faux et le volet passe en « non branché » — jamais une erreur silencieuse.
//
// Les avis sont réduits AVANT stockage : ni nom, ni profil, ni photo d'auteur
// (ADR 0025). On garde la note, le texte, la date et la réponse du propriétaire.

const BASE = "https://api.dataforseo.com/v3";
// Code DataForSEO de la Région de Bruxelles-Capitale (« Brussels,Belgium », Province).
// PAS « Brussels,Brussels,Belgium » (1001004) : c'est la seule ville de Bruxelles —
// une fiche à Koekelberg ou Ixelles y renvoie « No Search Results » (vérifié le 2026-09-24).
const LOCATION_CODE = 20052;

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
  }
}

export function isConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
}

type Task<T> = { id: string; status_code: number; status_message: string; cost: number; result: T[] | null };
type Envelope<T> = { status_code: number; status_message: string; tasks: Task<T>[] | null };

async function call<T>(path: string, body?: unknown): Promise<Task<T>> {
  const res = await fetch(`${BASE}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as Envelope<T>;
  // 20000 = OK. Les erreurs de compte (40104 non vérifié, 40200 solde…) arrivent au niveau enveloppe.
  if (json.status_code !== 20000) throw new DataForSeoError(json.status_message, json.status_code);
  const task = json.tasks?.[0];
  if (!task) throw new DataForSeoError("Réponse DataForSEO sans tâche.", null);
  return task;
}

/** Cible d'une requête : le CID Google est le plus sûr, le nom + ville en repli. */
export type Target = { cid: string } | { placeId: string } | { keyword: string };

function targetParams(t: Target): Record<string, string> {
  if ("cid" in t) return { keyword: `cid:${t.cid}` };
  if ("placeId" in t) return { keyword: `place_id:${t.placeId}` };
  return { keyword: t.keyword };
}

export interface BusinessInfo {
  title: string | null;
  description: string | null;
  category: string | null;
  additional_categories: string[] | null;
  cid: string | null;
  place_id: string | null;
  address: string | null;
  address_info: { postal_code?: string | null; city?: string | null } | null;
  phone: string | null;
  url: string | null;
  domain: string | null;
  total_photos: number | null;
  is_claimed: boolean | null;
  price_level: string | null;
  rating: { value: number | null; votes_count: number | null } | null;
  rating_distribution: Record<string, number> | null;
  place_topics: Record<string, number> | null;
  attributes: { available_attributes?: Record<string, string[]> | null; unavailable_attributes?: Record<string, string[]> | null } | null;
  work_time: { work_hours?: { timetable?: Record<string, unknown> | null } | null } | null;
  local_business_links: { type: string; url: string }[] | null;
  latitude: number | null;
  longitude: number | null;
  last_updated_time: string | null;
}

// 40102 = « No Search Results » : pas une panne, juste aucune fiche pour ce libellé.
const NO_RESULTS = 40102;
const MAX_KEYWORD_TRIES = 3;

/**
 * Libellés à essayer, du plus précis au plus court. Constaté le 2026-09-24 :
 * « Krusty Smash Burgers » → aucun résultat, « Krusty » → la bonne fiche.
 * Les noms de ville ajoutés au libellé gênent la recherche : la zone est déjà
 * fixée par LOCATION_CODE.
 */
export function keywordVariants(keyword: string): string[] {
  const clean = keyword.replace(/\b(bruxelles|brussels|brussel)\b/gi, " ").replace(/\s+/g, " ").trim() || keyword.trim();
  const words = clean.split(" ");
  const out = [clean];
  for (let n = words.length - 1; n >= 1 && out.length < MAX_KEYWORD_TRIES; n--) out.push(words.slice(0, n).join(" "));
  return [...new Set(out)];
}

export async function fetchBusinessInfo(target: Target): Promise<{ info: BusinessInfo | null; cost: number; tries: number; approximate: string | null }> {
  const attempts = "keyword" in target ? keywordVariants(target.keyword).map((keyword) => ({ keyword })) : [target];
  let cost = 0;
  let tries = 0;
  for (const t of attempts) {
    tries += 1;
    const task = await call<{ items: BusinessInfo[] | null }>("business_data/google/my_business_info/live", [
      { ...targetParams(t), location_code: LOCATION_CODE, language_code: "fr" },
    ]);
    cost += task.cost ?? 0;
    if (task.status_code === NO_RESULTS) continue;
    if (task.status_code !== 20000) throw new DataForSeoError(task.status_message, task.status_code);
    const info = task.result?.[0]?.items?.[0] ?? null;
    // Libellé raccourci : la fiche trouvée peut être une homonyme — on le dit.
    if (info) return { info, cost, tries, approximate: tries > 1 && "keyword" in t ? t.keyword : null };
  }
  return { info: null, cost, tries, approximate: null };
}

/** Un avis tel qu'on le garde : sans rien qui identifie son auteur. */
export interface StoredReview {
  rating: number | null;
  text: string | null;
  /** ISO 8601. */
  date: string | null;
  ownerAnswer: string | null;
  ownerAnswerDate: string | null;
}

type RawReview = {
  rating?: { value?: number | null } | null;
  review_text?: string | null;
  original_review_text?: string | null;
  timestamp?: string | null;
  owner_answer?: string | null;
  owner_timestamp?: string | null;
};

// "2025-03-14 18:22:10 +00:00" → ISO.
function isoDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts.replace(" ", "T").replace(" ", ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toStoredReview(r: RawReview): StoredReview {
  return {
    rating: r.rating?.value ?? null,
    text: r.review_text ?? r.original_review_text ?? null,
    date: isoDate(r.timestamp),
    ownerAnswer: r.owner_answer ?? null,
    ownerAnswerDate: isoDate(r.owner_timestamp),
  };
}

/** Pose la tâche des avis ; renvoie son identifiant à relire avec `getReviews`. */
export async function postReviewsTask(target: Target, depth = 500): Promise<{ id: string; cost: number }> {
  const task = await call<unknown>("business_data/google/reviews/task_post", [
    { ...targetParams(target), location_code: LOCATION_CODE, language_code: "fr", depth, sort_by: "newest", priority: 2 },
  ]);
  // 20100 = tâche créée.
  if (task.status_code !== 20100) throw new DataForSeoError(task.status_message, task.status_code);
  // Le coût des avis est facturé à la pose de la tâche, pas à sa lecture.
  return { id: task.id, cost: task.cost ?? 0 };
}

export type ReviewsResult =
  | { ready: false }
  | { ready: true; reviews: StoredReview[]; total: number | null; cost: number };

export async function getReviews(taskId: string): Promise<ReviewsResult> {
  const task = await call<{ reviews_count: number | null; items: RawReview[] | null }>(
    `business_data/google/reviews/task_get/${taskId}`,
  );
  // 40601 / 40602 = tâche en file / en cours : on repassera.
  if (task.status_code === 40601 || task.status_code === 40602) return { ready: false };
  if (task.status_code !== 20000) throw new DataForSeoError(task.status_message, task.status_code);
  const r = task.result?.[0];
  return {
    ready: true,
    reviews: (r?.items ?? []).map(toStoredReview),
    total: r?.reviews_count ?? null,
    cost: task.cost ?? 0,
  };
}

/** Résultats Google classiques (hors carte) pour une recherche faite depuis Bruxelles. */
export async function organicSearch(keyword: string, depth = 20): Promise<{ items: { rank: number; url: string; title: string }[]; cost: number }> {
  const task = await call<{ items: { type?: string; rank_group?: number; url?: string; title?: string }[] | null }>("serp/google/organic/live/regular", [
    { keyword, location_code: LOCATION_CODE, language_code: "fr", depth },
  ]);
  if (task.status_code === NO_RESULTS) return { items: [], cost: task.cost ?? 0 };
  if (task.status_code !== 20000) throw new DataForSeoError(task.status_message, task.status_code);
  const items = (task.result?.[0]?.items ?? [])
    .filter((i) => i.type === "organic" && i.url)
    .map((i) => ({ rank: i.rank_group ?? 0, url: i.url!, title: i.title ?? "" }));
  return { items, cost: task.cost ?? 0 };
}

/** Un établissement tel que Google Maps le classe pour une recherche, à un endroit. */
export interface MapsResult {
  rank: number;
  cid: string | null;
  title: string;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  totalPhotos: number | null;
  isClaimed: boolean | null;
  hasWebsite: boolean;
  hasOrderButton: boolean;
  priceLevel: string | null;
}

type RawMapsItem = {
  rank_group?: number;
  cid?: string | null;
  title?: string;
  category?: string | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  total_photos?: number | null;
  is_claimed?: boolean | null;
  url?: string | null;
  book_online_url?: string | null;
  price_level?: string | null;
};

/**
 * Recherche Google Maps « comme un client posté à ces coordonnées »
 * (serp/google/maps/live/advanced, ≈ 0,002 $ — vérifié le 2026-09-25). Sert au
 * volet Concurrents et à la grille de positionnement local.
 */
export async function mapsSearch(keyword: string, lat: number, lng: number, zoom = 15, depth = 20): Promise<{ items: MapsResult[]; cost: number }> {
  const task = await call<{ items: RawMapsItem[] | null }>("serp/google/maps/live/advanced", [
    { keyword, location_coordinate: `${lat},${lng},${zoom}z`, language_code: "fr", depth },
  ]);
  if (task.status_code === NO_RESULTS) return { items: [], cost: task.cost ?? 0 };
  if (task.status_code !== 20000) throw new DataForSeoError(task.status_message, task.status_code);
  const items = (task.result?.[0]?.items ?? []).map((i) => ({
    rank: i.rank_group ?? 0,
    cid: i.cid ?? null,
    title: i.title ?? "",
    category: i.category ?? null,
    rating: i.rating?.value ?? null,
    reviews: i.rating?.votes_count ?? null,
    address: i.address ?? null,
    latitude: i.latitude ?? null,
    longitude: i.longitude ?? null,
    totalPhotos: i.total_photos ?? null,
    isClaimed: i.is_claimed ?? null,
    hasWebsite: !!i.url,
    hasOrderButton: !!i.book_online_url,
    priceLevel: i.price_level ?? null,
  }));
  return { items, cost: task.cost ?? 0 };
}
