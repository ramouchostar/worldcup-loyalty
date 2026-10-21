import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORRECTIONS_AFTER_DAYS, REVIEW_AFTER_DAYS, REVIEW_AGAIN_AFTER_DAYS, STUDIO_KEYS, dueStudioReminders, reminderLabel, type StudioMission, type StudioProofLite } from "./mission-studio-reminders";
import { missionUpdateEmail } from "./email-templates/mission-update";

// Le jour souhaité est le mardi 10 novembre 2026 : J-6 = 4, J-3 = 7, J-2 = 8, J+1 = 11.
const D = "2026-11-10";
const NOW = (day: string) => new Date(`${day}T08:00:00Z`);
const m = (over: Partial<StudioMission> = {}): StudioMission => ({ id: "m1", metier: "design", status: "accepte", deadline: D, proofs: [], ...over });
const due = (mission: StudioMission, today: string, sent: string[] = [], now: Date = NOW(today)) => dueStudioReminders([mission], today, now, new Set(sent)).map((d) => `${d.key}:${d.audience}`);
const proof = (round: number, status: StudioProofLite["status"], createdAt: string, decidedAt: string | null = null): StudioProofLite => ({ round, status, createdAt, decidedAt });

test("devis accepté, rien commencé : le prestataire de J-6 à J-3, la plateforme dès J-2", () => {
  assert.deepEqual(due(m(), "2026-11-03"), []);
  assert.deepEqual(due(m(), "2026-11-04"), ["studio_start:provider"]);
  assert.deepEqual(due(m(), "2026-11-07"), ["studio_start:provider"]);
  assert.deepEqual(due(m(), "2026-11-08"), ["studio_start_late:platform"]);
  assert.deepEqual(due(m(), "2026-11-12"), ["studio_start_late:platform"]); // jamais perdu
});

test("en cours, rien livré : le prestataire à J-2, puis le retard prévient aussi la plateforme", () => {
  const p = m({ status: "production" });
  assert.deepEqual(due(p, "2026-11-07"), []);
  assert.deepEqual(due(p, "2026-11-08"), ["studio_deliver:provider"]);
  assert.deepEqual(due(p, "2026-11-10"), ["studio_deliver:provider"]);
  assert.deepEqual(due(p, "2026-11-11"), ["studio_overdue:provider", "studio_overdue:platform"]);
  assert.deepEqual(due(p, "2026-11-11", ["m1:studio_overdue:provider"]), ["studio_overdue:platform"]);
});

test("un rappel ne part jamais deux fois", () => {
  assert.deepEqual(due(m(), "2026-11-05", ["m1:studio_start:provider"]), []);
  assert.deepEqual(due(m({ status: "production" }), "2026-11-09", ["m1:studio_deliver:provider"]), []);
});

test("sans jour souhaité lisible, ou une fois livré, aucun rappel de délai", () => {
  assert.deepEqual(due(m({ deadline: null }), "2026-11-09"), []);
  assert.deepEqual(due(m({ deadline: "bientôt" }), "2026-11-09"), []);
  for (const status of ["livre", "retouche", "valide", "verse", "annule", "litige", "devis", "envoye"]) assert.deepEqual(due(m({ status }), "2026-11-12"), [], status);
});

// ── le bon à tirer ──
const print = (proofs: StudioProofLite[], over: Partial<StudioMission> = {}) => m({ metier: "impression", status: "production", deadline: "2026-12-30", proofs, ...over });

test("une épreuve sans réponse : le restaurateur à 2 jours, une seconde fois à 5 jours", () => {
  const sent = "2026-11-01T09:00:00Z";
  assert.deepEqual(due(print([proof(1, "proposed", sent)]), "2026-11-02", [], new Date("2026-11-02T09:00:00Z")), []); // 1 jour
  assert.deepEqual(due(print([proof(1, "proposed", sent)]), "2026-11-03", [], new Date("2026-11-03T09:00:00Z")), ["bat_review:restaurant"]);
  assert.deepEqual(due(print([proof(1, "proposed", sent)]), "2026-11-05", [], new Date("2026-11-05T08:59:00Z")), ["bat_review:restaurant"]);
  assert.deepEqual(due(print([proof(1, "proposed", sent)]), "2026-11-06", [], new Date("2026-11-06T09:00:00Z")), ["bat_review:restaurant", "bat_review_again:restaurant"]);
  assert.deepEqual(due(print([proof(1, "proposed", sent)]), "2026-11-06", ["m1:bat_review:restaurant"], new Date("2026-11-06T09:00:00Z")), ["bat_review_again:restaurant"]);
  assert.equal(REVIEW_AFTER_DAYS, 2);
  assert.equal(REVIEW_AGAIN_AFTER_DAYS, 5);
});

test("l'âge compte depuis la DERNIÈRE épreuve, pas la première", () => {
  const proofs = [proof(1, "corrections", "2026-10-20T09:00:00Z", "2026-10-21T09:00:00Z"), proof(2, "proposed", "2026-11-05T09:00:00Z")];
  assert.deepEqual(due(print(proofs), "2026-11-06", [], new Date("2026-11-06T09:00:00Z")), []);
  assert.deepEqual(due(print(proofs), "2026-11-07", [], new Date("2026-11-07T09:00:00Z")), ["bat_review:restaurant"]);
});

test("des corrections sans nouvelle épreuve : le prestataire à 2 jours", () => {
  const proofs = [proof(1, "corrections", "2026-11-01T09:00:00Z", "2026-11-02T09:00:00Z")];
  assert.deepEqual(due(print(proofs), "2026-11-03", [], new Date("2026-11-03T09:00:00Z")), []);
  assert.deepEqual(due(print(proofs), "2026-11-04", [], new Date("2026-11-04T09:00:00Z")), ["bat_corrections_due:provider"]);
  assert.equal(CORRECTIONS_AFTER_DAYS, 2);
  assert.deepEqual(due(print([proof(1, "corrections", "2026-11-01T09:00:00Z", null)]), "2026-12-01"), []); // pas de date de réponse : rien à mesurer
});

test("après la signature, plus aucun rappel de bon à tirer ; un graphiste n'en a jamais", () => {
  const signed = [proof(1, "signed", "2026-11-01T09:00:00Z", "2026-11-02T09:00:00Z")];
  assert.deepEqual(due(print(signed), "2026-11-20", [], new Date("2026-11-20T09:00:00Z")), []);
  assert.deepEqual(due(m({ status: "production", proofs: [proof(1, "proposed", "2026-10-01T09:00:00Z")] }), "2026-11-03", [], new Date("2026-11-03T09:00:00Z")), []); // design : pas de BAT
  assert.deepEqual(due(print([proof(1, "proposed", "2026-10-01T09:00:00Z")], { status: "accepte" }), "2026-11-03", [], new Date("2026-11-03T09:00:00Z")), []); // pas commencé : pas d'épreuve
});

test("l'impression en retard prévient aussi, comme le graphiste ; la signature ne l'excuse pas", () => {
  const signed = [proof(1, "signed", "2026-11-01T09:00:00Z", "2026-11-02T09:00:00Z")];
  assert.deepEqual(due(print(signed, { deadline: D }), "2026-11-11"), ["studio_overdue:provider", "studio_overdue:platform"]);
});

test("plusieurs missions à la fois, chacune avec ses propres rappels", () => {
  const out = dueStudioReminders([m({ id: "a" }), m({ id: "b", status: "production" })], "2026-11-08", NOW("2026-11-08"), new Set());
  assert.deepEqual(out.map((d) => `${d.missionId}:${d.key}:${d.audience}`).sort(), ["a:studio_start_late:platform", "b:studio_deliver:provider"]);
});

test("chaque clé a sa phrase, son e-mail, et une place dans la migration", () => {
  for (const k of STUDIO_KEYS) assert.ok(reminderLabel[k].length > 10, k);
  const base = { restaurantName: "Chez Nour", providerName: "Studio Croustille", url: "https://www.boosteats.be/x", deadlineLabel: "mardi 10 novembre" } as const;
  const audienceOf: Record<string, "restaurant" | "provider" | "platform"> = { studio_start: "provider", studio_start_late: "platform", studio_deliver: "provider", studio_overdue: "provider", bat_review: "restaurant", bat_review_again: "restaurant", bat_corrections_due: "provider" };
  for (const k of STUDIO_KEYS) {
    const e = missionUpdateEmail({ ...base, kind: k, audience: audienceOf[k] });
    assert.ok(e.subject.length > 10, k);
    assert.ok(e.html.includes(base.url) && e.text.includes(base.url), k);
    assert.doesNotMatch(e.subject + e.text, /€|euro/i, k);
    assert.doesNotMatch(e.html, /undefined|\[object/, k);
  }
  assert.match(missionUpdateEmail({ ...base, kind: "studio_overdue", audience: "platform" }).text, /Rien n'est sanctionné automatiquement/);
  assert.match(missionUpdateEmail({ ...base, kind: "bat_review", audience: "restaurant" }).text, /rien ne se signe tout seul/i);
  const sql = readFileSync("docs/migrations/20261021-1000-prestataires-rappels-atelier.sql", "utf8");
  for (const k of [...STUDIO_KEYS, "j7", "j2", "veille", "alerte", "propose", "choisir", "sans_proposition"]) assert.ok(sql.includes(`'${k}'`), k);
});
