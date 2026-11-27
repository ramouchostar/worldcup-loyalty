// ============================================================
// Signal « météo » — les appels à MET Norway (réseau et réserve ; les règles
// vivent dans weather-met.ts et dans les articles automatiques).
//
// SERVEUR UNIQUEMENT. La réserve (cache) est passée en paramètre.
//
// ÉTEINT tant que MET_NORWAY_USER_AGENT est vide : cette chaîne identifie le
// service auprès de MET Norway (nom de l'application et contact). Elle est
// choisie par la personne qui a lu et accepté leurs conditions ; il n'y a
// aucune valeur par défaut.
//
// Conditions (https://api.met.no/doc/TermsOfService, révision 2026-11-05, et
// https://api.met.no/weatherapi/locationforecast/2.0/documentation), tenues ici :
//   - chaque réponse est gardée ; aucune demande identique avant l'heure
//     « Expires », ni moins de 3 heures après la précédente (hors pays
//     nordiques), qu'elle ait réussi ou non ;
//   - « If-Modified-Since » avec la valeur « Last-Modified » reçue ; 304 accepté ;
//   - 4 décimales au plus sur les coordonnées (ici 2, environ 1 km : les
//     restaurants voisins partagent la même réponse) ;
//   - 429 et 403 : plus aucune demande pendant un moment ; 203 : version en fin
//     de vie, dite au journal ;
//   - HTTPS ; le décalage à l'heure pile est fait par la tâche qui prépare la
//     réserve (app/api/cron/auto-articles-weather).
// ============================================================

import { parseMetForecast, type MetForecast } from "./weather-met";

export const MET_FORECAST_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
/** « Pas de demande identique plus d'une fois toutes les trois heures » hors pays nordiques. */
export const MIN_INTERVAL_MS = 3 * 3_600_000;
/** Après un refus d'identification : on s'arrête plus longtemps, il faut qu'une personne regarde. */
export const REFUSED_PAUSE_MS = 6 * 3_600_000;
/** La ligne de la réserve qui suspend toutes les demandes (429, 403). */
export const PAUSE_KEY = "*";
/** Les heures gardées : au-delà, les articles n'en ont pas besoin. */
const KEPT_HOURS = 72;
const TIMEOUT_MS = 10_000;

export type Coordinates = { lat: number; lng: number };

export type CacheEntry = {
  key: string;
  /** La dernière demande a-t-elle abouti ? Sinon les heures gardées ne servent à rien annoncer. */
  ok: boolean;
  status: number | null;
  error: string | null;
  lastModified: string | null;
  /** Avant cet instant, aucune nouvelle demande pour cette clé. */
  nextAllowedAt: string;
  confirmedAt: string | null;
  forecast: MetForecast | null;
};

export type ForecastCache = {
  get(key: string): Promise<CacheEntry | null>;
  /**
   * Prend le droit de demander, d'un seul geste : vrai si la clé n'existe pas ou si son délai est passé, et le délai
   * est aussitôt repoussé à `until` (l'entrée passe « pas aboutie »). Deux appels en même temps : un seul vrai.
   */
  claim(key: string, now: string, until: string): Promise<boolean>;
  save(entry: CacheEntry): Promise<void>;
};

export type ForecastResult = { ok: true; forecast: MetForecast } | { ok: false; error: string };

/** Tronque (sans arrondir) à deux décimales, en texte. */
export const metCoordinate = (x: number): string => {
  const [whole, decimals = ""] = x.toFixed(8).split(".");
  return `${whole}.${decimals.slice(0, 2).padEnd(2, "0")}`;
};
export const metKey = (c: Coordinates): string => `${metCoordinate(c.lat)},${metCoordinate(c.lng)}`;
export const metUrl = (c: Coordinates): string => `${MET_FORECAST_URL}?lat=${metCoordinate(c.lat)}&lon=${metCoordinate(c.lng)}`;

/** La chaîne d'identification, ou pourquoi la source reste éteinte. */
export function readUserAgent(value: string | undefined): { ok: true; userAgent: string } | { ok: false; why: string } {
  const userAgent = (value ?? "").trim();
  if (userAgent === "") return { ok: false, why: "MET_NORWAY_USER_AGENT est vide" };
  if (!/^[\x20-\x7e]{1,200}$/.test(userAgent)) return { ok: false, why: "MET_NORWAY_USER_AGENT contient des caractères interdits (texte simple, 200 au plus)" };
  // Les conditions demandent un nom d'application ET un moyen de joindre : adresse de courriel ou site.
  if (!/@|https?:\/\/|[a-z0-9-]+\.[a-z]{2,}/i.test(userAgent)) return { ok: false, why: "MET_NORWAY_USER_AGENT n'a pas de contact (courriel ou site)" };
  if (/^(okhttp|dalvik|fhttp|java|curl|node|mozilla)\b/i.test(userAgent)) return { ok: false, why: "MET_NORWAY_USER_AGENT est une identification générique" };
  return { ok: true, userAgent };
}

export type MetForecastReader = {
  /**
   * La prévision d'un point. `network: false` : seulement la réserve (les passages à l'heure pile ne demandent rien).
   * Une prévision n'est rendue que si la dernière demande a abouti et que son délai court encore.
   */
  get(c: Coordinates, opts: { now: Date; network: boolean }): Promise<ForecastResult>;
};

export function metForecastReader(p: {
  userAgent: string;
  cache: ForecastCache;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}): MetForecastReader {
  const log = p.log ?? ((m: string) => console.warn(`[météo MET Norway] ${m}`));
  const usable = (e: CacheEntry | null, now: Date) => (e && e.ok && e.forecast && now.getTime() < Date.parse(e.nextAllowedAt) ? e.forecast : null);
  const fail = (error: string): ForecastResult => ({ ok: false, error });

  return {
    async get(c, { now, network }) {
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng) || Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return fail("coordonnées invalides");
      const key = metKey(c);
      const entry = await p.cache.get(key);
      const kept = usable(entry, now);
      if (kept) return { ok: true, forecast: kept };
      if (!network) return fail(entry?.error ?? "aucune prévision fraîche en réserve");
      if (entry && now.getTime() < Date.parse(entry.nextAllowedAt)) return fail(entry.error ?? "une demande est en cours ou vient d'échouer");
      const pause = await p.cache.get(PAUSE_KEY);
      if (pause && now.getTime() < Date.parse(pause.nextAllowedAt)) return fail(pause.error ?? "demandes suspendues");

      const until = new Date(now.getTime() + MIN_INTERVAL_MS).toISOString();
      if (!(await p.cache.claim(key, now.toISOString(), until))) {
        const again = usable(await p.cache.get(key), now);
        return again ? { ok: true, forecast: again } : fail("une demande est déjà en cours");
      }

      const base: CacheEntry = {
        key, ok: false, status: null, error: null, nextAllowedAt: until,
        lastModified: entry?.lastModified ?? null, confirmedAt: entry?.confirmedAt ?? null, forecast: entry?.forecast ?? null,
      };
      const failed = async (status: number | null, error: string): Promise<ForecastResult> => {
        log(`${key} : ${error}`);
        await p.cache.save({ ...base, status, error });
        return fail(error);
      };

      const headers: Record<string, string> = { "User-Agent": p.userAgent, Accept: "application/json" };
      if (base.forecast && base.lastModified) headers["If-Modified-Since"] = base.lastModified;
      let res: Response;
      let body: unknown = null;
      try {
        // `no-store` : la réserve est la nôtre, aucune autre couche ne doit rejouer ou transformer la demande.
        res = await (p.fetchImpl ?? fetch)(metUrl(c), { headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 200 || res.status === 203) body = await res.json();
      } catch (e) {
        return failed(null, `lecture impossible : ${(e as Error).message || "réseau"}`);
      }

      if (res.status === 429 || res.status === 403) {
        const pauseMs = res.status === 429 ? MIN_INTERVAL_MS : REFUSED_PAUSE_MS;
        const error = res.status === 429 ? "trop de demandes (429) : demandes suspendues" : "identification refusée (403) : vérifier MET_NORWAY_USER_AGENT";
        await p.cache.save({
          key: PAUSE_KEY, ok: false, status: res.status, error, lastModified: null, confirmedAt: null, forecast: null,
          nextAllowedAt: new Date(now.getTime() + pauseMs).toISOString(),
        });
        return failed(res.status, error);
      }
      if (res.status !== 200 && res.status !== 203 && res.status !== 304) return failed(res.status, `MET Norway a répondu ${res.status}`);
      if (res.status === 203) log("réponse 203 : cette version du service va être retirée, à mettre à jour");

      let forecast = base.forecast;
      let lastModified = base.lastModified;
      if (res.status !== 304) {
        const parsed = parseMetForecast(body);
        if (!parsed) return failed(res.status, "réponse illisible");
        const last = now.getTime() + KEPT_HOURS * 3_600_000;
        forecast = { ...parsed, hours: parsed.hours.filter((h) => Date.parse(h.time) <= last) };
        lastModified = res.headers.get("last-modified");
      }
      if (!forecast) return failed(res.status, "réponse « inchangée » sans prévision en réserve");

      const expires = Date.parse(res.headers.get("expires") ?? "");
      const nextAllowedAt = new Date(Math.max(Number.isNaN(expires) ? 0 : expires, now.getTime() + MIN_INTERVAL_MS)).toISOString();
      await p.cache.save({ key, ok: true, status: res.status, error: null, lastModified, nextAllowedAt, confirmedAt: now.toISOString(), forecast });
      return { ok: true, forecast };
    },
  };
}
