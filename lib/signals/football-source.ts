// ============================================================
// Signal « foot » — lecture de Bzzoiro Sports Data (réseau uniquement, aucune
// écriture en base). Les règles de sélection vivent dans football.ts (pur).
//
// SERVEUR UNIQUEMENT : la clé API (BZZOIRO_API_KEY) ne quitte jamais le
// serveur. La clé est passée en paramètre ; ce module ne lit pas
// `process.env` pour rester testable.
//
// Aucune lecture n'échoue en silence : le résultat dit, compétition par
// compétition, ce qui a été lu ou pourquoi ça a échoué. L'appelant (cron du
// copilote) l'écrit dans `signal_sync_runs`.
// ============================================================

import { parseBzzoiroEvents, type FootballMatch } from "./football";

export const BZZOIRO_ORIGIN = "https://sports.bzzoiro.com";
const PAGE_SIZE = 200; // maximum accepté par l'API
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 20_000;

export type CompetitionRead = { count: number; error?: string };

export type FootballRead = {
  /** Vrai seulement si TOUTES les compétitions demandées ont été lues. */
  ok: boolean;
  matches: FootballMatch[];
  perCompetition: Record<number, CompetitionRead>;
  errors: string[];
};

export type FootballReadOptions = {
  apiKey: string | undefined;
  /** Jours AAAA-MM-JJ, bornes comprises (l'API filtre sur la date UTC du match). */
  from: string;
  to: string;
  competitionIds: number[];
  fetchImpl?: typeof fetch;
  maxPages?: number;
  timeoutMs?: number;
};

/** Message lisible pour un code HTTP de l'API (docs : 401 clé, 402 forfait, 429 limite). */
export function describeHttpError(status: number): string {
  if (status === 401) return "clé API refusée (401)";
  if (status === 402) return "cette compétition demande un forfait payant (402)";
  if (status === 429) return "limite d'appels atteinte (429)";
  return `l'API a répondu ${status}`;
}

async function readCompetition(
  id: number,
  o: Required<Pick<FootballReadOptions, "from" | "to" | "maxPages" | "timeoutMs">> & { apiKey: string; fetchImpl: typeof fetch }
): Promise<{ matches: FootballMatch[]; error?: string }> {
  const matches: FootballMatch[] = [];
  let url: string | null =
    `${BZZOIRO_ORIGIN}/api/events/?league=${id}&date_from=${o.from}&date_to=${o.to}&limit=${PAGE_SIZE}`;

  for (let page = 0; url && page < o.maxPages; page++) {
    let res: Response;
    try {
      res = await o.fetchImpl(url, {
        headers: { Authorization: `Token ${o.apiKey}`, accept: "application/json" },
        signal: AbortSignal.timeout(o.timeoutMs),
      });
    } catch (e) {
      return { matches, error: `réseau : ${(e as Error).message || "échec"}` };
    }
    if (!res.ok) return { matches, error: describeHttpError(res.status) };

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { matches, error: "réponse illisible (JSON invalide)" };
    }
    matches.push(...parseBzzoiroEvents(body));

    // On ne suit la page suivante que si elle reste chez Bzzoiro : une URL
    // `next` venue d'ailleurs recevrait notre clé dans son en-tête.
    const next = (body as { next?: unknown } | null)?.next;
    url = typeof next === "string" && next.startsWith(`${BZZOIRO_ORIGIN}/`) ? next : null;
  }
  return { matches };
}

export async function readFootballMatches(opts: FootballReadOptions): Promise<FootballRead> {
  if (!opts.apiKey) {
    return {
      ok: false,
      matches: [],
      perCompetition: {},
      errors: ["BZZOIRO_API_KEY absente : aucune lecture (variable d'environnement à renseigner)"],
    };
  }
  const o = {
    from: opts.from,
    to: opts.to,
    maxPages: opts.maxPages ?? DEFAULT_MAX_PAGES,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl ?? fetch,
  };

  const perCompetition: Record<number, CompetitionRead> = {};
  const errors: string[] = [];
  const byId = new Map<number, FootballMatch>();

  // Une compétition après l'autre : respecte les limites d'appels de la clé
  // gratuite plutôt que d'en lancer treize d'un coup.
  for (const id of opts.competitionIds) {
    const r = await readCompetition(id, o);
    perCompetition[id] = { count: r.matches.length, ...(r.error ? { error: r.error } : {}) };
    if (r.error) errors.push(`compétition ${id} : ${r.error}`);
    for (const m of r.matches) byId.set(m.id, m);
    // Clé refusée ou limite atteinte : inutile d'insister sur les suivantes.
    if (r.error && /\((401|429)\)/.test(r.error)) {
      for (const rest of opts.competitionIds) {
        if (!(rest in perCompetition)) {
          perCompetition[rest] = { count: 0, error: "non lue (lecture interrompue)" };
        }
      }
      break;
    }
  }

  return { ok: errors.length === 0, matches: [...byId.values()], perCompetition, errors };
}
