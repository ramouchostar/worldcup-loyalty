import { lookup } from "node:dns/promises";
import { isPrivateAddress, judgeUrl, URL_ISSUE_TEXT, type UrlIssue } from "./safe-url";

// ============================================================
// Réserver un prestataire (ADR 0084, PR P) — « tester le scan » : le lien du QR code mène-t-il quelque part ?
//
// Un scan de caméra n'a pas lieu ici : on vérifie que l'adresse répond (code 2xx après au plus 3 redirections) et on dit où elle
// mène. Chaque adresse — la première et chaque redirection — est jugée AVANT d'être cherchée (lib/safe-url.ts) et sa résolution
// DNS est contrôlée : aucune adresse privée, locale ou réservée. Le corps de la réponse n'est jamais lu.
// ============================================================

export type QrCheck =
  | { ok: true; finalHost: string; redirected: boolean; status: number }
  | { ok: false; reason: UrlIssue | "unreachable" | "bad_status" | "too_many_redirects" | "private_address"; status?: number };

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6_000;

export const QR_REASON_TEXT: Record<Exclude<QrCheck, { ok: true }>["reason"], string> = {
  ...URL_ISSUE_TEXT,
  unreachable: "Ce site ne répond pas pour le moment. Vérifie l'adresse, ou réessaie dans un instant.",
  bad_status: "Cette adresse mène à une page d'erreur. Vérifie qu'elle est exacte.",
  too_many_redirects: "Cette adresse renvoie trop de fois ailleurs. Donne l'adresse finale.",
  private_address: "Cette adresse n'est pas celle d'un site public.",
};

async function resolvesPublic(host: string): Promise<boolean> {
  try {
    const found = await lookup(host, { all: true, verbatim: true });
    return found.length > 0 && found.every((f) => !isPrivateAddress(f.address));
  } catch {
    return false;
  }
}

/** Les dépendances réseau, remplaçables dans les tests. */
export type QrDeps = { fetch?: typeof fetch; resolvesPublic?: (host: string) => Promise<boolean> };

export async function checkQrUrl(raw: string, deps: QrDeps = {}): Promise<QrCheck> {
  const fetchImpl = deps.fetch ?? fetch;
  const isPublic = deps.resolvesPublic ?? resolvesPublic;
  let current = judgeUrl(raw);
  if (!current.ok) return { ok: false, reason: current.issue };
  let redirected = false;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = current.url;
    if (!(await isPublic(url.hostname))) return { ok: false, reason: "private_address" };
    let res: Response;
    try {
      // GET sans lire le corps : certains sites refusent HEAD.
      res = await fetchImpl(url.toString(), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "Boosteats-QR-check/1.0", accept: "text/html,*/*;q=0.5" } });
    } catch {
      return { ok: false, reason: "unreachable" };
    }
    try {
      await res.body?.cancel();
    } catch {
      /* rien à annuler */
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "bad_status", status: res.status };
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return { ok: false, reason: "invalid" };
      }
      const judged = judgeUrl(next.toString());
      if (!judged.ok) return { ok: false, reason: judged.issue };
      current = judged;
      redirected = true;
      continue;
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, finalHost: url.hostname.replace(/^www\./, ""), redirected, status: res.status };
    // 401/403 : le site existe mais refuse un visiteur automatique — un humain avec son téléphone passera (on le dit au prestataire, qui reteste).
    if (res.status === 401 || res.status === 403 || res.status === 429) return { ok: true, finalHost: url.hostname.replace(/^www\./, ""), redirected, status: res.status };
    return { ok: false, reason: "bad_status", status: res.status };
  }
  return { ok: false, reason: "too_many_redirects" };
}
