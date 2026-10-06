import { test } from "node:test";
import assert from "node:assert/strict";
import irailFixture from "./transport-irail.fixture.json";
import stibFixture from "./transport-stib.fixture.json";
import {
  addDays,
  hintCovers,
  parseDateHints,
  parseIrailDisturbances,
  parseStibMessages,
  selectTransportNotices,
  severityOf,
  type TransportNotice,
} from "./transport";

// Vrais avis lus le 2026-10-06 (iRail : 5, STIB : 12).
const TODAY = "2026-10-06";
const irail = parseIrailDisturbances(irailFixture, TODAY);
const stib = parseStibMessages(stibFixture, TODAY);
const all = [...irail, ...stib];

const hints = (text: string, today = TODAY) => parseDateHints(text, today);

test("lecture iRail : cinq avis de travaux, tronçon en titre, publication en ISO", () => {
  assert.equal(irail.length, 5);
  assert.ok(irail.every((n) => n.source === "iRail".toLowerCase() && n.kind === "travaux"));
  const jette = irail.find((n) => n.title === "Jette - Bruxelles-Midi")!;
  assert.match(jette.text, /Bockstael/);
  assert.match(jette.publishedAt!, /^2026-10-0\dT/);
});

test("lecture STIB : douze avis, lignes et arrêts décodés depuis les chaînes JSON", () => {
  assert.equal(stib.length, 12);
  const first = stib[0];
  assert.equal(first.kind, "evenement");
  assert.deepEqual(first.lines, ["43"]);
  assert.deepEqual(first.stopIds, ["1935"]);
  assert.match(first.text, /arrêt supprimé/);
  assert.ok(stib.some((n) => n.kind === "travaux"));
});

test("lecture : réponses inexploitables ignorées sans planter", () => {
  assert.deepEqual(parseIrailDisturbances(null, TODAY), []);
  assert.deepEqual(parseIrailDisturbances({ disturbance: [null, { id: 1 }, "x"] }, TODAY), []);
  assert.deepEqual(parseStibMessages({ results: [{ id: "1", content: "pas du json" }] }, TODAY), []);
  assert.deepEqual(parseStibMessages({ totalCount: 0 }, TODAY), []);
});

test("gravité : coupure, adaptation, information", () => {
  assert.equal(severityOf("Aucun train ne s'arrête à Bockstael.", "travaux"), "coupure");
  assert.equal(severityOf("Travaux. Arrêt supprimé. Prenez B43.", "travaux"), "coupure");
  assert.equal(severityOf("métro 6 remplacé par M-bus", "travaux"), "coupure");
  assert.equal(severityOf("bus 13 dévié entre A et B", "travaux"), "adaptation");
  assert.equal(severityOf("L'heure de départ de certains trains est adaptée.", "travaux"), "adaptation");
  assert.equal(severityOf("Passages de 04:26 depuis l'arrêt du bus 59.", "information"), "information");
  assert.equal(severityOf("n'importe quoi", "greve"), "coupure"); // une grève est toujours une coupure
});

test("grève : détectée dans le texte, quelle que soit la source", () => {
  const n = parseIrailDisturbances({ disturbance: [{ id: "9", title: "National", description: "Grève nationale : aucun train.", type: "disturbance", timestamp: "1791194617" }] }, TODAY);
  assert.equal(n[0].kind, "greve");
  assert.equal(n[0].severity, "coupure");
  const s = parseStibMessages({ results: [{ id: "8", content: JSON.stringify([{ text: [{ fr: "Actions syndicales : réseau perturbé." }] }]), lines: "[]", points: "[]", priority: 4 }] }, TODAY);
  assert.equal(s[0].kind, "greve");
});

test("dates : période, week-end, jour unique", () => {
  assert.deepEqual(hints("Le week-end du 10-11/10, Infrabel effectue des travaux."), [
    { from: "2026-10-10", to: "2026-10-11", weekendsOnly: false, approximate: false },
  ]);
  assert.deepEqual(hints("Les week-ends, du 17/10 au 15/11, Infrabel effectue des travaux."), [
    { from: "2026-10-17", to: "2026-11-15", weekendsOnly: true, approximate: false },
  ]);
  assert.deepEqual(hints("Le jeudi 08/10, Infrabel effectue des travaux."), [
    { from: "2026-10-08", to: "2026-10-08", weekendsOnly: false, approximate: false },
  ]);
});

test("dates : plusieurs périodes dans un même avis", () => {
  const h = hints("Les week-ends, du 12/09 au 25/10, travaux. Le week-end du 26-27/09, tous les trains sont remplacés par des bus.");
  assert.equal(h.length, 2);
  assert.deepEqual(h[0], { from: "2026-09-12", to: "2026-10-25", weekendsOnly: true, approximate: false });
  assert.deepEqual(h[1], { from: "2026-09-26", to: "2026-09-27", weekendsOnly: false, approximate: false });
});

test("dates : durée écrite, fin de mois, fin d'année, début sans fin, « jusqu'en »", () => {
  assert.deepEqual(hints("Travaux. Du 29/9 pour +/- 2 semaines, bus 13 dévié."), [
    { from: "2026-09-29", to: "2026-10-13", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. Du 27/4/26 à fin avril 2027, bus 50 reprend l'itinéraire du 52."), [
    { from: "2026-04-27", to: "2027-04-30", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. 27/4/26-fin 2027, arrêt non desservi par T51 81."), [
    { from: "2026-04-27", to: "2027-12-31", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. Dès le lundi 4/8, 6h, bus 47 dévié pendant +/- 2 mois."), [
    { from: "2026-08-04", to: "2026-10-04", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Dès le 6/6, T82 remplace T97."), [
    { from: "2026-06-06", to: null, weekendsOnly: false, approximate: false },
  ]);
  // « Jsq 2028 » + « dès le 6/6 » : une seule période, du 6 juin 2026 à fin 2028.
  assert.deepEqual(hints("Jsq 2028,travaux. Dès le 6/6, T82 remplace T97."), [
    { from: "2026-06-06", to: "2028-12-31", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. Jsq 2028, arrêt non desservi."), [
    { from: null, to: "2028-12-31", weekendsOnly: false, approximate: true },
  ]);
});

test("dates : « 5/10-16/10/26 » est du 5 au 16 octobre, pas « 10-16/10 » (cas réel, arrêt de Stockel)", () => {
  assert.deepEqual(hints("Travaux. 5/10-16/10/26 18h, arrêt déplacé chaussée de Stockel 438- 440."), [
    { from: "2026-10-05", to: "2026-10-16", weekendsOnly: false, approximate: false },
  ]);
  assert.deepEqual(hints("Travaux. 4/10-8/10, bus 12 dévié."), [
    { from: "2026-10-04", to: "2026-10-08", weekendsOnly: false, approximate: false },
  ]);
  // Début sans année qui passerait après la fin : de l'année précédente.
  assert.deepEqual(hints("Travaux. 28/12-3/1/27, métro fermé.", "2026-12-20"), [
    { from: "2026-12-28", to: "2027-01-03", weekendsOnly: false, approximate: false },
  ]);
  // Le tiret entre un jour et un mois seul reste un « 10-11/10 ».
  assert.deepEqual(hints("Travaux. 10-11/10, métro 6 remplacé par M-bus."), [
    { from: "2026-10-10", to: "2026-10-11", weekendsOnly: false, approximate: false },
  ]);
});

test("dates : fin donnée en mois ou en année, début sans année (cas réels de l'audit)", () => {
  const one = (t: string) => hints(t).map((h) => [h.from, h.to, h.approximate]);
  // L'année du début n'est pas écrite : c'est la dernière occurrence qui ne dépasse pas la fin.
  assert.deepEqual(one("Travaux. Du 19/1 à fin 2026, bus 53 dévié."), [["2026-01-19", "2026-12-31", true]]);
  assert.deepEqual(one("Travaux. Du 22/7 à +/- fin octobre 2026, B34 dévié."), [["2026-07-22", "2026-10-31", true]]);
  // Début avec année : pris tel quel.
  assert.deepEqual(one("Travaux. 27/4/26-fin avril 2027, T4 dévié."), [["2026-04-27", "2027-04-30", true]]);
  assert.deepEqual(one("Travaux. Du 11/5/26 à avril 2027, bus 87 dévié."), [["2026-05-11", "2027-04-30", true]]);
  // « à 10h » n'est pas une fin d'année ; début sans fin.
  assert.deepEqual(hints("Travaux. Dès le 7/10 à 10h, arrêt déplacé."), [
    { from: "2026-10-07", to: null, weekendsOnly: false, approximate: false },
  ]);
});

test("dates : « Jsq » avec un mois ou « fin » (cas réels : T51 interrompu)", () => {
  assert.deepEqual(hints("Travaux. Jsq décembre 2026, T51 interrompu entre MARGUERITE DURAS et BELGICA."), [
    { from: null, to: "2026-12-31", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. Jsq fin 2026, arrêt non desservi. T81 à GARE DU MIDI, bus 96: ch. Waterloo 208"), [
    { from: null, to: "2026-12-31", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. Jusqu’en 2028, bus 74 dévié."), [
    { from: null, to: "2028-12-31", weekendsOnly: false, approximate: true },
  ]);
  // « Jsq » suivi d'un mot qui n'est pas un mois : pas de date inventée.
  assert.deepEqual(hints("Travaux. Jsq nouvel ordre 2026, bus dévié."), []);
});

test("dates : dates écrites en toutes lettres (« 20 avril », « 5 octobre 2026 »), cas réels", () => {
  assert.deepEqual(hints("Travaux. Dès le lundi 20 avril, cet arrêt du B66 est déplacé."), [
    { from: "2026-04-20", to: null, weekendsOnly: false, approximate: false },
  ]);
  assert.deepEqual(hints("Travaux. A partir du 5 octobre 2026 pour environ 2 semaines, arrêt déplacé rue de la Consolation 107."), [
    { from: "2026-10-05", to: "2026-10-19", weekendsOnly: false, approximate: true },
  ]);
  assert.deepEqual(hints("Travaux. Jusque fin 2026, bus 54 dévié."), [
    { from: null, to: "2026-12-31", weekendsOnly: false, approximate: true },
  ]);
  // Sans année : l'occurrence la plus proche d'aujourd'hui (mai 2026 est à 158 jours, mai 2027 à 207).
  assert.deepEqual(hints("Travaux. Le 1er mai, tram 4 dévié."), [
    { from: "2026-05-01", to: "2026-05-01", weekendsOnly: false, approximate: false },
  ]);
  assert.deepEqual(hints("Travaux. Le 12 décembre, métro fermé.")[0].from, "2026-12-12");
  assert.deepEqual(hints("Travaux. Le 12 août, métro fermé.")[0].from, "2026-08-12");
});

test("dates : une heure entre la première date et le tiret ne casse pas la période", () => {
  assert.deepEqual(hints("Travaux. 24/8 5h- 9/10/26, arrêt supprimé. Prenez B59."), [
    { from: "2026-08-24", to: "2026-10-09", weekendsOnly: false, approximate: false },
  ]);
  // Une plage d'heures le même jour reste un jour seul.
  assert.deepEqual(hints("Travaux. 6/10 9h-17h, arrêt déplacé."), [
    { from: "2026-10-06", to: "2026-10-06", weekendsOnly: false, approximate: false },
  ]);
});

test("dates : « week-ends seulement » ne vaut que pour la période qu'il précède", () => {
  const h = hints("Tous les jours, du 31/10 au 8/11, Infrabel effectue des travaux. Le week-end du 7-8/11, tous les trains sont remplacés par des bus.");
  assert.equal(h.length, 2);
  assert.equal(h[0].weekendsOnly, false); // « tous les jours »
  assert.deepEqual([h[1].from, h[1].to, h[1].weekendsOnly], ["2026-11-07", "2026-11-08", false]);
});

test("dates : les heures ne sont jamais prises pour des dates", () => {
  assert.deepEqual(hints("Passages de 04:26 - 04: 55 - 05:42 - 06:03 - 14: 09 depuis l'arrêt du bus 59."), []);
  assert.deepEqual(hints("Événement. 11/10-17h30, arrêt supprimé."), [
    { from: "2026-10-11", to: "2026-10-11", weekendsOnly: false, approximate: false },
  ]);
  assert.deepEqual(hints("Lettres de créance. 7/10 de 9h30 à 13h, bus 38 71 déviés."), [
    { from: "2026-10-07", to: "2026-10-07", weekendsOnly: false, approximate: false },
  ]);
});

test("dates : l'année est celle de l'occurrence la plus proche d'aujourd'hui", () => {
  assert.equal(hints("Le 15/1, travaux.")[0].from, "2027-01-15");
  assert.equal(hints("Le 15/1, travaux.", "2027-01-20")[0].from, "2027-01-15");
  const nouvelAn = hints("Du 28/12 au 3/1, travaux.")[0];
  assert.deepEqual([nouvelAn.from, nouvelAn.to], ["2026-12-28", "2027-01-03"]);
  assert.deepEqual(hints("Le 31/02, travaux."), []);
});

test("hintCovers : bornes comprises, week-ends seulement, période ouverte", () => {
  const weekends = { from: "2026-10-17", to: "2026-11-15", weekendsOnly: true, approximate: false };
  assert.equal(hintCovers(weekends, "2026-10-17"), true); // samedi
  assert.equal(hintCovers(weekends, "2026-10-18"), true); // dimanche
  assert.equal(hintCovers(weekends, "2026-10-19"), false); // lundi
  assert.equal(hintCovers(weekends, "2026-11-16"), false); // après la fin
  const open = { from: "2026-06-06", to: null, weekendsOnly: false, approximate: false };
  assert.equal(hintCovers(open, "2026-10-06"), true);
  assert.equal(hintCovers(open, "2026-06-05"), false);
});

test("sélection : « Bockstael » — gare fermée et métro remplacé ce week-end, les deux en coupure", () => {
  const out = selectTransportNotices({ notices: all, today: TODAY, keywords: ["Bockstael"] });
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.notice.severity === "coupure"));
  assert.deepEqual(new Set(out.map((o) => o.notice.source)), new Set(["irail", "stib"]));
  assert.deepEqual(out[0].window, { from: "2026-10-10", to: "2026-10-11" });
  assert.equal(out[0].startsInDays, 4);
  assert.equal(out[0].activeToday, false);
  assert.equal(out[0].longRunning, false);
  assert.deepEqual(out[0].matchedKeywords, ["Bockstael"]);
});

test("sélection : hors fenêtre, rien — le week-end du 10 est à 4 jours, pas à 3", () => {
  assert.equal(selectTransportNotices({ notices: all, today: TODAY, keywords: ["Bockstael"], horizonDays: 3 }).length, 0);
  assert.equal(selectTransportNotices({ notices: all, today: TODAY, keywords: ["Bockstael"], horizonDays: 4 }).length, 2);
});

test("sélection : un chantier terminé n'est plus proposé", () => {
  // « Dès le lundi 4/8 … pendant +/- 2 mois » finit le 4 octobre.
  assert.equal(selectTransportNotices({ notices: all, today: TODAY, keywords: ["Teniersstraat"] }).length, 0);
});

test("sélection : un avis sans date lisible est écarté, sauf grève ou perturbation iRail récente", () => {
  assert.equal(selectTransportNotices({ notices: all, today: TODAY, keywords: ["Etterbeek"] }).length, 0);

  const strike: TransportNotice = { ...stib[0], id: "stib:greve", kind: "greve", severity: "coupure", text: "Grève nationale : réseau bruxellois perturbé.", dates: [] };
  const s = selectTransportNotices({ notices: [strike], today: TODAY, keywords: ["bruxellois"] });
  assert.equal(s.length, 1);
  assert.equal(s[0].datesKnown, false);
  assert.equal(s[0].window, null);

  const recent: TransportNotice = { ...irail[0], id: "irail:live", kind: "perturbation", text: "Panne de signalisation à Bockstael.", dates: [], publishedAt: "2026-10-05T08:00:00.000Z" };
  assert.equal(selectTransportNotices({ notices: [recent], today: TODAY, keywords: ["Bockstael"] }).length, 1);
  const old: TransportNotice = { ...recent, publishedAt: "2026-09-20T08:00:00.000Z" };
  assert.equal(selectTransportNotices({ notices: [old], today: TODAY, keywords: ["Bockstael"] }).length, 0);
});

test("sélection : un chantier de fond est marqué et passe après les événements", () => {
  // « Dès le 6/6, T82 remplace T97 entre CARR. STALLE et DIEWEG » : commencé en juin, sans fin écrite.
  const out = selectTransportNotices({ notices: all, today: TODAY, keywords: ["Stalle"] });
  assert.ok(out.length >= 1);
  assert.ok(out.every((o) => o.longRunning));
  assert.ok(out.some((o) => o.activeToday));
});

test("sélection : « week-ends seulement » — vendredi oui, lundi non", () => {
  const kw = ["Schellebelle"];
  const fri = selectTransportNotices({ notices: all, today: "2026-10-16", keywords: kw, horizonDays: 3 });
  assert.equal(fri.length, 1);
  assert.equal(fri[0].startsInDays, 1); // samedi 17
  assert.equal(selectTransportNotices({ notices: all, today: "2026-10-19", keywords: kw, horizonDays: 3 }).length, 0);
});

test("sélection : accents et casse neutralisés, plusieurs mots-clés, aucun mot-clé = rien", () => {
  const out = selectTransportNotices({ notices: all, today: TODAY, keywords: ["simonis", "Gare Centrale"], horizonDays: 7 });
  assert.ok(out.length >= 2);
  assert.ok(out.every((o) => o.matchedKeywords.length > 0));
  assert.deepEqual(selectTransportNotices({ notices: all, today: TODAY, keywords: [] }), []);
  assert.deepEqual(selectTransportNotices({ notices: all, today: TODAY, keywords: ["  "] }), []);
});

test("addDays : franchit les mois et les années", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-10-06", -200), "2026-03-20");
});
