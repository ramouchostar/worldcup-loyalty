// ADR 0071 — Google Places API (New), pour l'audit gratuit public.
// SERVEUR UNIQUEMENT : la clé GOOGLE_PLACES_API_KEY ne sort jamais vers le
// navigateur (pas de NEXT_PUBLIC_). Seules les URL de photos renvoyées par
// Google (lh3.googleusercontent.com, sans clé) descendent au client.
//
// Coûts indicatifs (grille Google 2026) : suggestions gratuites quand la
// session se termine par une fiche ; fiche avec avis et photos = niveau
// Enterprise + Atmosphere ; voisins avec note = Enterprise ; photo = Essentials.
// Chaque appel est compté dans `calls` pour mesurer le coût réel.

const BASE = "https://places.googleapis.com/v1";

// Rectangle qui couvre la Région de Bruxelles-Capitale. Le filtre exact se
// fait ensuite sur le code postal de la fiche (ADR 0069 §2).
const BRUSSELS_RECT = {
  low: { latitude: 50.763, longitude: 4.244 },
  high: { latitude: 50.914, longitude: 4.482 },
};

export class PlacesError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "PlacesError";
  }
}

export function isPlacesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new PlacesError("clé GOOGLE_PLACES_API_KEY absente");
  return k;
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; fieldMask: string; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": init.fieldMask,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new PlacesError(`Places ${res.status}${detail ? ` : ${detail.slice(0, 200)}` : ""}`, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

export async function suggest(input: string, sessionToken: string): Promise<Suggestion[]> {
  const j = await call<{ suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[] }>(
    "/places:autocomplete",
    {
      method: "POST",
      fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
      body: {
        input,
        sessionToken,
        languageCode: "fr",
        regionCode: "be",
        locationRestriction: { rectangle: BRUSSELS_RECT },
      },
    },
  );
  return (j.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      address: (p.structuredFormat?.secondaryText?.text ?? "").replace(/,\s*Belgi(que|um|ë)$/i, ""),
    }))
    .slice(0, 5);
}

// ─── Fiche ───────────────────────────────────────────────────────────────────

export interface PlaceReview {
  rating: number | null;
  text: string | null;
  when: string | null;
  publishTime: string | null;
  /** Initiale de l'auteur seulement (ADR 0025, ADR 0071 §2). */
  initial: string;
}

export interface PlaceDetails {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  phone: string | null;
  primaryType: string | null;
  category: string | null;
  types: string[];
  mapsUri: string | null;
  summary: string | null;
  hasHours: boolean;
  openNow: boolean | null;
  photoNames: string[];
  reviews: PlaceReview[];
  services: { dineIn: boolean | null; takeout: boolean | null; delivery: boolean | null };
}

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  googleMapsUri?: string;
  editorialSummary?: { text?: string };
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photos?: { name: string }[];
  reviews?: { rating?: number; text?: { text?: string }; originalText?: { text?: string }; relativePublishTimeDescription?: string; publishTime?: string; authorAttribution?: { displayName?: string } }[];
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
}

/** Initiale d'un nom d'auteur, jamais le nom lui-même. */
export function initialOf(name: string | null | undefined): string {
  const c = (name ?? "").trim().charAt(0).toUpperCase();
  return /\p{L}/u.test(c) ? c : "·";
}

export function toDetails(p: RawPlace): PlaceDetails {
  const postal = p.addressComponents?.find((c) => c.types?.includes("postal_code"))?.longText ?? null;
  return {
    id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress?.replace(/,\s*Belgi(que|um|ë)$/i, "") ?? null,
    postalCode: postal,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    reviewsCount: p.userRatingCount ?? null,
    website: p.websiteUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    primaryType: p.primaryType ?? null,
    category: p.primaryTypeDisplayName?.text ?? null,
    types: p.types ?? [],
    mapsUri: p.googleMapsUri ?? null,
    summary: p.editorialSummary?.text ?? null,
    hasHours: !!p.regularOpeningHours?.weekdayDescriptions?.length,
    openNow: p.regularOpeningHours?.openNow ?? null,
    photoNames: (p.photos ?? []).map((x) => x.name),
    reviews: (p.reviews ?? []).map((r) => ({
      rating: r.rating ?? null,
      text: (r.originalText?.text ?? r.text?.text ?? "").trim() || null,
      when: r.relativePublishTimeDescription ?? null,
      publishTime: r.publishTime ?? null,
      initial: initialOf(r.authorAttribution?.displayName),
    })),
    services: { dineIn: p.dineIn ?? null, takeout: p.takeout ?? null, delivery: p.delivery ?? null },
  };
}

const DETAILS_FIELDS = [
  "id", "displayName", "formattedAddress", "addressComponents", "location", "rating", "userRatingCount",
  "websiteUri", "nationalPhoneNumber", "primaryType", "primaryTypeDisplayName", "types", "googleMapsUri",
  "editorialSummary", "regularOpeningHours", "photos", "reviews", "dineIn", "takeout", "delivery",
].join(",");

export async function placeDetails(placeId: string, sessionToken?: string | null): Promise<PlaceDetails> {
  if (!/^[\w-]{10,300}$/.test(placeId)) throw new PlacesError("identifiant de fiche invalide");
  const qs = new URLSearchParams({ languageCode: "fr", regionCode: "be" });
  if (sessionToken) qs.set("sessionToken", sessionToken);
  const p = await call<RawPlace>(`/places/${encodeURIComponent(placeId)}?${qs}`, { fieldMask: DETAILS_FIELDS });
  return toDetails(p);
}

// ─── Voisins ─────────────────────────────────────────────────────────────────

export interface Neighbor {
  id: string;
  name: string;
  rating: number | null;
  reviewsCount: number | null;
  lat: number;
  lng: number;
  category: string | null;
}

export async function nearby(lat: number, lng: number, primaryType: string | null, radiusM = 600): Promise<Neighbor[]> {
  const j = await call<{ places?: RawPlace[] }>("/places:searchNearby", {
    method: "POST",
    fieldMask: "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.primaryTypeDisplayName",
    body: {
      // Même type que la fiche quand il est précis (« fast_food_restaurant »),
      // sinon tous les restaurants autour.
      includedTypes: [primaryType && primaryType !== "point_of_interest" ? primaryType : "restaurant"],
      maxResultCount: 12,
      rankPreference: "DISTANCE",
      languageCode: "fr",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
    },
  });
  return (j.places ?? [])
    .filter((p) => p.location?.latitude != null && p.location?.longitude != null)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? "",
      rating: p.rating ?? null,
      reviewsCount: p.userRatingCount ?? null,
      lat: p.location!.latitude!,
      lng: p.location!.longitude!,
      category: p.primaryTypeDisplayName?.text ?? null,
    }));
}

// ─── Photos ──────────────────────────────────────────────────────────────────

/** URL publique d'une photo (sans clé), pour l'afficher telle quelle dans le navigateur. */
export async function photoUri(photoName: string, maxWidthPx = 640): Promise<string | null> {
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(photoName)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": key() },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { photoUri?: string };
    return j.photoUri && /^https:\/\/[\w.-]+\.googleusercontent\.com\//.test(j.photoUri) ? j.photoUri : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
