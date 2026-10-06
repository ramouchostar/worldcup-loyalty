// ============================================================
// Signal « événements locaux » — lecture de l'agenda de visit.brussels (réseau
// uniquement). Les règles vivent dans local-events.ts (pur).
//
// SERVEUR UNIQUEMENT. Aucune clé : API publique (https://api.agenda.brussels).
//
// COÛT À CONNAÎTRE (mesuré le 2026-10-06) : l'API n'a ni filtre de date, ni
// compression, ni requête conditionnelle. Une lecture complète = 16 pages de
// 400 événements, environ 10 Mo chacune, 144 Mo au total, une vingtaine de
// secondes. D'où : une page est lue, réduite aux occurrences utiles, puis
// OUBLIÉE avant la suivante (la mémoire ne dépasse pas une page), et la
// lecture n'est lancée que tous les deux jours (cron).
//
// Aucune lecture n'échoue en silence : le résultat dit combien de pages ont
// été lues et pourquoi une page a échoué.
// ============================================================

import { isNotable, parseVisitBrusselsEvents, type LocalEvent, type ParseWindow } from "./local-events";

export const AGENDA_URL = "https://api.agenda.brussels/events";
// iRail et les autres exigent un contact : même convention ici, adresse de la
// plateforme, jamais celle d'une personne.
export const USER_AGENT = "Boosteats/1.0 (https://www.boosteats.be; contact@boosteats.be)";

export const PAGE_SIZE = 400; // maximum accepté par l'API (au-delà, elle répond 400)
const DEFAULT_MAX_PAGES = 40;
const DEFAULT_TIMEOUT_MS = 90_000;

export type AgendaRead = {
  /** Vrai seulement si toutes les pages annoncées ont été lues. */
  ok: boolean;
  /** Occurrences à garder (déjà filtrées par `isNotable`). */
  events: LocalEvent[];
  pagesRead: number;
  pagesTotal: number | null;
  /** Événements vus (avant tri) et occurrences dans la fenêtre. */
  eventsSeen: number;
  occurrencesInWindow: number;
  bytes: number;
  errors: string[];
};

export type AgendaReadOptions = ParseWindow & {
  fetchImpl?: typeof fetch;
  maxPages?: number;
  timeoutMs?: number;
};

export function describeHttpError(status: number): string {
  if (status === 429) return "limite d'appels atteinte (429) : réessayer plus tard, ne pas insister";
  return `l'agenda a répondu ${status}`;
}

export async function readVisitBrusselsAgenda(opts: AgendaReadOptions): Promise<AgendaRead> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const window: ParseWindow = { from: opts.from, to: opts.to };

  const kept = new Map<string, LocalEvent>();
  const errors: string[] = [];
  let pagesRead = 0;
  let pagesTotal: number | null = null;
  let eventsSeen = 0;
  let occurrencesInWindow = 0;
  let bytes = 0;

  for (let page = 1; page <= maxPages; page++) {
    let body: unknown;
    try {
      const res = await fetchImpl(`${AGENDA_URL}?size=${PAGE_SIZE}&page=${page}`, {
        headers: { "User-Agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        errors.push(`page ${page} : ${describeHttpError(res.status)}`);
        // Limite atteinte : inutile d'enchaîner les pages suivantes.
        if (res.status === 429) break;
        continue;
      }
      const text = await res.text();
      bytes += text.length;
      body = JSON.parse(text);
    } catch (e) {
      errors.push(`page ${page} : ${e instanceof SyntaxError ? "réponse illisible (JSON invalide)" : `réseau : ${(e as Error).message || "échec"}`}`);
      continue;
    }

    const b = body as { data?: unknown; totalPages?: unknown } | null;
    if (!b || !Array.isArray(b.data)) {
      errors.push(`page ${page} : format de réponse inattendu`);
      continue;
    }
    if (typeof b.totalPages === "number") pagesTotal = b.totalPages;
    pagesRead++;
    eventsSeen += b.data.length;

    const occurrences = parseVisitBrusselsEvents(b, window);
    occurrencesInWindow += occurrences.length;
    for (const o of occurrences) if (isNotable(o)) kept.set(o.externalId, o);

    if (pagesTotal !== null && page >= pagesTotal) break;
    if (b.data.length === 0) break;
  }

  const complete = pagesTotal !== null && pagesRead === pagesTotal && errors.length === 0;
  if (pagesTotal === null && errors.length === 0) errors.push("nombre total de pages inconnu : lecture non vérifiable");
  return {
    ok: complete,
    events: [...kept.values()],
    pagesRead,
    pagesTotal,
    eventsSeen,
    occurrencesInWindow,
    bytes,
    errors,
  };
}
