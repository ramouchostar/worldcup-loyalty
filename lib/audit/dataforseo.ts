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
const LOCATION = "Brussels,Brussels,Belgium";

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

export async function fetchBusinessInfo(target: Target): Promise<{ info: BusinessInfo | null; cost: number }> {
  const task = await call<{ items: BusinessInfo[] | null }>("business_data/google/my_business_info/live", [
    { ...targetParams(target), location_name: LOCATION, language_code: "fr" },
  ]);
  if (task.status_code !== 20000) throw new DataForSeoError(task.status_message, task.status_code);
  return { info: task.result?.[0]?.items?.[0] ?? null, cost: task.cost ?? 0 };
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
export async function postReviewsTask(target: Target, depth = 500): Promise<string> {
  const task = await call<unknown>("business_data/google/reviews/task_post", [
    { ...targetParams(target), location_name: LOCATION, language_code: "fr", depth, sort_by: "newest", priority: 2 },
  ]);
  // 20100 = tâche créée.
  if (task.status_code !== 20100) throw new DataForSeoError(task.status_message, task.status_code);
  return task.id;
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
