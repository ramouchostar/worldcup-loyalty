import { test } from "node:test";
import assert from "node:assert/strict";
import { QUOTE_INCLUDES, excludedFor, providerView, quoteVsBudget, restaurantView, sanitizeQuote, validateQuote, type QuoteInput } from "./mission-quote";

const ok: QuoteInput = { priceCents: 80_000, hours: 4, deliveryDays: 7, included: ["Tournage sur place", "Montage"], hypotheses: "Une seule location, deux plats." };
const codes = (q: Partial<QuoteInput>) => validateQuote({ ...ok, ...q }, "video").issues.map((i) => i.code);

test("un devis complet est valide", () => {
  assert.deepEqual(validateQuote(ok, "video"), { ok: true, issues: [] });
});

test("le prix est un montant entier de centimes, positif, plafonné", () => {
  assert.deepEqual(codes({ priceCents: 0 }), ["price_invalid"]);
  assert.deepEqual(codes({ priceCents: -5 }), ["price_invalid"]);
  assert.deepEqual(codes({ priceCents: 10.5 }), ["price_invalid"]);
  assert.deepEqual(codes({ priceCents: Number.NaN }), ["price_invalid"]);
  assert.deepEqual(codes({ priceCents: 10_000_001 }), ["price_too_high"]);
});

test("une durée est obligatoire, au quart d'heure près : « 0 heure » est la première cause de dispute", () => {
  assert.deepEqual(codes({ hours: 0 }), ["hours_invalid"]);
  assert.deepEqual(codes({ hours: 0.25 }), ["hours_invalid"]);
  assert.deepEqual(codes({ hours: 201 }), ["hours_invalid"]);
  assert.deepEqual(codes({ hours: 2.1 }), ["hours_invalid"]);
  assert.deepEqual(codes({ hours: 2.25 }), []);
  assert.deepEqual(codes({ hours: 0.5 }), []);
});

test("un délai de livraison est un nombre de jours entier", () => {
  assert.deepEqual(codes({ deliveryDays: 0 }), ["delivery_invalid"]);
  assert.deepEqual(codes({ deliveryDays: 91 }), ["delivery_invalid"]);
  assert.deepEqual(codes({ deliveryDays: 2.5 }), ["delivery_invalid"]);
});

test("un devis qui n'inclut rien est refusé, une prestation hors liste aussi", () => {
  assert.deepEqual(codes({ included: [] }), ["included_empty"]);
  assert.deepEqual(codes({ included: ["Drone"] }), ["included_unknown"]);
});

test("les hypothèses sont bornées", () => {
  assert.deepEqual(codes({ hypotheses: "x".repeat(1_001) }), ["hypotheses_too_long"]);
});

test("une entrée venue du réseau est ramenée, jamais crue", () => {
  const q = sanitizeQuote({ priceCents: "80000", hours: 4, deliveryDays: null, included: ["Montage", 7, "  Sous-titres "], hypotheses: 12 });
  assert.ok(Number.isNaN(q.priceCents));
  assert.equal(q.hours, 4);
  assert.ok(Number.isNaN(q.deliveryDays));
  assert.deepEqual(q.included, ["Montage", "Sous-titres"]);
  assert.equal(q.hypotheses, "");
  assert.equal(validateQuote(sanitizeQuote(null), "video").ok, false);
});

test("ce qui n'est pas coché est EXCLU, dans l'ordre de la liste", () => {
  assert.deepEqual(excludedFor("video", ["Tournage sur place", "Montage"]), ["Sous-titres", "Musique libre de droits", "Étalonnage des couleurs", "Formats 9:16 et 1:1"]);
  assert.deepEqual(excludedFor("video", QUOTE_INCLUDES.video), []);
});

test("le prestataire lit « vous recevez » : 87,5 % du prix du devis", () => {
  assert.deepEqual(providerView(80_000), { quoteCents: 80_000, youReceiveCents: 70_000 });
});

test("le restaurateur lit le prix selon son plan, l'acompte (20 %) et le solde", () => {
  assert.deepEqual(restaurantView(100_000, "gratuit"), { paidCents: 100_000, depositCents: 20_000, balanceCents: 80_000, depositBps: 2_000 });
  assert.deepEqual(restaurantView(100_000, "croissance"), { paidCents: 100_000, depositCents: 20_000, balanceCents: 80_000, depositBps: 2_000 });
  assert.deepEqual(restaurantView(100_000, "pro"), { paidCents: 92_500, depositCents: 18_500, balanceCents: 74_000, depositBps: 2_000 });
});

test("prix contre budget : une information, avec l'écart", () => {
  assert.deepEqual(quoteVsBudget(80_000, 100_000), { within: true, overPct: 0 });
  assert.deepEqual(quoteVsBudget(120_000, 100_000), { within: false, overPct: 20 });
  assert.equal(quoteVsBudget(80_000, null), null);
  assert.equal(quoteVsBudget(80_000, 0), null);
});
