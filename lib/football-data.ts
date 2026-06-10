// Client pour football-data.org v4 — WC2026
// Clé API gratuite : https://www.football-data.org/client/register

const BASE_URL = "https://api.football-data.org/v4";

// Statuts de match pertinents
export type MatchStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED"
  | "FINISHED" | "SUSPENDED" | "POSTPONED" | "CANCELLED";

export type MatchWinner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;

export type FDTeamRef = { id: number; name: string; tla: string };

export type FDMatch = {
  id: number;
  status: MatchStatus;
  stage: string;
  homeTeam: FDTeamRef;
  awayTeam: FDTeamRef;
  score: {
    winner: MatchWinner;
    fullTime: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null } | null;
  };
};

export type FDStandingRow = {
  position: number;
  team: FDTeamRef;
  points: number;
  goalDifference: number;
  goalsFor: number;
};

export type FDStanding = {
  stage: string;
  type: string;
  group: string;
  table: FDStandingRow[];
};

// ── Mapping TLA football-data.org → country_code dans notre DB ────────────
// football-data.org utilise des codes 3 lettres (TLA), notre DB utilise ISO 2 lettres
// sauf pour Angleterre (ENG) et Écosse (SCO) qui n'ont pas de code ISO officiel
export const TLA_TO_COUNTRY_CODE: Record<string, string> = {
  // UEFA
  'BEL': 'BE', 'FRA': 'FR', 'ESP': 'ES', 'POR': 'PT', 'GER': 'DE',
  'ENG': 'ENG', // Angleterre — country_code 'ENG' dans notre DB (non-ISO)
  'NED': 'NL',  'ITA': 'IT', 'CRO': 'HR', 'DEN': 'DK', 'SUI': 'CH',
  'POL': 'PL',  'SRB': 'RS', 'AUT': 'AT', 'TUR': 'TR',
  'SCO': 'SCO', // Écosse — country_code 'SCO' dans notre DB (non-ISO)
  'HUN': 'HU',  'ALB': 'AL',
  // CAF
  'MAR': 'MA', 'ALG': 'DZ', 'SEN': 'SN', 'CMR': 'CM', 'TUN': 'TN',
  'NGA': 'NG', 'EGY': 'EG', 'MLI': 'ML', 'RSA': 'ZA', 'CIV': 'CI',
  // CONMEBOL
  'BRA': 'BR', 'ARG': 'AR', 'URU': 'UY', 'COL': 'CO', 'ECU': 'EC', 'VEN': 'VE',
  // CONCACAF
  'USA': 'US', 'MEX': 'MX', 'CAN': 'CA', 'PAN': 'PA', 'CRC': 'CR', 'HON': 'HN',
  // AFC
  'JPN': 'JP', 'KOR': 'KR', 'KSA': 'SA', 'IRN': 'IR', 'AUS': 'AU',
  'IRQ': 'IQ', 'JOR': 'JO', 'UZB': 'UZ',
  // OFC
  'NZL': 'NZ',
  // Barrages intercontinentaux
  'CHI': 'CL', 'IDN': 'ID',
};

// Depuis quel stage un team qui GAGNE avance-t-il, et vers quel round_reached ?
export const KNOCKOUT_STAGE_TO_NEXT_ROUND: Record<string, string> = {
  'ROUND_OF_32':    'round_of_16',
  'ROUND_OF_16':    'quarter_final',
  'QUARTER_FINALS': 'semi_final',
  'SEMI_FINALS':    'final',
  'FINAL':          'winner',
};

// ── Appels API ───────────────────────────────────────────────────────────────

function headers() {
  return { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY ?? "" };
}

export async function fetchWC2026Matches(): Promise<FDMatch[]> {
  const res = await fetch(`${BASE_URL}/competitions/WC/matches?season=2026`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org matches ${res.status}: ${body}`);
  }
  const data = await res.json();
  return (data.matches ?? []) as FDMatch[];
}

export async function fetchWC2026Standings(): Promise<FDStanding[]> {
  const res = await fetch(`${BASE_URL}/competitions/WC/standings?season=2026`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org standings ${res.status}: ${body}`);
  }
  const data = await res.json();
  return (data.standings ?? []) as FDStanding[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Retourne le country_code de notre DB depuis le TLA football-data.org,
// ou null si inconnu (à logger pour corriger le mapping)
export function tlaToCode(tla: string): string | null {
  return TLA_TO_COUNTRY_CODE[tla] ?? null;
}

// Calcule les 8 meilleures 3èmes places à partir des standings de groupes
// Critères FIFA : points > différence de buts > buts marqués > alphabétique TLA
export function getBest8ThirdPlace(standings: FDStanding[]): string[] {
  const groupStandings = standings.filter(s => s.stage === "GROUP_STAGE");
  const thirds: FDStandingRow[] = groupStandings
    .map(g => g.table.find(r => r.position === 3))
    .filter((r): r is FDStandingRow => r !== undefined);

  thirds.sort((a, b) => {
    if (b.points !== a.points)           return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor)       return b.goalsFor - a.goalsFor;
    return a.team.tla.localeCompare(b.team.tla);
  });

  return thirds.slice(0, 8).map(r => r.team.tla);
}
