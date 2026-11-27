// ADR 0112 — les matchs (Bzzoiro Sports Data, lib/signals/football). Ceux qui comptent à Bruxelles
// (`relevantMatches` : Pro League, coupes d'Europe, sélections suivies, coup d'envoi entre 17 h et 22 h), UN SEUL par
// jour : la sélection nationale d'abord, puis la Pro League, puis l'Europe. Sans clé, aucun match, et c'est dit au
// journal. Règles PURES, testées ; la lecture est passée en paramètre.

import { relevantMatches } from "../../../day-reasons";
import { brusselsTime, FOOTBALL_COMPETITIONS, type FootballMatch } from "../../../signals/football";
import type { FootballRead } from "../../../signals/football-source";
import { cleanName, TEAM_MAX } from "../clean";
import { addDays } from "../time";
import type { Candidate, MatchFacts } from "../types";
import type { OccasionSource } from "./types";

/** L'article tient jusqu'à trois heures après le coup d'envoi (prolongations comprises). */
export const MATCH_END_HOURS = 3;
export const MATCHES_UNAVAILABLE = "clé BZZOIRO_API_KEY absente : aucun match n'est lu";

const GROUP = new Map(FOOTBALL_COMPETITIONS.map((c) => [c.id, c.group]));
/** La Pro League, les coupes d'Europe et les compétitions de sélections : les seules que `relevantMatches` retient. */
export const MATCH_COMPETITIONS = FOOTBALL_COMPETITIONS.filter((c) => c.id === 14 || c.group === "europe" || c.group === "selections").map((c) => c.id);
const groupRank = (m: FootballMatch) => {
  const g = GROUP.get(m.competitionId);
  return g === "selections" ? 0 : g === "belgique" ? 1 : 2;
};

export function matchFacts(m: FootballMatch): MatchFacts | null {
  const home = cleanName(m.home, TEAM_MAX);
  const away = cleanName(m.away, TEAM_MAX);
  const competition = cleanName(m.competition, TEAM_MAX);
  if (!home || !away || !competition) return null;
  return { kind: "match", matchId: m.id, home, away, competition, kickoffUtc: m.kickoffUtc, day: brusselsTime(m.kickoffUtc).date };
}

export function matchCandidates(matches: FootballMatch[], window: { from: string; to: string }): Candidate[] {
  const out: Candidate[] = [];
  for (let day = window.from; day <= window.to; day = addDays(day, 1)) {
    const best = relevantMatches(matches, day).sort(
      (a, b) => groupRank(a) - groupRank(b) || a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id - b.id,
    );
    for (const m of best) {
      const facts = matchFacts(m);
      if (!facts) continue;
      const expiresAt = new Date(Date.parse(m.kickoffUtc) + MATCH_END_HOURS * 3_600_000).toISOString();
      out.push({ kind: "match", sourceKey: `match:bzzoiro:${m.id}`, rank: groupRank(m), days: [{ day, expiresAt, facts }] });
      break; // un match par jour
    }
  }
  return out;
}

export type MatchReader = (p: { from: string; to: string; competitionIds: number[] }) => Promise<FootballRead>;

export function matchSource(read: MatchReader, hasKey: boolean): OccasionSource {
  return {
    kind: "match",
    unavailable: () => (hasKey ? null : MATCHES_UNAVAILABLE),
    async read(_ctx, window) {
      if (!hasKey) return { ok: false, error: MATCHES_UNAVAILABLE };
      const r = await read({ ...window, competitionIds: MATCH_COMPETITIONS });
      if (r.errors.length > 0) console.warn("[articles auto] matchs lus en partie :", r.errors.join(" ; "));
      if (!r.ok && r.matches.length === 0) return { ok: false, error: r.errors.join(" ; ") || "matchs illisibles" };
      return { ok: true, candidates: matchCandidates(r.matches, window) };
    },
    async recheck(_ctx, facts) {
      if (facts.kind !== "match" || !hasKey) return { ok: false, reason: "source_indisponible" };
      const r = await read({ from: facts.day, to: facts.day, competitionIds: MATCH_COMPETITIONS });
      const m = r.matches.find((x) => x.id === facts.matchId);
      if (!m) return { ok: false, reason: r.ok ? "match_change" : "source_indisponible" };
      const now = matchFacts(m);
      const moved = !now || now.kickoffUtc !== facts.kickoffUtc || now.home !== facts.home || now.away !== facts.away;
      if (m.status === "postponed" || m.status === "cancelled" || moved) return { ok: false, reason: "match_change" };
      return { ok: true };
    },
  };
}
