// ============================================================
// Signal « transports et grèves » — lecture d'iRail et de STIB (réseau
// uniquement, aucune écriture en base). Les règles vivent dans transport.ts.
//
// SERVEUR UNIQUEMENT. Aucune clé : les deux sources sont publiques.
//
// LIMITES À RESPECTER (lues le 2026-10-06) :
//   iRail : 3 requêtes/s par IP, et un User-Agent qui permet de nous joindre.
//   STIB  : 100 requêtes PAR JOUR et 10 par minute en accès anonyme. Une
//           lecture = une requête : l'appelant doit garder le résultat en
//           cache (au moins une heure) au lieu de relire à chaque message.
//
// Aucune lecture n'échoue en silence : le résultat dit, source par source, ce
// qui a été lu ou pourquoi ça a échoué.
// ============================================================

import { parseIrailDisturbances, parseStibMessages, type TransportNotice, type TransportSource } from "./transport";

export const IRAIL_URL = "https://api.irail.be/v1/disturbances?format=json&lang=fr";
export const STIB_URL = "https://api-management-discovery-production.azure-api.net/api/datasets/stibmivb/rt/TravellersInformation";

// iRail demande « <application>/<version> (<site>; <contact>) » pour pouvoir
// prévenir en cas de problème. Adresse de contact de la plateforme, jamais
// celle d'une personne.
export const USER_AGENT = "Boosteats/1.0 (https://www.boosteats.be; contact@boosteats.be)";

const DEFAULT_TIMEOUT_MS = 20_000;

export type SourceRead = { count: number; error?: string };

export type TransportRead = {
  /** Vrai seulement si les deux sources ont été lues. */
  ok: boolean;
  notices: TransportNotice[];
  perSource: Record<TransportSource, SourceRead>;
  errors: string[];
};

export type TransportReadOptions = {
  /** Jour d'aujourd'hui à Bruxelles, AAAA-MM-JJ : sert à placer dans l'année les dates écrites sans année. */
  today: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function describeHttpError(source: TransportSource, status: number): string {
  if (status === 429) {
    return source === "stib"
      ? "limite de 100 lectures par jour atteinte (429) : garder le résultat en cache"
      : "limite de 3 requêtes par seconde atteinte (429)";
  }
  return `${source === "stib" ? "STIB" : "iRail"} a répondu ${status}`;
}

async function readSource(
  source: TransportSource,
  url: string,
  parse: (raw: unknown, today: string) => TransportNotice[],
  o: { today: string; fetchImpl: typeof fetch; timeoutMs: number }
): Promise<{ notices: TransportNotice[]; error?: string }> {
  let res: Response;
  try {
    res = await o.fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (e) {
    return { notices: [], error: `réseau : ${(e as Error).message || "échec"}` };
  }
  if (!res.ok) return { notices: [], error: describeHttpError(source, res.status) };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { notices: [], error: "réponse illisible (JSON invalide)" };
  }
  const notices = parse(body, o.today);
  // Une réponse non vide en octets mais sans aucun avis exploitable = format
  // qui a changé : on le dit plutôt que de laisser croire à « aucun avis ».
  const looksLikeShape =
    source === "irail"
      ? body && typeof body === "object" && Array.isArray((body as { disturbance?: unknown }).disturbance)
      : body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results);
  if (!looksLikeShape) return { notices: [], error: "format de réponse inattendu" };
  return { notices };
}

export async function readTransportNotices(opts: TransportReadOptions): Promise<TransportRead> {
  const o = { today: opts.today, fetchImpl: opts.fetchImpl ?? fetch, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS };
  const errors: string[] = [];
  const notices: TransportNotice[] = [];
  const perSource = {} as Record<TransportSource, SourceRead>;

  // Les deux sources sont indépendantes : l'une peut tomber sans l'autre.
  const jobs: [TransportSource, string, typeof parseIrailDisturbances][] = [
    ["irail", IRAIL_URL, parseIrailDisturbances],
    ["stib", STIB_URL, parseStibMessages],
  ];
  for (const [source, url, parse] of jobs) {
    const r = await readSource(source, url, parse, o);
    perSource[source] = { count: r.notices.length, ...(r.error ? { error: r.error } : {}) };
    if (r.error) errors.push(`${source} : ${r.error}`);
    notices.push(...r.notices);
  }
  return { ok: errors.length === 0, notices, perSource, errors };
}
