import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./football.fixture.json";
import {
  brusselsTime,
  mapStatus,
  normalizeName,
  parseBzzoiroEvents,
  selectFollowedMatches,
  teamMatches,
  FOOTBALL_COMPETITIONS,
  type FootballMatch,
} from "./football";

// Réponse réelle de Bzzoiro Sports Data lue le 2026-10-06 (champs utiles seulement).
const matches = parseBzzoiroEvents(fixture);
const byId = (id: number) => matches.find((m) => m.id === id)!;
const CERCLE_ANDERLECHT = 212781;
const INTER_BRUGGE = 601040;
const TURKIYE_BELGIUM = 212687;
const BELGIUM_ITALY = 212717;

test("parseBzzoiroEvents : lit la réponse réelle, statuts compris", () => {
  assert.equal(matches.length, 10);
  assert.deepEqual([...new Set(matches.map((m) => m.status))].sort(), ["finished", "notstarted", "postponed"]);
  const m = byId(CERCLE_ANDERLECHT);
  assert.equal(m.competition, "Pro League");
  assert.equal(m.competitionId, 14);
  assert.equal(m.home, "Cercle Brugge");
  assert.equal(m.away, "RSC Anderlecht");
  assert.equal(m.venue?.city, "Bruges");
  assert.equal(typeof m.venue?.lat, "number");
  assert.equal(m.round, 8);
});

test("parseBzzoiroEvents : accepte la liste seule, ignore les entrées inexploitables", () => {
  assert.equal(parseBzzoiroEvents(fixture as unknown[]).length, 10);
  assert.deepEqual(parseBzzoiroEvents(null), []);
  assert.deepEqual(parseBzzoiroEvents({ error: true, status: 404 }), []);
  const bad = [
    { id: 1 },
    null,
    "x",
    { id: 2, home_team: "A", away_team: "B", event_date: "pas une date", league: { id: 1, name: "L" } },
    { id: 3, home_team: "A", away_team: "B", event_date: "2026-10-10T14:00:00Z" }, // sans compétition
  ];
  assert.deepEqual(parseBzzoiroEvents(bad), []);
});

test("mapStatus : statuts connus, le reste est « other »", () => {
  assert.equal(mapStatus("notstarted"), "notstarted");
  assert.equal(mapStatus("inprogress"), "inprogress");
  assert.equal(mapStatus("finished"), "finished");
  assert.equal(mapStatus("postponed"), "postponed");
  assert.equal(mapStatus("canceled"), "cancelled");
  assert.equal(mapStatus("abandoned"), "other");
  assert.equal(mapStatus(undefined), "other");
});

test("brusselsTime : heure d'été et heure d'hiver, sur de vrais coups d'envoi", () => {
  // Cercle – Anderlecht : 14:00 UTC le samedi 10 octobre (heure d'été) = 16:00.
  assert.deepEqual(brusselsTime(byId(CERCLE_ANDERLECHT).kickoffUtc), { date: "2026-10-10", time: "16:00", hour: 16, weekday: 6 });
  // Inter – Club Brugge : 19:00 UTC le mardi 13 octobre = 21:00.
  assert.equal(brusselsTime(byId(INTER_BRUGGE).kickoffUtc).time, "21:00");
  // Turquie – Belgique : 17:00 UTC le jeudi 12 novembre (heure d'hiver) = 18:00.
  assert.deepEqual(brusselsTime(byId(TURKIYE_BELGIUM).kickoffUtc), { date: "2026-11-12", time: "18:00", hour: 18, weekday: 4 });
  // Belgique – Italie : 19:45 UTC le dimanche 15 novembre = 20:45.
  assert.deepEqual(brusselsTime(byId(BELGIUM_ITALY).kickoffUtc), { date: "2026-11-15", time: "20:45", hour: 20, weekday: 7 });
});

test("brusselsTime : bascule d'heure du 25 octobre 2026 et passage de minuit", () => {
  assert.equal(brusselsTime("2026-10-25T00:30:00Z").time, "02:30"); // encore l'heure d'été (UTC+2)
  assert.equal(brusselsTime("2026-10-25T01:30:00Z").time, "02:30"); // heure d'hiver (UTC+1)
  assert.equal(brusselsTime("2026-10-26T18:45:00Z").time, "19:45");
  // 22:30 UTC le samedi = 00:30 le dimanche à Bruxelles : le jour change.
  assert.deepEqual(brusselsTime("2026-10-10T22:30:00Z"), { date: "2026-10-11", time: "00:30", hour: 0, weekday: 7 });
});

test("normalizeName : accents, casse, ponctuation", () => {
  assert.equal(normalizeName("Türkiye"), "turkiye");
  assert.equal(normalizeName("Royale Union Saint-Gilloise"), "royale union saint gilloise");
  assert.equal(normalizeName("  KAA   Gent "), "kaa gent");
});

test("teamMatches : un nom suivi se retrouve dans le nom complet de l'équipe", () => {
  assert.equal(teamMatches("Anderlecht", "RSC Anderlecht"), true);
  assert.equal(teamMatches("Union", "Royale Union Saint-Gilloise"), true);
  assert.equal(teamMatches("Club Brugge", "Club Brugge KV"), true);
  assert.equal(teamMatches("Club Brugge", "Cercle Brugge"), false);
  assert.equal(teamMatches("Inter", "Inter"), true);
  assert.equal(teamMatches("", "Inter"), false);
});

test("teamMatches : Turquie, Maroc, Belgique saisis en français, forme de l'API en anglais", () => {
  assert.equal(teamMatches("Turquie", "Türkiye"), true);
  assert.equal(teamMatches("Turkey", "Türkiye"), true);
  assert.equal(teamMatches("Belgique", "Belgium"), true);
  assert.equal(teamMatches("België", "Belgium"), true);
  assert.equal(teamMatches("Maroc", "Morocco"), true);
});

test("teamMatches : « Belgique » ne suit pas les moins de 21 ans ni les féminines", () => {
  assert.equal(teamMatches("Belgique", "Belgium U21"), false);
  assert.equal(teamMatches("Belgique", "Belgium Women"), false);
  assert.equal(teamMatches("Belgium U21", "Belgium U21"), true);
  assert.equal(teamMatches("Anderlecht", "RSCA Futures U23"), false);
});

test("sélection par équipe : Anderlecht, heure de Bruxelles et délai", () => {
  const out = selectFollowedMatches({ matches, today: "2026-10-06", followedTeams: ["Anderlecht"], followedCompetitionIds: [] });
  assert.deepEqual(out.map((o) => o.match.id), [CERCLE_ANDERLECHT]);
  assert.deepEqual(out[0].reasons, ["equipe"]);
  assert.deepEqual(out[0].followedTeamsPlaying, ["Anderlecht"]);
  assert.equal(out[0].brussels.time, "16:00");
  assert.equal(out[0].daysUntil, 4);
});

test("sélection par compétition : la Ligue des champions, sans équipe suivie", () => {
  const out = selectFollowedMatches({ matches, today: "2026-10-06", followedTeams: [], followedCompetitionIds: [7] });
  assert.deepEqual(out.map((o) => o.match.id), [INTER_BRUGGE]);
  assert.deepEqual(out[0].reasons, ["competition"]);
});

test("sélection : équipe ET compétition suivies = un seul match, deux raisons", () => {
  const out = selectFollowedMatches({ matches, today: "2026-10-06", followedTeams: ["Club Brugge"], followedCompetitionIds: [7] });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].reasons, ["equipe", "competition"]);
});

test("sélection : la Belgique en Nations League, triée par coup d'envoi", () => {
  const out = selectFollowedMatches({ matches, today: "2026-11-05", followedTeams: ["Belgique"], followedCompetitionIds: [] });
  assert.deepEqual(out.map((o) => `${o.match.home}-${o.match.away}@${o.brussels.time}`), ["Türkiye-Belgium@18:00", "Belgium-Italy@20:45"]);
});

test("sélection : un match terminé ou reporté n'est jamais proposé", () => {
  const out = selectFollowedMatches({ matches, today: "2026-08-01", horizonDays: 40, followedTeams: ["Club Brugge", "Gent"], followedCompetitionIds: [14] });
  assert.equal(out.length, 0);
  assert.ok(matches.some((m) => m.status === "finished") && matches.some((m) => m.status === "postponed"));
});

test("sélection : bornes de l'horizon incluses, la veille exclue", () => {
  const base = { matches, followedTeams: ["Anderlecht"], followedCompetitionIds: [] as number[] };
  assert.equal(selectFollowedMatches({ ...base, today: "2026-10-10" }).length, 1); // le jour même
  assert.equal(selectFollowedMatches({ ...base, today: "2026-10-11" }).length, 0); // la veille est passée
  assert.equal(selectFollowedMatches({ ...base, today: "2026-10-03", horizonDays: 7 }).length, 1); // dernier jour
  assert.equal(selectFollowedMatches({ ...base, today: "2026-10-02", horizonDays: 7 }).length, 0); // un jour de trop
});

test("sélection : le jour compte à Bruxelles, pas en UTC", () => {
  const late: FootballMatch = { ...byId(CERCLE_ANDERLECHT), id: 999, kickoffUtc: "2026-10-10T22:30:00Z" }; // dimanche 00:30 à Bruxelles
  const out = selectFollowedMatches({ matches: [late], today: "2026-10-11", followedTeams: ["Anderlecht"], followedCompetitionIds: [] });
  assert.equal(out.length, 1);
  assert.equal(out[0].daysUntil, 0);
  assert.equal(out[0].brussels.date, "2026-10-11");
});

test("sélection : football féminin écarté par défaut, accepté sur demande", () => {
  const women: FootballMatch = { ...byId(CERCLE_ANDERLECHT), id: 998, isWomen: true };
  const base = { matches: [women], today: "2026-10-06", followedTeams: ["Anderlecht"], followedCompetitionIds: [] as number[] };
  assert.equal(selectFollowedMatches(base).length, 0);
  assert.equal(selectFollowedMatches({ ...base, includeWomen: true }).length, 1);
});

test("sélection : rien de suivi, rien en sortie", () => {
  assert.deepEqual(selectFollowedMatches({ matches, today: "2026-10-06", followedTeams: [], followedCompetitionIds: [] }), []);
});

test("FOOTBALL_COMPETITIONS : identifiants uniques, Pro League et Ligue des champions présentes", () => {
  const ids = FOOTBALL_COMPETITIONS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(14) && ids.includes(7) && ids.includes(64));
});
