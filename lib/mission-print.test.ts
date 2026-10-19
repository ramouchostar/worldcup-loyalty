import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BAT_NOTE_CATEGORIES,
  MAX_BAT_ROUNDS,
  SIGN_ISSUE_TEXT,
  batChecklist,
  batPhase,
  batSummary,
  canDeliverPrint,
  canRequestCorrections,
  correctionRoundsLeft,
  isBatSigned,
  judgeCorrections,
  judgeReview,
  judgeSubmitProof,
  printLocksCancellation,
  sanitizeCorrections,
  sanitizeSign,
  validatePrintDelivery,
  validateProof,
  validateSign,
  type ProofLite,
} from "./mission-print";
import { PRINT_BRIEF_STEPS, PRINT_TEMPLATE, defaultTemplate, stepsFor, validateBrief, type BriefAnswers, type BriefIssueCode } from "./mission-brief";
import { canCancel, quoteCancellation } from "./mission-cancel-rules";
import { retouchState } from "./mission-retouch";
import { PRINT_RESTAURANT_RULES, PRINT_PROVIDER_RULES, PRINT_RULES_VERSION, STUDIO_RULES_VERSION, RULES_VERSION, printRulesFingerprint, readAcceptance, rulesFor, rulesKindOf, rulesVersionFor } from "./mission-rules";
import { missionUpdateEmail } from "./email-templates/mission-update";
import { issueMessage } from "./mission-view";
import { sanitizeDelivery } from "./mission-dayof";

const TODAY = "2026-10-19";
const p = (round: number, status: ProofLite["status"]): ProofLite => ({ round, status });

// ── l'état du bon à tirer se déduit des épreuves ──
test("la phase du BAT : rien, en attente, corrections, signé", () => {
  assert.equal(batPhase([]), "none");
  assert.equal(batPhase([p(1, "proposed")]), "awaiting_review");
  assert.equal(batPhase([p(1, "corrections")]), "corrections");
  assert.equal(batPhase([p(1, "corrections"), p(2, "proposed")]), "awaiting_review");
  assert.equal(batPhase([p(1, "corrections"), p(2, "corrections")]), "corrections");
  assert.equal(batPhase([p(1, "corrections"), p(2, "signed")]), "signed");
  assert.equal(batPhase([p(2, "proposed"), p(1, "corrections")]), "awaiting_review"); // l'ordre de lecture ne change rien
  assert.equal(isBatSigned([p(1, "signed")]), true);
  assert.equal(printLocksCancellation([p(1, "proposed")]), false);
  assert.equal(printLocksCancellation([p(1, "signed")]), true);
});

test("l'imprimeur envoie une épreuve : la première ou la suivante après des corrections, jamais deux à la fois, jamais après la signature", () => {
  assert.equal(judgeSubmitProof("production", []), "ok");
  assert.equal(judgeSubmitProof("production", [p(1, "corrections")]), "ok");
  assert.equal(judgeSubmitProof("production", [p(1, "corrections"), p(2, "corrections")]), "ok"); // la 3e
  assert.equal(judgeSubmitProof("production", [p(1, "proposed")]), "awaiting_review");
  assert.equal(judgeSubmitProof("production", [p(1, "corrections"), p(2, "proposed")]), "awaiting_review");
  assert.equal(judgeSubmitProof("production", [p(1, "signed")]), "already_signed");
  assert.equal(judgeSubmitProof("production", [p(1, "corrections"), p(2, "corrections"), p(3, "corrections")]), "no_rounds_left");
  for (const s of ["accepte", "livre", "retouche", "valide", "annule", "litige"]) assert.equal(judgeSubmitProof(s, []), "not_production", s);
  assert.equal(MAX_BAT_ROUNDS, 3);
});

test("le restaurateur répond à l'épreuve en attente ; deux tours de corrections, la 3e épreuve se signe", () => {
  assert.equal(judgeReview("production", [p(1, "proposed")]), "ok");
  assert.equal(judgeReview("production", []), "not_awaiting_review");
  assert.equal(judgeReview("production", [p(1, "corrections")]), "not_awaiting_review");
  assert.equal(judgeReview("production", [p(1, "signed")]), "not_awaiting_review"); // jamais deux signatures
  assert.equal(judgeReview("livre", [p(1, "proposed")]), "not_production");
  assert.equal(canRequestCorrections([p(1, "proposed")]), true);
  assert.equal(canRequestCorrections([p(1, "corrections"), p(2, "proposed")]), true);
  assert.equal(canRequestCorrections([p(1, "corrections"), p(2, "corrections"), p(3, "proposed")]), false);
  assert.deepEqual([[], [p(1, "proposed")], [p(1, "corrections"), p(2, "proposed")], [p(1, "corrections"), p(2, "corrections"), p(3, "proposed")]].map(correctionRoundsLeft), [3, 2, 1, 0]);
});

test("on n'imprime ni ne livre qu'après la signature", () => {
  assert.equal(canDeliverPrint("production", [p(1, "signed")]), true);
  assert.equal(canDeliverPrint("production", [p(1, "proposed")]), false);
  assert.equal(canDeliverPrint("production", []), false);
  assert.equal(canDeliverPrint("livre", [p(1, "signed")]), false);
});

// ── la signature ──
const brief: BriefAnswers = { product: "Menus", quantity: "250", size: "A4", paper: "Épais", finish: "Mat", delivery_mode: "Livraison au restaurant", qr_url: "https://monrestaurant.be/menu" };

test("la liste à cocher : le QR code n'y est que s'il y en a un, avec la quantité et le format réels", () => {
  const withQr = batChecklist(brief).map((c) => c.key);
  assert.deepEqual(withQr, ["texts", "visual", "qr", "spec"]);
  assert.deepEqual(batChecklist({ ...brief, qr_url: "" }).map((c) => c.key), ["texts", "visual", "spec"]);
  assert.deepEqual(batChecklist(null).map((c) => c.key), ["texts", "visual", "spec"]);
  assert.match(batChecklist(brief).find((c) => c.key === "spec")!.sub, /250 · Menus · A4/);
  assert.deepEqual(batSummary(brief).map((r) => `${r.label}:${r.value}`), ["Produit:Menus", "Quantité:250", "Format:A4", "Papier:Épais, mat", "Réception:Livraison au restaurant"]);
  assert.deepEqual(batSummary(null), []);
});

test("signer : TOUS les points de la liste cochés, et un vrai nom", () => {
  const required = batChecklist(brief);
  const all = { texts: true, visual: true, qr: true, spec: true };
  assert.deepEqual(validateSign(sanitizeSign({ checks: all, name: "Nour Dupont" }), required), { ok: true, issues: [] });
  assert.deepEqual(validateSign(sanitizeSign({ checks: { ...all, qr: false }, name: "Nour Dupont" }), required).issues, [{ code: "unchecked", key: "qr" }]);
  assert.deepEqual(validateSign(sanitizeSign({ checks: { texts: true }, name: "Nour Dupont" }), required).issues.map((i) => i.key), ["visual", "qr", "spec"]);
  assert.deepEqual(validateSign(sanitizeSign({ checks: all, name: "" }), required).issues, [{ code: "name_missing" }]);
  assert.deepEqual(validateSign(sanitizeSign({ checks: all, name: "NO" }), required).issues, [{ code: "name_short" }]);
  assert.deepEqual(validateSign(sanitizeSign({ checks: all, name: "x".repeat(200) }), required).issues, [{ code: "name_long" }]);
  // Sans QR sur l'impression, la case QR n'est pas exigée ; une case en trop est ignorée.
  assert.equal(validateSign(sanitizeSign({ checks: { texts: true, visual: true, spec: true }, name: "Nour Dupont" }), batChecklist({ ...brief, qr_url: "" })).ok, true);
  for (const t of Object.values(SIGN_ISSUE_TEXT)) assert.ok(t.length > 10);
});

test("la signature venue du réseau est nettoyée : seul « true » coche, le nom est rogné", () => {
  assert.deepEqual(sanitizeSign({ checks: { texts: "true", visual: 1, spec: true }, name: "  Nour   Dupont  " }), { checks: { texts: false, visual: false, spec: true }, name: "Nour Dupont" });
  assert.deepEqual(sanitizeSign(null), { checks: {}, name: "" });
  assert.deepEqual(sanitizeSign({ checks: [true, true], name: 5 }), { checks: {}, name: "" });
});

// ── les corrections ──
test("des corrections : toutes d'un coup, classées et motivées ; « pas bien » seul est refusé", () => {
  const ok = judgeCorrections(sanitizeCorrections({ notes: [{ category: "Prix", text: "Le prix du menu enfant est faux : 9 € et pas 11 €" }, { category: "QR code", text: "Le QR code ouvre l'ancienne carte" }] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(judgeCorrections([]), { ok: false, reason: "empty", problems: [] });
  assert.equal(judgeCorrections(Array.from({ length: 21 }, () => ({ category: "Prix", text: "Le prix du menu enfant est faux" }))).ok, false);
  const vague = judgeCorrections([{ category: "Prix", text: "pas bien" }]);
  assert.equal(vague.ok, false);
  const noCat = judgeCorrections([{ category: null, text: "Le prix du menu enfant est faux" }]);
  assert.equal(noCat.ok, false);
  const unknown = judgeCorrections([{ category: "Hologramme", text: "Le prix du menu enfant est faux" }]);
  assert.equal(unknown.ok, false);
  assert.ok(BAT_NOTE_CATEGORIES.includes("QR code") && BAT_NOTE_CATEGORIES.includes("Format"));
});

// ── la livraison de l'impression ──
test("une impression se livre par un mot (où et quand), un lien de suivi est facultatif mais doit être valide", () => {
  const d = (links: string[], message: string) => validatePrintDelivery({ links, message });
  assert.equal(d([], "Livré au restaurant le 3 novembre").ok, true);
  assert.equal(d([], "Prêt au retrait").ok, true);
  assert.deepEqual(d([], "ok").issues, [{ code: "no_link" }]);
  assert.deepEqual(d([], "").issues, [{ code: "no_link" }]);
  assert.equal(d(["https://suivi.example.be/colis/42"], "").ok, true);
  assert.equal(d(["http://suivi.example.be/colis/42"], "Livré").ok, false);
  assert.equal(d(["javascript:alert(1)"], "Livré au restaurant").ok, false);
  assert.equal(d([], "x".repeat(1001)).ok, false);
  // Une épreuve, elle, a toujours un lien.
  assert.equal(validateProof(sanitizeDelivery({ links: [], message: "voici" })).ok, false);
  assert.equal(validateProof(sanitizeDelivery({ links: ["https://exemple.be/bat.pdf"], message: "" })).ok, true);
});

// ── pas de retouche après impression ; l'annulation se ferme avec la signature ──
test("une impression ne se retouche pas : les corrections se font sur le bon à tirer", () => {
  assert.deepEqual(retouchState("livre", 0, "impression"), { can: false, reason: "print" });
  assert.equal(retouchState("livre", 0, "design").can, true);
  assert.equal(retouchState("livre", 0).can, true);
});

test("l'annulation d'une impression : comme le graphiste jusqu'à la signature", () => {
  assert.equal(canCancel("restaurant", "accepte", "impression"), true);
  assert.equal(canCancel("restaurant", "production", "impression"), true); // la fonction pure ne connaît pas la signature : la couche base la ferme
  const facts = { by: "restaurant" as const, shootDate: null, shootStart: null, paidCents: 100_000, providerCents: 87_500, depositCents: 20_000, now: new Date("2026-10-19T08:00:00Z"), metier: "impression" as const };
  assert.equal(quoteCancellation({ ...facts, status: "accepte" }).band, "free");
  assert.equal(quoteCancellation({ ...facts, status: "production" }).band, "deposit");
});

// ── le brief d'impression ──
const good: BriefAnswers = {
  product: "Menus",
  quantity: "250",
  size: "A4",
  paper: "Épais",
  finish: "Mat",
  file_state: "Prêt à imprimer",
  qr_url: "https://monrestaurant.be/menu",
  qr_tested: true,
  delivery_mode: "Livraison au restaurant",
  deadline: "2026-11-02",
  deciders: ["Nour"],
  deciders_attested: true,
  budget_cents: 25000,
};
const issues = (a: BriefAnswers) => validateBrief(a, PRINT_TEMPLATE, TODAY).issues.map((i) => `${i.key}:${i.code}`);

test("le modèle d'impression : chaque question dans UN écran, dans l'ordre ; c'est le modèle du métier", () => {
  const inBrief = PRINT_TEMPLATE.questions.filter((q) => (q.phase ?? "brief") === "brief" && q.kind !== "files").map((q) => q.key);
  assert.deepEqual(PRINT_BRIEF_STEPS.flatMap((s) => s.keys), inBrief);
  assert.equal(stepsFor("impression"), PRINT_BRIEF_STEPS);
  assert.equal(defaultTemplate("impression"), PRINT_TEMPLATE);
  assert.equal(PRINT_TEMPLATE.questions.some((q) => q.phase === "tournage"), false);
});

test("un brief d'impression complet est recevable, avec ou sans QR code", () => {
  assert.deepEqual(issues(good), []);
  assert.deepEqual(issues({ ...good, qr_url: "", qr_tested: false }), []);
  assert.deepEqual(issues({ ...good, qr_url: undefined, qr_tested: undefined }), []);
});

test("un QR code écrit doit être une adresse https ET testée", () => {
  assert.deepEqual(issues({ ...good, qr_tested: false }), ["qr_tested:not_attested"]);
  assert.deepEqual(issues({ ...good, qr_tested: undefined }), ["qr_tested:not_attested"]);
  assert.deepEqual(issues({ ...good, qr_url: "http://monrestaurant.be" }), ["qr_url:bad_url"]);
  assert.deepEqual(issues({ ...good, qr_url: "https://127.0.0.1/x" }), ["qr_url:bad_url"]);
  assert.deepEqual(issues({ ...good, qr_url: "monrestaurant.be" }), ["qr_url:bad_url"]);
});

test("une quantité ou un format hors liste se précise ; le reste est une liste fermée", () => {
  assert.deepEqual(issues({ ...good, quantity: "Plus de 1000" }), ["notes:needs_detail"]);
  assert.deepEqual(issues({ ...good, quantity: "Plus de 1000", notes: "Je veux 2 500 exemplaires." }), []);
  assert.deepEqual(issues({ ...good, size: "Autre format" }), ["notes:needs_detail"]);
  assert.deepEqual(issues({ ...good, product: "Hologrammes" }), ["product:bad_option"]);
  assert.deepEqual(issues({ ...good, paper: "Papier doré" }), ["paper:bad_option"]);
  assert.deepEqual(issues({ ...good, finish: undefined }), ["finish:missing"]);
  assert.deepEqual(issues({ ...good, deadline: "2026-10-22" }), ["deadline:deadline_too_soon"]);
  const codes: BriefIssueCode[] = ["missing", "too_short", "too_soon", "deadline_too_soon", "bad_url", "needs_detail", "past", "bad_option", "bad_phone", "not_attested", "budget_below_floor"];
  assert.equal(new Set(codes.map(issueMessage)).size, codes.length);
});

// ── les règles d'impression ──
test("les règles d'impression : leur version, leur empreinte, et le bon à tirer dedans", () => {
  assert.equal(PRINT_RULES_VERSION, "2026-10-20");
  assert.notEqual(PRINT_RULES_VERSION, STUDIO_RULES_VERSION);
  assert.notEqual(PRINT_RULES_VERSION, RULES_VERSION);
  // Si ce test échoue : tu as modifié le texte des règles d'impression. Change PRINT_RULES_VERSION, puis mets l'empreinte à jour ici.
  assert.equal(printRulesFingerprint(), "0b2036b7");
  assert.deepEqual((["video", "photo", "design", "impression"] as const).map(rulesKindOf), ["tournage", "tournage", "atelier", "impression"]);
  assert.equal(rulesVersionFor("impression"), PRINT_RULES_VERSION);
  assert.equal(rulesFor("restaurant", "impression"), PRINT_RESTAURANT_RULES);
  assert.equal(rulesFor("provider", "impression"), PRINT_PROVIDER_RULES);
  for (const rules of [PRINT_RESTAURANT_RULES, PRINT_PROVIDER_RULES]) {
    assert.equal(rules.filter((r) => r.title === "Le bon à tirer fait foi").length, 1);
    assert.equal(new Set(rules.map((r) => r.title)).size, rules.length);
    assert.doesNotMatch(rules.map((r) => `${r.title} ${r.text}`).join("\n"), /tournage|équipe|compte-rendu|€|euro|12,5|87,5/i);
  }
  // Pas de « deux tours de retours » après livraison : les corrections se font sur l'épreuve.
  assert.equal(PRINT_RESTAURANT_RULES.some((r) => r.title === "Deux tours de retours"), false);
  assert.match(PRINT_RESTAURANT_RULES.find((r) => r.title === "Le bon à tirer fait foi")!.text, /deux tours/);
  assert.match(PRINT_RESTAURANT_RULES.find((r) => r.title === "Le bon à tirer fait foi")!.text, /pas réimprimée gratuitement/);
  assert.match(PRINT_RESTAURANT_RULES.find((r) => r.title.startsWith("Tu peux annuler"))!.text, /Après la signature du bon à tirer, on n'annule plus/);
  assert.equal(readAcceptance({ accepted: true, version: PRINT_RULES_VERSION }, PRINT_RULES_VERSION).ok, true);
  assert.deepEqual(readAcceptance({ accepted: true, version: STUDIO_RULES_VERSION }, PRINT_RULES_VERSION), { ok: false, reason: "outdated" });
});

// ── les e-mails ──
test("les e-mails du bon à tirer : le fait, le lien, aucun montant", () => {
  const base = { restaurantName: "Chez Nour", providerName: "Studio Croustille", url: "https://www.boosteats.be/x" } as const;
  const mails = [
    missionUpdateEmail({ ...base, kind: "bat_submitted", audience: "restaurant", count: 1 }),
    missionUpdateEmail({ ...base, kind: "bat_submitted", audience: "restaurant", count: 2 }),
    missionUpdateEmail({ ...base, kind: "bat_corrections", audience: "provider", count: 3 }),
    missionUpdateEmail({ ...base, kind: "bat_signed", audience: "provider" }),
    missionUpdateEmail({ ...base, kind: "bat_signed", audience: "platform" }),
    missionUpdateEmail({ ...base, kind: "delivered", audience: "restaurant", print: true }),
  ];
  for (const m of mails) {
    assert.ok(m.html.includes(base.url) && m.text.includes(base.url));
    assert.doesNotMatch(m.subject + m.text, /€|euro/i);
    assert.doesNotMatch(m.html, /undefined|\[object/);
  }
  assert.match(mails[0].subject, /bon à tirer/);
  assert.match(mails[1].subject, /nouvelle épreuve/);
  assert.match(mails[2].subject, /3 corrections/);
  assert.match(mails[4].text, /à la main/);
  assert.match(mails[5].subject, /impression/);
  assert.match(mails[5].text, /bon à tirer que tu as signé|bon à tirer/);
  assert.doesNotMatch(mails[5].text, /retouche|télécharge/i);
});

// ── la migration ──
test("la migration : épreuves, signature et livraison sans lien, comme le code", () => {
  const sql = readFileSync("docs/migrations/20261019-1000-prestataires-bat.sql", "utf8");
  for (const s of ["proposed", "corrections", "signed"]) assert.ok(sql.includes(`'${s}'`), s);
  assert.match(sql, /round\s+SMALLINT NOT NULL CHECK \(round BETWEEN 1 AND 3\)/);
  assert.match(sql, /signed_name IS NULL OR char_length\(signed_name\) BETWEEN 3 AND 80/);
  assert.match(sql, /mission_proofs_one_signed ON mission_proofs \(mission_id\) WHERE status = 'signed'/);
  assert.match(sql, /mission_proofs_one_pending ON mission_proofs \(mission_id\) WHERE status = 'proposed'/);
  assert.match(sql, /cardinality\(links\) BETWEEN 0 AND 10/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
});
