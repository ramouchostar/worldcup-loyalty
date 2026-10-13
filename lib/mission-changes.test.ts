import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHANGE_CATEGORIES,
  CHANGE_STATUS_LABEL,
  MAX_CHANGES,
  MAX_SUPPLEMENT_CENTS,
  PROVIDER_ANSWER_DAYS,
  QUOTE_ISSUE_TEXT,
  REQUEST_ISSUE_TEXT,
  REQUEST_VERDICT_TEXT,
  canWithdraw,
  countsTowardLimit,
  judgeChangeRequest,
  judgeProviderAnswer,
  judgeRestaurantAnswer,
  sanitizeChangeQuote,
  sanitizeChangeRequest,
  sanitizeReason,
  shouldExpire,
  validateChangeQuote,
  validateChangeRequest,
  validateReason,
  type ChangeStatus,
} from "./mission-changes";
import { missionUpdateEmail, type MissionUpdateInput } from "./email-templates/mission-update";
import { FILE_SCOPES, MAX_UNLINKED, SCOPE_ACTOR } from "./mission-files";

// Le tournage est le mardi 10 novembre 2026 : J-7 = lundi 3 novembre.
const D = "2026-11-10";
const desc = "On ajoute trois plats à la carte du tournage et on ne montre plus la cuisine.";
const ctx = (over: Partial<Parameters<typeof judgeChangeRequest>[0]> = {}) => ({ status: "date_bloquee", shootDate: D, changes: [] as { status: ChangeStatus }[], ...over });

// ── la demande ──
test("une demande : au moins une catégorie connue et une explication de 30 à 1 000 caractères", () => {
  assert.equal(validateChangeRequest(sanitizeChangeRequest({ categories: ["Plats à montrer"], description: desc })).ok, true);
  const codes = (raw: unknown) => validateChangeRequest(sanitizeChangeRequest(raw)).issues.map((i) => `${i.field}:${i.code}`);
  assert.deepEqual(codes({ categories: [], description: desc }), ["categories:no_category"]);
  assert.deepEqual(codes({ categories: ["Inventée"], description: desc }), ["categories:unknown_category"]);
  assert.deepEqual(codes({ categories: ["Autre"], description: "" }), ["description:description_missing"]);
  assert.deepEqual(codes({ categories: ["Autre"], description: "Plus de plats" }), ["description:description_short"]);
  assert.deepEqual(codes({ categories: ["Autre"], description: "x".repeat(1001) }), ["description:description_long"]);
  assert.deepEqual(codes(null), ["categories:no_category", "description:description_missing"]);
});

test("la saisie du réseau est nettoyée : doublons, types, longueurs", () => {
  const r = sanitizeChangeRequest({ categories: ["Autre", "Autre", 5, " Ton et style "], description: `  ${desc}  ` });
  assert.deepEqual(r.categories, ["Autre", "Ton et style"]);
  assert.equal(r.description, desc);
  assert.ok(sanitizeChangeRequest({ categories: [], description: "y".repeat(5000) }).description.length <= 1001);
});

// ── quand ──
test("on demande une modification après le devis accepté, jusqu'à J-7 compris", () => {
  assert.equal(judgeChangeRequest(ctx(), "2026-10-20"), "ok");
  assert.equal(judgeChangeRequest(ctx(), "2026-11-03"), "ok"); // J-7 : dernier jour
  assert.equal(judgeChangeRequest(ctx(), "2026-11-04"), "too_late");
  assert.equal(judgeChangeRequest(ctx({ status: "accepte", shootDate: null }), "2026-12-30"), "ok"); // pas de date : pas de limite
  for (const status of ["brief", "envoye", "devis", "production", "livre", "retouche", "valide", "verse", "annule", "litige", "suspendu"]) assert.equal(judgeChangeRequest(ctx({ status }), "2026-10-20"), "not_now", status);
});

test("une seule demande ouverte à la fois, deux au total", () => {
  assert.equal(judgeChangeRequest(ctx({ changes: [{ status: "proposed" }] }), "2026-10-20"), "open_exists");
  assert.equal(judgeChangeRequest(ctx({ changes: [{ status: "quoted" }] }), "2026-10-20"), "open_exists");
  assert.equal(judgeChangeRequest(ctx({ changes: [{ status: "accepted" }] }), "2026-10-20"), "ok");
  assert.equal(judgeChangeRequest(ctx({ changes: [{ status: "accepted" }, { status: "declined_by_restaurant" }] }), "2026-10-20"), "limit_reached");
  assert.equal(judgeChangeRequest(ctx({ changes: [{ status: "accepted" }, { status: "accepted" }] }), "2026-10-20"), "limit_reached");
  assert.equal(MAX_CHANGES, 2);
});

test("ce que le prestataire refuse ou laisse expirer, et ce que le restaurateur retire, ne compte pas dans les deux", () => {
  const all: ChangeStatus[] = ["proposed", "quoted", "accepted", "declined_by_provider", "declined_by_restaurant", "withdrawn", "expired"];
  assert.deepEqual(all.filter((s) => countsTowardLimit({ status: s })), ["proposed", "quoted", "accepted", "declined_by_restaurant"]);
  assert.equal(judgeChangeRequest(ctx({ changes: [{ status: "declined_by_provider" }, { status: "expired" }, { status: "withdrawn" }, { status: "accepted" }] }), "2026-10-20"), "ok");
});

// ── la réponse du prestataire ──
test("un supplément chiffré (jusqu'à 5 000 €) ou « sans supplément » ; jours en plus de 0 à 30 ; un mot de 500 caractères", () => {
  const ok = (raw: unknown) => validateChangeQuote(sanitizeChangeQuote(raw));
  assert.equal(ok({ free: false, priceCents: 12000, deltaDays: 2, note: "ok" }).ok, true);
  assert.equal(ok({ free: true, deltaDays: 0 }).ok, true);
  assert.equal(sanitizeChangeQuote({ free: true, priceCents: 99999 }).priceCents, 0); // « sans supplément » ignore tout prix
  assert.deepEqual(ok({ free: false, priceCents: 0, deltaDays: 0 }).issues, [{ field: "price", code: "price_invalid" }]);
  assert.deepEqual(ok({ free: false, priceCents: -5, deltaDays: 0 }).issues, [{ field: "price", code: "price_invalid" }]);
  assert.deepEqual(ok({ free: false, priceCents: 12.5, deltaDays: 0 }).issues, [{ field: "price", code: "price_invalid" }]);
  assert.deepEqual(ok({ free: false, deltaDays: 0 }).issues, [{ field: "price", code: "price_invalid" }]);
  assert.equal(ok({ free: false, priceCents: MAX_SUPPLEMENT_CENTS, deltaDays: 0 }).ok, true);
  assert.deepEqual(ok({ free: false, priceCents: MAX_SUPPLEMENT_CENTS + 1, deltaDays: 0 }).issues, [{ field: "price", code: "price_too_high" }]);
  assert.deepEqual(ok({ free: true, deltaDays: 31 }).issues, [{ field: "delta", code: "delta_invalid" }]);
  assert.deepEqual(ok({ free: true, deltaDays: -1 }).issues, [{ field: "delta", code: "delta_invalid" }]);
  assert.deepEqual(ok({ free: true, deltaDays: 0, note: "n".repeat(501) }).issues, [{ field: "note", code: "note_too_long" }]);
});

test("un refus a toujours sa raison : 12 à 500 caractères", () => {
  assert.equal(validateReason(sanitizeReason({ reason: "Pas disponible ce jour-là" })), "ok");
  assert.equal(validateReason(sanitizeReason({ reason: "non" })), "too_short");
  assert.equal(validateReason(sanitizeReason({})), "too_short");
  assert.equal(validateReason(sanitizeReason({ reason: "x".repeat(501) })), "too_long");
});

test("seul le prestataire répond à une demande NON chiffrée ; seul le restaurateur répond à un supplément, jusqu'à J-7", () => {
  const all: ChangeStatus[] = ["proposed", "quoted", "accepted", "declined_by_provider", "declined_by_restaurant", "withdrawn", "expired"];
  assert.deepEqual(all.filter((s) => judgeProviderAnswer(s) === "ok"), ["proposed"]);
  assert.deepEqual(all.filter((s) => judgeRestaurantAnswer(s, D, "2026-10-20") === "ok"), ["quoted"]);
  assert.equal(judgeRestaurantAnswer("quoted", D, "2026-11-03"), "ok");
  assert.equal(judgeRestaurantAnswer("quoted", D, "2026-11-04"), "too_late");
  assert.equal(judgeRestaurantAnswer("quoted", null, "2027-01-01"), "ok");
  assert.equal(judgeRestaurantAnswer("accepted", D, "2026-10-20"), "not_expected"); // jamais deux acceptations
  assert.deepEqual(all.filter(canWithdraw), ["proposed", "quoted"]);
});

// ── l'expiration ──
test("expiration : 3 jours sans réponse du prestataire, ou la fenêtre de J-7 passée ; un supplément proposé attend jusqu'à J-7", () => {
  const now = new Date("2026-10-20T08:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const x = (status: ChangeStatus, createdDaysAgo: number, shootDate: string | null, today = "2026-10-20") => shouldExpire({ status, createdAt: ago(createdDaysAgo), shootDate }, today, now);
  assert.equal(PROVIDER_ANSWER_DAYS, 3);
  assert.equal(x("proposed", 2, D), false);
  assert.equal(x("proposed", 3.1, D), true);
  assert.equal(x("proposed", 5, null), true);
  assert.equal(x("quoted", 10, D), false); // le prestataire a répondu : on attend le restaurateur
  assert.equal(x("quoted", 10, null), false);
  assert.equal(x("quoted", 1, D, "2026-11-04"), true); // J-7 passé
  assert.equal(x("proposed", 0, D, "2026-11-04"), true);
  for (const s of ["accepted", "declined_by_provider", "declined_by_restaurant", "withdrawn", "expired"] as ChangeStatus[]) assert.equal(x(s, 99, D, "2026-12-01"), false, s);
});

// ── les mots ──
test("chaque motif, chaque état et chaque catégorie ont leur phrase", () => {
  for (const t of [...Object.values(REQUEST_ISSUE_TEXT), ...Object.values(REQUEST_VERDICT_TEXT), ...Object.values(QUOTE_ISSUE_TEXT), ...Object.values(CHANGE_STATUS_LABEL)]) assert.ok(t.length >= 7, t);
  assert.equal(new Set(CHANGE_CATEGORIES).size, CHANGE_CATEGORIES.length);
});

test("chaque e-mail de modification dit le fait, porte le lien, et ne contient aucun montant", () => {
  const mail = (over: Partial<MissionUpdateInput>) => missionUpdateEmail({ kind: "change_requested", audience: "provider", restaurantName: "Chez Nour", providerName: "Studio Lumière", url: "https://www.boosteats.be/x", ...over });
  const cases: Partial<MissionUpdateInput>[] = [
    { kind: "change_requested", audience: "provider" },
    { kind: "change_quoted", audience: "restaurant", free: false },
    { kind: "change_quoted", audience: "restaurant", free: true },
    { kind: "change_provider_declined", audience: "restaurant" },
    { kind: "change_accepted", audience: "provider", free: false },
    { kind: "change_accepted", audience: "provider", free: true },
    { kind: "change_accepted", audience: "platform" },
    { kind: "change_restaurant_declined", audience: "provider" },
    { kind: "change_withdrawn", audience: "provider" },
    { kind: "change_expired", audience: "restaurant" },
    { kind: "change_expired", audience: "provider" },
  ];
  for (const c of cases) {
    const m = mail(c);
    const label = `${c.kind}/${c.audience}/${c.free}`;
    assert.ok(m.subject.length > 10, label);
    assert.ok(m.html.includes("https://www.boosteats.be/x") && m.text.includes("https://www.boosteats.be/x"), label);
    assert.doesNotMatch(m.subject + m.text, /€|euro/i, label);
    assert.doesNotMatch(m.html, /undefined|\[object/, label);
  }
  assert.match(mail({ kind: "change_quoted", audience: "restaurant", free: true }).subject, /sans supplément/);
  assert.match(mail({ kind: "change_quoted", audience: "restaurant", free: false }).subject, /supplément/);
});

// ── les pièces jointes d'une demande ──
test("les pièces jointes d'une demande viennent du restaurateur, 3 au plus", () => {
  assert.ok(FILE_SCOPES.includes("change"));
  assert.equal(SCOPE_ACTOR.change, "restaurant");
  assert.equal(MAX_UNLINKED.change, 3);
});

// ── la migration ──
test("la migration : états, bornes et gardes comme le code", () => {
  const sql = readFileSync("docs/migrations/20261013-1400-prestataires-modifications.sql", "utf8");
  for (const s of Object.keys(CHANGE_STATUS_LABEL)) assert.ok(sql.includes(`'${s}'`), s);
  assert.match(sql, /description\s+TEXT NOT NULL CHECK \(char_length\(description\) BETWEEN 30 AND 1000\)/);
  assert.match(sql, /supplement_cents BETWEEN 0 AND 500000/);
  assert.equal(500000, MAX_SUPPLEMENT_CENTS);
  assert.match(sql, /mission_changes_one_open ON mission_changes \(mission_id\) WHERE status IN \('proposed', 'quoted'\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
  for (const c of CHANGE_CATEGORIES) assert.ok(c.length > 2);
});
