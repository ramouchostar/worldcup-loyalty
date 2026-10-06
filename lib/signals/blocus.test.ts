import { test } from "node:test";
import assert from "node:assert/strict";
import { readBlocusSignals, isBlocusActive, normalizeText, type ExamSessionRow } from "./blocus";

const ROWS: ExamSessionRow[] = [
  { institution: "ULB", city: "Bruxelles", phase: "blocus", starts_on: "2026-11-30", ends_on: "2026-12-13", label: "Blocus de janvier (ULB)" },
  { institution: "ULB", city: "Bruxelles", phase: "examens", starts_on: "2026-12-14", ends_on: "2027-01-03", label: "Session de janvier (ULB)" },
  { institution: "VUB", city: "Bruxelles", phase: "examens", starts_on: "2027-01-04", ends_on: "2027-01-30", label: "Examens de janvier (VUB)" },
  { institution: "UCLouvain", city: "Louvain-la-Neuve", phase: "blocus", starts_on: "2026-12-20", ends_on: "2027-01-03", label: "Blocus (UCLouvain)" },
  { institution: "UCLouvain", city: "Bruxelles", phase: "blocus", starts_on: "2026-12-20", ends_on: "2027-01-03", label: "Blocus (UCLouvain)" },
  { institution: "KU Leuven", city: "Leuven", phase: "blocus", starts_on: "2027-01-04", ends_on: "2027-01-10", label: "Blocus (KU Leuven)" },
];

const base = { sector: null, schoolCommunityNames: [] as string[], rows: ROWS };

test("normalizeText : accents, casse et tirets neutralisés", () => {
  assert.equal(normalizeText("Saint-Gilles"), "saint gilles");
  assert.equal(normalizeText("  Étterbeek "), "etterbeek");
});

test("secteur dans la commune d'un campus : blocus en cours", () => {
  const out = readBlocusSignals({ ...base, today: "2026-12-05", sector: "Ixelles" });
  // Le blocus est en cours ; la session d'examens, 9 jours plus loin, est à venir.
  assert.deepEqual(out.map((s) => `${s.institution}:${s.phase}:${s.status}`), ["ULB:blocus:en_cours", "ULB:examens:a_venir"]);
  assert.equal(out[0].daysLeft, 9); // 5 → 13 déc., jour courant compris
  assert.deepEqual(out[0].matchedBy, ["secteur"]);
  assert.equal(isBlocusActive(out), true);
});

test("secteur éloigné de tout campus et sans équipe : aucun signal", () => {
  assert.deepEqual(readBlocusSignals({ ...base, today: "2026-12-05", sector: "Namur" }), []);
  assert.deepEqual(readBlocusSignals({ ...base, today: "2026-12-05", sector: null }), []);
});

test("équipe école citant l'université : concerné quel que soit le secteur", () => {
  const out = readBlocusSignals({ ...base, today: "2026-12-05", sector: "Kraainem", schoolCommunityNames: ["Étudiants ULB"] });
  assert.ok(out.length > 0);
  assert.ok(out.every((s) => s.institution === "ULB" && s.matchedBy.join() === "equipe"));
});

test("équipe et secteur se cumulent", () => {
  const out = readBlocusSignals({ ...base, today: "2026-12-05", sector: "Ixelles", schoolCommunityNames: ["ULB"] });
  assert.deepEqual(out[0].matchedBy, ["equipe", "secteur"]);
});

test("« ucl » en mot entier seulement : « bulle » ne compte pas", () => {
  assert.deepEqual(readBlocusSignals({ ...base, today: "2026-12-22", schoolCommunityNames: ["Bulle de quartier"] }), []);
  const out = readBlocusSignals({ ...base, today: "2026-12-22", schoolCommunityNames: ["UCL Woluwe"] });
  assert.equal(out[0].institution, "UCLouvain");
});

test("période à venir dans l'horizon, ignorée au-delà", () => {
  const soon = readBlocusSignals({ ...base, today: "2026-11-20", sector: "Ixelles" });
  assert.equal(soon[0].status, "a_venir");
  assert.equal(soon[0].daysUntilStart, 10);
  assert.equal(soon[0].daysLeft, null);
  assert.equal(isBlocusActive(soon), false);
  assert.deepEqual(readBlocusSignals({ ...base, today: "2026-11-01", sector: "Ixelles" }), []);
  assert.equal(readBlocusSignals({ ...base, today: "2026-11-01", sector: "Ixelles", horizonDays: 30 }).length, 1);
});

test("bornes inclusives : premier et dernier jour comptent, lendemain non", () => {
  assert.equal(readBlocusSignals({ ...base, today: "2026-11-30", sector: "Ixelles" })[0].status, "en_cours");
  assert.equal(readBlocusSignals({ ...base, today: "2026-12-13", sector: "Ixelles" })[0].daysLeft, 1);
  // 14 déc. : le blocus est fini, la session commence.
  assert.equal(readBlocusSignals({ ...base, today: "2026-12-14", sector: "Ixelles" })[0].phase, "examens");
});

test("Louvain-la-Neuve n'est pas Leuven, et Louvain seul est Leuven", () => {
  const lln = readBlocusSignals({ ...base, today: "2026-12-22", sector: "Louvain-la-Neuve" });
  assert.deepEqual(lln.map((s) => s.institution), ["UCLouvain"]);
  const leuven = readBlocusSignals({ ...base, today: "2026-12-22", sector: "Louvain" });
  assert.deepEqual(leuven.map((s) => s.institution), ["KU Leuven"]);
});

test("deux campus de la même université : une seule ligne, raisons cumulées", () => {
  const out = readBlocusSignals({ ...base, today: "2026-12-22", sector: "Woluwe", schoolCommunityNames: ["UCLouvain"] });
  const ucl = out.filter((s) => s.institution === "UCLouvain");
  assert.equal(ucl.length, 1);
  assert.deepEqual(ucl[0].matchedBy, ["equipe", "secteur"]);
});

test("tri : en cours avant à venir, puis par début, blocus avant examens", () => {
  const out = readBlocusSignals({ ...base, today: "2026-12-14", sector: "Ixelles", schoolCommunityNames: ["VUB"], horizonDays: 30 });
  assert.deepEqual(
    out.map((s) => `${s.institution}:${s.phase}:${s.status}`),
    ["ULB:examens:en_cours", "UCLouvain:blocus:a_venir", "VUB:examens:a_venir"]
  );
});

// ── Hautes écoles ──────────────────────────────────────────────────────────

const HE_ROWS: ExamSessionRow[] = [
  { institution: "Haute École Léonard de Vinci", city: "Bruxelles", phase: "examens", starts_on: "2027-01-04", ends_on: "2027-01-23", label: "Session de janvier (HE Vinci)" },
  { institution: "EPHEC", city: "Bruxelles", phase: "examens", starts_on: "2027-01-11", ends_on: "2027-01-31", label: "Examens de janvier (EPHEC)" },
  { institution: "HE2B", city: "Bruxelles", phase: "examens", starts_on: "2027-01-04", ends_on: "2027-01-31", label: "Évaluations de janvier (HE2B)" },
  { institution: "EHB", city: "Bruxelles", phase: "examens", starts_on: "2027-01-04", ends_on: "2027-01-29", label: "Examens de janvier (EHB)" },
];
const he = { sector: null, rows: HE_ROWS, today: "2027-01-12" };

test("hautes écoles : « Haute École Léonard de Vinci » et « Parnasse-ISEI » désignent Vinci", () => {
  for (const name of ["Haute École Léonard de Vinci", "Parnasse-ISEI", "ECAM"]) {
    const out = readBlocusSignals({ ...he, schoolCommunityNames: [name] });
    assert.deepEqual(out.map((s) => s.institution), ["Haute École Léonard de Vinci"], name);
  }
});

test("hautes écoles : un lycée « Léonard de Vinci » n'est pas la haute école", () => {
  assert.deepEqual(readBlocusSignals({ ...he, schoolCommunityNames: ["Lycée Léonard de Vinci"] }), []);
  assert.deepEqual(readBlocusSignals({ ...he, schoolCommunityNames: ["Athénée Vinci"] }), []);
});

test("hautes écoles : EPHEC, HE2B et EHB reconnues par leur nom, « Erasmus » seul non", () => {
  assert.deepEqual(readBlocusSignals({ ...he, schoolCommunityNames: ["Étudiants EPHEC"] }).map((s) => s.institution), ["EPHEC"]);
  assert.deepEqual(readBlocusSignals({ ...he, schoolCommunityNames: ["HE2B Defré"] }).map((s) => s.institution), ["HE2B"]);
  assert.deepEqual(readBlocusSignals({ ...he, schoolCommunityNames: ["Erasmushogeschool"] }).map((s) => s.institution), ["EHB"]);
  assert.deepEqual(readBlocusSignals({ ...he, schoolCommunityNames: ["Erasmus Ixelles"] }), []);
});

test("hautes écoles : un secteur bruxellois les concerne toutes, avec la raison « secteur »", () => {
  const out = readBlocusSignals({ ...he, sector: "Etterbeek", schoolCommunityNames: [] });
  assert.equal(out.length, 4);
  assert.ok(out.every((s) => s.matchedBy.join() === "secteur"));
});
