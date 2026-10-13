import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_ISSUE_TEXT,
  DELIVERY_ISSUE_TEXT,
  formatDuration,
  judgeStart,
  linkHost,
  overrun,
  sanitizeDelivery,
  sanitizeReport,
  validateContest,
  validateDelivery,
  validateReport,
  type ReportInput,
} from "./mission-dayof";

// ── Démarrer ──
test("on démarre à partir du JOUR du tournage, jamais la veille", () => {
  assert.equal(judgeStart("date_bloquee", "2026-10-27", "2026-10-26"), "too_early");
  assert.equal(judgeStart("date_bloquee", "2026-10-27", "2026-10-27"), "ok");
  assert.equal(judgeStart("date_bloquee", "2026-10-27", "2026-10-28"), "ok"); // un jour de retard n'empêche pas de démarrer
});

test("sans date réservée ou hors de l'état « date réservée », on ne démarre pas", () => {
  assert.equal(judgeStart("date_bloquee", null, "2026-10-27"), "not_booked");
  for (const s of ["accepte", "devis", "production", "livre", "annule"]) assert.equal(judgeStart(s, "2026-10-27", "2026-10-27"), "not_booked", s);
});

// ── Compte-rendu ──
const ok: ReportInput = { arrival: "09:30", end: "11:45", missing: [], note: "" };
const codes = (r: Partial<ReportInput>) => validateReport({ ...ok, ...r }).issues.map((i) => i.code);

test("un compte-rendu complet est valide, avec sa durée", () => {
  const v = validateReport(ok);
  assert.equal(v.ok, true);
  assert.equal(v.durationMinutes, 135);
});

test("les heures sont obligatoires, au format HH:MM, et dans le bon ordre", () => {
  assert.deepEqual(codes({ arrival: "" }), ["arrival_invalid"]);
  assert.deepEqual(codes({ arrival: "9h30" }), ["arrival_invalid"]);
  assert.deepEqual(codes({ end: "25:00" }), ["end_invalid"]);
  assert.deepEqual(codes({ arrival: "11:45", end: "09:30" }), ["end_before_arrival"]);
  assert.deepEqual(codes({ arrival: "09:30", end: "09:30" }), ["end_before_arrival"]);
  assert.deepEqual(codes({ arrival: "06:00", end: "19:00" }), ["too_long"]);
});

test("ce qui a manqué est une case connue ; « autre » demande un mot", () => {
  assert.deepEqual(codes({ missing: ["Un plat n'était pas prêt"] }), []);
  assert.deepEqual(codes({ missing: ["Il pleuvait"] }), ["missing_unknown"]);
  assert.deepEqual(codes({ missing: ["Autre"], note: "" }), ["note_required"]);
  assert.deepEqual(codes({ missing: ["Autre"], note: "Le four est tombé en panne" }), []);
});

test("une entrée venue du réseau est ramenée, jamais crue", () => {
  const r = sanitizeReport({ arrival: " 09:30 ", end: 1145, missing: ["Autre", "Autre", 7, " Un plat n'était pas prêt "], note: "x".repeat(3000) });
  assert.equal(r.arrival, "09:30");
  assert.equal(r.end, "");
  assert.deepEqual(r.missing, ["Autre", "Un plat n'était pas prêt"]);
  assert.equal(r.note.length, 1001);
  assert.deepEqual(validateReport(sanitizeReport(null)).issues.map((i) => i.code), ["arrival_invalid", "end_invalid"]);
});

test("chaque motif a une phrase", () => {
  for (const c of ["arrival_invalid", "end_invalid", "end_before_arrival", "too_long", "missing_unknown", "note_too_long", "note_required"] as const) assert.ok(REPORT_ISSUE_TEXT[c].length > 10, c);
});

test("dépassement : une demi-heure de marge, jamais un refus", () => {
  assert.deepEqual(overrun(135, 4), { over: false, extraMinutes: 0 });
  assert.deepEqual(overrun(270, 4), { over: false, extraMinutes: 30 }); // 30 min pile : toléré
  assert.deepEqual(overrun(271, 4), { over: true, extraMinutes: 31 });
  assert.deepEqual(overrun(480, 4), { over: true, extraMinutes: 240 });
  assert.deepEqual(overrun(null, 4), { over: false, extraMinutes: 0 });
  assert.deepEqual(overrun(300, null), { over: false, extraMinutes: 0 });
});

test("durée lisible", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(120), "2 h");
  assert.equal(formatDuration(135), "2 h 15");
  assert.equal(formatDuration(125), "2 h 05");
});

// ── Contester ──
test("contester demande une vraie raison", () => {
  assert.deepEqual(validateContest({ contest: false, note: "" }), { ok: true });
  assert.deepEqual(validateContest({ contest: true, note: "pas ok" }), { ok: false, issue: "note_too_short" });
  assert.deepEqual(validateContest({ contest: true, note: "Il est arrivé à 10 h 15, pas à 9 h 30." }), { ok: true });
  assert.deepEqual(validateContest({ contest: true, note: "x".repeat(1001) }), { ok: false, issue: "note_too_long" });
});

// ── Livraison ──
const link = "https://wetransfer.com/downloads/abc123";
const dcodes = (links: string[], message = "") => validateDelivery({ links, message }).issues.map((i) => i.code);

test("une livraison : des liens https, un message facultatif", () => {
  assert.deepEqual(validateDelivery({ links: [link, "https://drive.google.com/drive/folders/xyz"], message: "Voilà les 3 reels." }), { ok: true, issues: [] });
});

test("au moins un lien, dix au plus", () => {
  assert.deepEqual(dcodes([]), ["no_link"]);
  assert.deepEqual(dcodes(Array.from({ length: 11 }, (_, i) => `https://x${i}.be/f`)), ["too_many"]);
});

test("jamais un lien dangereux : seulement https, sans identifiants, sans script", () => {
  assert.deepEqual(dcodes(["http://wetransfer.com/x"]), ["link_not_https"]);
  assert.deepEqual(dcodes(["javascript:alert(1)"]), ["link_not_https"]);
  assert.deepEqual(dcodes(["data:text/html,<script>1</script>"]), ["link_not_https"]);
  assert.deepEqual(dcodes(["ftp://x.be/f"]), ["link_not_https"]);
  assert.deepEqual(dcodes(["https://user:pass@wetransfer.com/x"]), ["link_credentials"]);
  assert.deepEqual(dcodes(["https://localhost/x"]), ["link_invalid"]);
  assert.deepEqual(dcodes(["pas un lien"]), ["link_invalid"]);
  assert.deepEqual(dcodes([`https://x.be/${"a".repeat(500)}`]), ["link_too_long"]);
});

test("l'indice du lien fautif est dit", () => {
  const v = validateDelivery({ links: [link, "http://x.be/f"], message: "" });
  assert.deepEqual(v.issues, [{ code: "link_not_https", index: 1 }]);
});

test("une entrée du réseau est ramenée : doublons retirés, espaces rognés, plafonnée", () => {
  const d = sanitizeDelivery({ links: [` ${link} `, link, 5, "", "https://b.be/x"], message: "  ok  " });
  assert.deepEqual(d.links, [link, "https://b.be/x"]);
  assert.equal(d.message, "ok");
  assert.equal(sanitizeDelivery({ links: Array.from({ length: 40 }, (_, i) => `https://x${i}.be/f`) }).links.length, 11);
  assert.deepEqual(sanitizeDelivery("pas un objet"), { links: [], message: "" });
});

test("chaque motif de livraison a une phrase", () => {
  for (const c of Object.keys(DELIVERY_ISSUE_TEXT)) assert.ok(DELIVERY_ISSUE_TEXT[c as keyof typeof DELIVERY_ISSUE_TEXT].length > 10, c);
});

test("où mène un lien, en clair", () => {
  assert.equal(linkHost("https://www.wetransfer.com/downloads/abc"), "wetransfer.com");
  assert.equal(linkHost("https://drive.google.com/x"), "drive.google.com");
  assert.equal(linkHost("n'importe quoi"), "n'importe quoi");
});
