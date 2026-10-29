import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTargeting,
  brusselsOffset,
  dailyBudgetCents,
  dayCount,
  dayStatFromInsight,
  epcPayload,
  judgeOffer,
  judgeRequest,
  metaTimes,
  normalizeVat,
  offerLine,
  rankInstagramPosts,
  statusFromMeta,
  type IgMedia,
} from "./meta-spec";

const VALID = {
  objective: "TRAFIC",
  budgetEuros: 200,
  startsOn: "2026-10-24",
  endsOn: "2026-11-07",
  radiusKm: 3,
  adText: "Le Crousti du vendredi t'attend.",
  creative: { kind: "instagram_post", mediaId: "18048049838009245", mediaType: "VIDEO", permalink: null, thumbnail: null },
  billing: { legalName: "Houba SRL", vatNumber: "be 0123.456.789", address: "Av. Houba de Strooper 96, 1020 Bruxelles" },
  termsAccepted: true,
};

test("demande valide : budget en centimes, TVA normalisée", () => {
  const r = judgeRequest(VALID, "2026-10-23");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.input.budgetCents, 20000);
  assert.equal(r.input.billing.vatNumber, "BE0123456789");
});

test("objectifs fermés : MESSAGES refusé au formulaire", () => {
  assert.deepEqual(judgeRequest({ ...VALID, objective: "MESSAGES" }, "2026-10-23"), { ok: false, issue: "objective" });
});

test("budget sous 100 € ou non entier : refusé", () => {
  assert.equal(judgeRequest({ ...VALID, budgetEuros: 99 }, "2026-10-23").ok, false);
  assert.equal(judgeRequest({ ...VALID, budgetEuros: 150.5 }, "2026-10-23").ok, false);
});

test("début au plus tôt demain, fin après début, 90 jours au plus", () => {
  assert.deepEqual(judgeRequest({ ...VALID, startsOn: "2026-10-23" }, "2026-10-23"), { ok: false, issue: "start_past" });
  assert.deepEqual(judgeRequest({ ...VALID, endsOn: "2026-10-20" }, "2026-10-19"), { ok: false, issue: "dates" });
  assert.deepEqual(judgeRequest({ ...VALID, endsOn: "2027-03-01" }, "2026-10-23"), { ok: false, issue: "too_long" });
});

test("VIDEO exige une vidéo", () => {
  const photo = { kind: "upload", path: "houba/x.jpg", mime: "image/jpeg" };
  assert.deepEqual(judgeRequest({ ...VALID, objective: "VIDEO", creative: photo }, "2026-10-23"), { ok: false, issue: "needs_video" });
  assert.equal(judgeRequest({ ...VALID, objective: "VIDEO" }, "2026-10-23").ok, true);
});

test("conditions non acceptées : refusé", () => {
  assert.deepEqual(judgeRequest({ ...VALID, termsAccepted: false }, "2026-10-23"), { ok: false, issue: "terms" });
});

test("TVA vide permise, mal formée refusée", () => {
  assert.equal(normalizeVat("  "), null);
  assert.equal(judgeRequest({ ...VALID, billing: { ...VALID.billing, vatNumber: "" } }, "2026-10-23").ok, true);
  assert.deepEqual(judgeRequest({ ...VALID, billing: { ...VALID.billing, vatNumber: "123" } }, "2026-10-23"), { ok: false, issue: "billing_vat" });
});

test("budget par jour : réparti sur les jours, bornes comprises", () => {
  assert.equal(dayCount("2026-10-24", "2026-11-07"), 15);
  assert.equal(dailyBudgetCents(20000, "2026-10-24", "2026-11-07"), 1333);
  assert.equal(dayCount("2026-10-24", "2026-10-24"), 1);
});

test("heures de Bruxelles : été puis hiver (passage le 25 octobre 2026)", () => {
  assert.equal(brusselsOffset("2026-10-24"), "+0200");
  assert.equal(brusselsOffset("2026-11-07"), "+0100");
  assert.deepEqual(metaTimes("2026-10-24", "2026-11-07"), { start_time: "2026-10-24T00:00:00+0200", end_time: "2026-11-07T23:59:00+0100" });
});

test("ciblage : rayon autour du resto, tous âges, Advantage+ coupé", () => {
  const t = buildTargeting({ lat: 50.888337, lng: 4.3387301, radiusKm: 3 });
  assert.equal(t.geo_locations.custom_locations[0].radius, 3);
  assert.equal(t.age_min, 18);
  assert.equal(t.age_max, 65);
});

test("résultats selon l'objectif", () => {
  const row = { date_start: "2026-10-24", spend: "12.34", impressions: "1500", reach: "900", inline_link_clicks: "41", actions: [{ action_type: "video_view", value: "300" }] };
  assert.deepEqual(dayStatFromInsight(row, "TRAFIC"), { day: "2026-10-24", spendCents: 1234, impressions: 1500, reach: 900, clicks: 41, results: 41, resultKind: "clics" });
  assert.equal(dayStatFromInsight(row, "NOTORIETE").results, 900);
  assert.equal(dayStatFromInsight(row, "VIDEO").results, 300);
  assert.equal(dayStatFromInsight(row, null).resultKind, null);
});

test("état déduit de Meta : plafond atteint ou date passée → terminée", () => {
  const base = { current: "en_diffusion" as const, effectiveStatus: "ACTIVE", spentCents: 5000, capCents: 20000, endsOn: "2026-11-07", today: "2026-10-30" };
  assert.equal(statusFromMeta(base), "en_diffusion");
  assert.equal(statusFromMeta({ ...base, spentCents: 19950 }), "terminee");
  assert.equal(statusFromMeta({ ...base, today: "2026-11-08" }), "terminee");
  assert.equal(statusFromMeta({ ...base, effectiveStatus: "CAMPAIGN_PAUSED" }), "en_pause");
  assert.equal(statusFromMeta({ ...base, current: "preparee", effectiveStatus: "ACTIVE" }), "preparee");
});

test("publications Instagram : la vidéo récente engageante passe devant", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const media: IgMedia[] = [
    { id: "1", media_type: "IMAGE", like_count: 60, comments_count: 0, timestamp: "2024-01-01T00:00:00Z" },
    { id: "2", media_type: "VIDEO", like_count: 30, comments_count: 5, timestamp: "2026-10-10T00:00:00Z" },
    { id: "3", media_type: "IMAGE", like_count: 30, comments_count: 5, timestamp: "2026-10-10T00:00:00Z" },
  ];
  assert.deepEqual(rankInstagramPosts(media, now).map((m) => m.id), ["2", "3", "1"]);
  assert.equal(rankInstagramPosts(media, now, 1).length, 1);
});

test("QR EPC : montant au point, communication structurée en ligne libre", () => {
  const p = epcPayload({ bic: "REVOBEB2", holder: "Mehdi Haik", iban: "BE00000000000000", amountCents: 23000, communication: "+++002/0000/00156+++" }).split("\n");
  assert.equal(p[0], "BCD");
  assert.equal(p[7], "EUR230.00");
  assert.equal(p[10], "+++002/0000/00156+++");
});

test("offre : facultative, sinon texte + mot clé + dates", () => {
  assert.equal(judgeOffer({}).ok, true);
  assert.deepEqual(judgeOffer({ text: "", keyword: "" }), { ok: true, offer: null });
  const ok = judgeOffer({ text: "Family Bucket = 5 Junior Burgers offerts", keyword: "crousti", from: "2026-11-07", to: "2026-11-21" });
  assert.deepEqual(ok, { ok: true, offer: { text: "Family Bucket = 5 Junior Burgers offerts", keyword: "CROUSTI", from: "2026-11-07", to: "2026-11-21" } });
  assert.deepEqual(judgeOffer({ text: "Family Bucket", keyword: "deux mots", from: "2026-11-07", to: "2026-11-21" }), { ok: false, issue: "offer_keyword" });
  assert.deepEqual(judgeOffer({ text: "Family Bucket", keyword: "CROUSTI", from: "2026-11-21", to: "2026-11-07" }), { ok: false, issue: "offer_dates" });
  assert.deepEqual(judgeRequest({ ...VALID, offer: { text: "x" } }, "2026-10-23"), { ok: false, issue: "offer" });
});

test("offre : la ligne ajoutée au texte de la pub", () => {
  assert.equal(offerLine({ text: "Family Bucket = 5 Junior Burgers offerts", keyword: "CROUSTI", from: "2026-11-07", to: "2026-11-21" }), "🎁 Family Bucket = 5 Junior Burgers offerts avec le mot CROUSTI, du 7/11 au 21/11.");
});
