// ============================================================
// Signal « foot » — matchs à venir (backlog plateforme « API foot », décidé le
// 2026-10-01 ; source retenue le 2026-10-06 : Bzzoiro Sports Data, gratuit).
//
// Module PUR : aucun accès réseau ni base, aucune horloge (la date du jour est
// injectée). Il transforme la réponse de l'API en matchs normalisés (heure de
// Bruxelles comprise) et dit, pour UN établissement, quels matchs à venir
// comptent pour SA clientèle : les équipes qu'il suit et/ou les compétitions
// qu'il suit. Il ne choisit PAS l'action (« offre pendant le match ») : c'est
// le rôle du moteur du copilote (ADR 0074 §8).
//
// La lecture réseau vit dans football-source.ts.
// Rien ici n'atteint un membre (ADR 0007).
// ============================================================

export type FootballStatus = "notstarted" | "inprogress" | "finished" | "postponed" | "cancelled" | "other";

export type FootballVenue = {
  name: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
};

export type FootballMatch = {
  id: number;
  competitionId: number;
  competition: string;
  competitionCountry: string | null;
  isWomen: boolean;
  home: string;
  away: string;
  homeId: number | null;
  awayId: number | null;
  homeCountry: string | null;
  awayCountry: string | null;
  /** Coup d'envoi, ISO 8601 UTC tel que fourni par l'API. */
  kickoffUtc: string;
  status: FootballStatus;
  round: number | null;
  isLocalDerby: boolean;
  venue: FootballVenue | null;
};

export type BrusselsTime = {
  date: string; // AAAA-MM-JJ, jour calendaire à Bruxelles
  time: string; // HH:MM, heure de Bruxelles (heure d'été comprise)
  hour: number;
  /** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
  weekday: number;
};

// ── Compétitions connues (identifiants Bzzoiro, lus le 2026-10-06) ───────────

export type CompetitionGroup = "belgique" | "europe" | "selections" | "maroc" | "turquie";

export const FOOTBALL_COMPETITIONS: { id: number; name: string; group: CompetitionGroup }[] = [
  { id: 14, name: "Pro League (Belgique)", group: "belgique" },
  { id: 97, name: "Challenger Pro League (Belgique)", group: "belgique" },
  { id: 7, name: "Ligue des champions", group: "europe" },
  { id: 8, name: "Ligue Europa", group: "europe" },
  { id: 83, name: "Ligue Conférence", group: "europe" },
  { id: 90, name: "Supercoupe d'Europe", group: "europe" },
  { id: 64, name: "Ligue des nations UEFA", group: "selections" },
  { id: 31, name: "Matchs amicaux internationaux", group: "selections" },
  { id: 58, name: "Qualifications Mondial (Europe)", group: "selections" },
  { id: 60, name: "Qualifications Mondial (Afrique)", group: "selections" },
  { id: 27, name: "Coupe du monde 2026", group: "selections" },
  { id: 53, name: "Botola Pro (Maroc)", group: "maroc" },
  { id: 11, name: "Süper Lig (Turquie)", group: "turquie" },
];

export const DEFAULT_COMPETITION_IDS: number[] = FOOTBALL_COMPETITIONS.map((c) => c.id);

// ── Lecture de la réponse ───────────────────────────────────────────────────

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x : null;
}
function asNumber(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export function mapStatus(raw: unknown): FootballStatus {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s === "notstarted") return "notstarted";
  if (s === "inprogress" || s === "live") return "inprogress";
  if (s === "finished" || s === "ended") return "finished";
  if (s === "postponed") return "postponed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "other";
}

/**
 * Accepte la réponse paginée (`{ results: [...] }`) ou la liste seule. Ne garde
 * que les matchs exploitables (identifiant, deux équipes, compétition, date
 * valide) : le reste est ignoré sans planter.
 */
export function parseBzzoiroEvents(raw: unknown): FootballMatch[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results)
      ? ((raw as { results: unknown[] }).results as unknown[])
      : [];
  const out: FootballMatch[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    const league = e.league as Record<string, unknown> | undefined;
    const id = asNumber(e.id);
    const home = asString(e.home_team);
    const away = asString(e.away_team);
    const date = asString(e.event_date);
    const leagueId = league ? asNumber(league.id) : null;
    const leagueName = league ? asString(league.name) : null;
    if (id == null || !home || !away || !date || leagueId == null || !leagueName) continue;
    if (Number.isNaN(Date.parse(date))) continue;

    const homeObj = (e.home_team_obj ?? null) as Record<string, unknown> | null;
    const awayObj = (e.away_team_obj ?? null) as Record<string, unknown> | null;
    const v = e.venue && typeof e.venue === "object" ? (e.venue as Record<string, unknown>) : null;

    out.push({
      id,
      competitionId: leagueId,
      competition: leagueName,
      competitionCountry: asString(league?.country),
      isWomen: league?.is_women === true,
      home,
      away,
      homeId: homeObj ? asNumber(homeObj.id) : null,
      awayId: awayObj ? asNumber(awayObj.id) : null,
      homeCountry: homeObj ? asString(homeObj.country) : null,
      awayCountry: awayObj ? asString(awayObj.country) : null,
      kickoffUtc: date,
      status: mapStatus(e.status),
      round: asNumber(e.round_number),
      isLocalDerby: e.is_local_derby === true,
      venue: v
        ? {
            name: asString(v.name),
            city: asString(v.city),
            country: asString(v.country),
            capacity: asNumber(v.capacity),
            lat: asNumber(v.latitude),
            lng: asNumber(v.longitude),
          }
        : null,
    });
  }
  return out;
}

// ── Heure de Bruxelles ──────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const BRUSSELS_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

/** Instant (ISO UTC ou Date) → jour et heure à Bruxelles, changement d'heure compris. */
export function brusselsTime(instant: string | Date): BrusselsTime {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p: Record<string, string> = {};
  for (const part of BRUSSELS_FORMAT.formatToParts(d)) p[part.type] = part.value;
  const hour = Number(p.hour);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    hour,
    weekday: WEEKDAYS[p.weekday] ?? 0,
  };
}

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

// ── Rapprochement des équipes ───────────────────────────────────────────────

/** Minuscules, sans accents, ponctuation → espaces : « Türkiye » = « turkiye ». */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Les noms d'équipes de l'API sont en anglais (« Türkiye », « Belgium »). Un
// restaurateur écrit « Turquie » ou « Maroc » : on ramène à la forme de l'API.
const NAME_ALIASES: Record<string, string> = {
  turkey: "turkiye",
  turquie: "turkiye",
  turkije: "turkiye",
  maroc: "morocco",
  marokko: "morocco",
  belgique: "belgium",
  belgie: "belgium",
  belgien: "belgium",
  algerie: "algeria",
  algerije: "algeria",
  tunisie: "tunisia",
  tunesie: "tunisia",
  "pays bas": "netherlands",
  nederland: "netherlands",
  allemagne: "germany",
  duitsland: "germany",
  espagne: "spain",
  spanje: "spain",
  italie: "italy",
  angleterre: "england",
  engeland: "england",
};

function canonical(name: string): string {
  const n = normalizeName(name);
  return NAME_ALIASES[n] ?? n;
}

// Équipes de jeunes et équipes féminines : « Belgium U21 » n'est pas « Belgium ».
// On ne les écarte que si le restaurateur n'a pas lui-même écrit « U21 » ou « women ».
const YOUTH_OR_WOMEN = /^(u\d{2}|women|feminin|feminines|w)$/;

/** Les mots du nom suivi sont tous dans le nom de l'équipe (« Anderlecht » ⊂ « RSC Anderlecht »). */
export function teamMatches(followed: string, teamName: string): boolean {
  const f = canonical(followed).split(" ").filter(Boolean);
  if (f.length === 0) return false;
  const t = normalizeName(teamName).split(" ").filter(Boolean);
  if (!f.every((w) => t.includes(w))) return false;
  const followsYouth = f.some((w) => YOUTH_OR_WOMEN.test(w));
  if (!followsYouth && t.some((w) => YOUTH_OR_WOMEN.test(w))) return false;
  return true;
}

// ── Sélection pour un établissement ─────────────────────────────────────────

export type FootballSelectionInput = {
  matches: FootballMatch[];
  /** Jour calendaire à Bruxelles, AAAA-MM-JJ (injecté). */
  today: string;
  /** Jours d'anticipation (défaut 14). */
  horizonDays?: number;
  /** Équipes suivies par l'établissement, saisies librement (« Anderlecht », « Belgique », « Maroc »…). */
  followedTeams: string[];
  /** Compétitions suivies, par identifiant (FOOTBALL_COMPETITIONS). */
  followedCompetitionIds: number[];
  /** Football féminin : écarté par défaut. */
  includeWomen?: boolean;
};

export type FollowReason = "equipe" | "competition";

export type FollowedMatch = {
  match: FootballMatch;
  brussels: BrusselsTime;
  /** Jours entre aujourd'hui et le match, à Bruxelles (0 = aujourd'hui). */
  daysUntil: number;
  reasons: FollowReason[];
  /** Équipes suivies qui jouent ce match (noms tels que saisis). */
  followedTeamsPlaying: string[];
};

export const DEFAULT_HORIZON_DAYS = 14;

/**
 * Matchs à venir (non commencés ou en cours) qui concernent l'établissement,
 * dans l'horizon. Les matchs reportés ou annulés sont écartés. Triés par
 * coup d'envoi. Un match suivi pour deux raisons n'apparaît qu'une fois.
 */
export function selectFollowedMatches(input: FootballSelectionInput): FollowedMatch[] {
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = dayNumber(input.today);
  const followedCompetitions = new Set(input.followedCompetitionIds);
  const followed = input.followedTeams.map((t) => t.trim()).filter(Boolean);
  const out: FollowedMatch[] = [];

  for (const m of input.matches) {
    if (m.status !== "notstarted" && m.status !== "inprogress") continue;
    if (m.isWomen && !input.includeWomen) continue;

    const brussels = brusselsTime(m.kickoffUtc);
    const daysUntil = dayNumber(brussels.date) - today;
    if (daysUntil < 0 || daysUntil > horizon) continue;

    const playing = followed.filter((f) => teamMatches(f, m.home) || teamMatches(f, m.away));
    const reasons: FollowReason[] = [];
    if (playing.length > 0) reasons.push("equipe");
    if (followedCompetitions.has(m.competitionId)) reasons.push("competition");
    if (reasons.length === 0) continue;

    out.push({ match: m, brussels, daysUntil, reasons, followedTeamsPlaying: playing });
  }

  return out.sort((a, b) => a.match.kickoffUtc.localeCompare(b.match.kickoffUtc) || a.match.id - b.match.id);
}
