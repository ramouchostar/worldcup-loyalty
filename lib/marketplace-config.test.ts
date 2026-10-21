import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SETTINGS_ISSUE_TEXT, bpsToPct, exampleBreakdown, pctToBps, termsFromRow, validateSettings } from "./marketplace-settings-rules";
import { BUDGET_ISSUE_TEXT, ambitionHint, budgetInputFrom, floorHint, formatsOf, validateBudgets } from "./marketplace-budgets-rules";
import { DEFAULT_TERMS } from "./mission-money";
import { VIDEO_TEMPLATE } from "./mission-brief";

const euros = (c: number) => `${c / 100} €`;

// ── pourcentages ──
test("« 12,5 » « 12.5 » « 12,5 % » valent 1 250 points de base ; le reste est refusé", () => {
  assert.equal(pctToBps("12,5"), 1250);
  assert.equal(pctToBps("12.5"), 1250);
  assert.equal(pctToBps(" 12,5 % "), 1250);
  assert.equal(pctToBps("5"), 500);
  assert.equal(pctToBps("0"), 0);
  assert.equal(pctToBps(""), null);
  assert.equal(pctToBps("douze"), null);
  assert.equal(pctToBps("-5"), null);
  assert.equal(pctToBps("12,555"), null); // deux décimales au plus
});

test("l'affichage revient à la saisie", () => {
  for (const b of [0, 500, 1250, 2000, 1275]) assert.equal(pctToBps(bpsToPct(b)), b, String(b));
  assert.equal(bpsToPct(1250), "12,5");
  assert.equal(bpsToPct(2000), "20");
});

// ── les trois réglages ──
const ok = { commissionPct: "12,5", proCommissionPct: "5", depositPct: "20" };

test("les valeurs de l'ADR sont valides et redonnent les valeurs par défaut", () => {
  const v = validateSettings(ok);
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.terms, DEFAULT_TERMS);
});

test("la commission, sa borne haute, le plan Pro jamais au-dessus, l'acompte jamais sous 20 %", () => {
  const issues = (over: Partial<typeof ok>) => {
    const v = validateSettings({ ...ok, ...over });
    return v.ok ? [] : v.issues;
  };
  assert.deepEqual(issues({ commissionPct: "abc" }), ["commission_invalid"]);
  assert.deepEqual(issues({ commissionPct: "55" }), ["commission_too_high"]);
  assert.deepEqual(issues({ proCommissionPct: "15" }), ["pro_above_standard"]);
  assert.deepEqual(issues({ proCommissionPct: "12,5" }), []); // égale : pas de remise, mais pas négative
  assert.deepEqual(issues({ depositPct: "10" }), ["deposit_too_low"]);
  assert.deepEqual(issues({ depositPct: "19,99" }), ["deposit_too_low"]);
  assert.deepEqual(issues({ depositPct: "20" }), []);
  assert.deepEqual(issues({ depositPct: "100" }), []);
  assert.deepEqual(issues({ depositPct: "101" }), ["deposit_invalid"]);
});

test("plusieurs erreurs sont toutes dites", () => {
  const v = validateSettings({ commissionPct: "x", proCommissionPct: "y", depositPct: "5" });
  assert.equal(v.ok, false);
  if (!v.ok) assert.deepEqual(v.issues.sort(), ["commission_invalid", "deposit_too_low", "pro_invalid"]);
});

test("chaque motif a sa phrase", () => {
  for (const k of ["commission_invalid", "commission_too_high", "pro_invalid", "pro_above_standard", "deposit_invalid", "deposit_too_low"] as const) assert.ok(SETTINGS_ISSUE_TEXT[k].length > 15, k);
});

test("une ligne de base incohérente n'est JAMAIS appliquée : on retombe sur l'ADR", () => {
  assert.deepEqual(termsFromRow(null), { terms: DEFAULT_TERMS, source: "defaut" });
  assert.deepEqual(termsFromRow({ commission_bps: 1000, pro_commission_bps: 300, deposit_bps: 3000 }), { terms: { commissionBps: 1000, proCommissionBps: 300, depositBps: 3000 }, source: "base" });
  assert.equal(termsFromRow({ commission_bps: 1000, pro_commission_bps: 2000, deposit_bps: 3000 }).source, "defaut"); // Pro au-dessus
  assert.equal(termsFromRow({ commission_bps: 1000, pro_commission_bps: 300, deposit_bps: 500 }).source, "defaut"); // acompte sous 20 %
});

test("l'exemple sur 1 000 € : le prestataire reçoit 875 €, le Pro paie 925 € et Boosteats garde 50 €", () => {
  assert.deepEqual(exampleBreakdown(DEFAULT_TERMS), { provider: 87_500, standardPays: 100_000, proPays: 92_500, platformStandard: 12_500, platformPro: 5_000 });
  assert.equal(exampleBreakdown({ commissionBps: 1000, proCommissionBps: 1000, depositBps: 2000 }).proPays, 100_000); // pas de remise
});

// ── budgets ──
const formats = formatsOf(VIDEO_TEMPLATE);

test("les formats viennent du modèle de questions, pas d'une seconde liste", () => {
  assert.deepEqual(formats, ["Reels", "Film", "Pack mois", "Face cam"]);
});

test("un plancher et des seuils valides ; vide = pas de seuil", () => {
  assert.deepEqual(validateBudgets({ floorEuros: "400", ambitionEuros: { Reels: "600", Film: "1 500", "Pack mois": "", "Face cam": "" } }, formats), { ok: true, floorCents: 40_000, ambitionCents: { Reels: 60_000, Film: 150_000 } });
  assert.deepEqual(validateBudgets({ floorEuros: "", ambitionEuros: {} }, formats), { ok: true, floorCents: null, ambitionCents: {} });
});

test("montant illisible, nul, négatif ou énorme : refusé avec son champ", () => {
  const issues = (floorEuros: string, ambitionEuros: Record<string, string> = {}) => {
    const v = validateBudgets({ floorEuros, ambitionEuros }, formats);
    return v.ok ? [] : v.issues;
  };
  assert.deepEqual(issues("beaucoup"), [{ field: "floor", code: "invalid" }]);
  assert.deepEqual(issues("0"), [{ field: "floor", code: "invalid" }]);
  assert.deepEqual(issues("-50"), [{ field: "floor", code: "invalid" }]);
  assert.deepEqual(issues("200000"), [{ field: "floor", code: "too_high" }]);
  assert.deepEqual(issues("", { Film: "n'importe quoi" }), [{ field: "Film", code: "invalid" }]);
});

test("un seuil d'ambition sous le plancher est refusé : il ne signalerait jamais rien", () => {
  const v = validateBudgets({ floorEuros: "400", ambitionEuros: { Reels: "300" } }, formats);
  assert.deepEqual(v, { ok: false, issues: [{ field: "Reels", code: "below_floor" }] });
});

test("un format inconnu envoyé par le réseau est ignoré", () => {
  const v = validateBudgets({ floorEuros: "", ambitionEuros: { Hologramme: "999" } }, formats);
  assert.deepEqual(v, { ok: true, floorCents: null, ambitionCents: {} });
});

test("la saisie revient telle qu'enregistrée", () => {
  const input = budgetInputFrom(40_000, { Reels: 60_000, Film: 150_050 }, formats);
  assert.deepEqual(input, { floorEuros: "400", ambitionEuros: { Reels: "600", Film: "1500,50", "Pack mois": "", "Face cam": "" } });
  assert.deepEqual(budgetInputFrom(null, null, formats).floorEuros, "");
});

test("les phrases que lit le restaurateur", () => {
  assert.equal(floorHint(40_000, euros), "Budget minimum pour ce service : 400 €.");
  assert.equal(floorHint(undefined, euros), null);
  assert.match(ambitionHint("Film", euros, 150_000), /« Film » demande en général au moins 1500 €/);
  assert.match(ambitionHint("Film", euros, 150_000), /Tu peux envoyer ton brief tel quel/);
  for (const k of ["invalid", "too_high", "below_floor"] as const) assert.ok(BUDGET_ISSUE_TEXT[k].length > 15, k);
});

test("les budgets se règlent pour chaque métier : plancher seul là où il n'y a pas de formats", async () => {
  const { defaultTemplate } = await import("./mission-brief");
  const { formatsOf, validateBudgets } = await import("./marketplace-budgets-rules");
  assert.deepEqual(formatsOf(defaultTemplate("video")!), ["Reels", "Film", "Pack mois", "Face cam"]);
  for (const m of ["photo", "design", "impression"] as const) {
    const t = defaultTemplate(m);
    assert.ok(t, m);
    assert.deepEqual(formatsOf(t), [], m);
    const v = validateBudgets({ floorEuros: "250", ambitionEuros: {} }, formatsOf(t));
    assert.deepEqual(v, { ok: true, floorCents: 25_000, ambitionCents: {} }, m);
  }
});

test("l'action des budgets exige un métier connu et enregistre le métier demandé, pas toujours la vidéo", () => {
  const ACTIONS = readFileSync("app/platform/prestataires/actions.ts", "utf8");
  assert.match(ACTIONS, /saveBudgetsAction\(metier: Metier,/);
  assert.match(ACTIONS, /saveBudgetConfig\(metier, v\.floorCents/);
  assert.doesNotMatch(ACTIONS, /saveBudgetConfig\("video"/);
});
