import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  apiWindowFor,
  channelKey,
  gap,
  parseMoney,
  readState,
  salesDayOf,
  signState,
  summarizeByDay,
  toStoredOrder,
  verifyCallbackSignature,
  type HubriseOrder,
} from "./model";

test("les montants HubRise se lisent « 12.50 EUR »", () => {
  assert.deepEqual(parseMoney("12.50 EUR"), { amount: 12.5, currency: "EUR" });
  assert.deepEqual(parseMoney("0.00 EUR"), { amount: 0, currency: "EUR" });
  assert.equal(parseMoney("12,50 €"), null);
  assert.equal(parseMoney(null), null);
});

test("jour de vente : à Bruxelles, la veille avant 5 h, heure d'hiver comme d'été", () => {
  assert.equal(salesDayOf("2026-11-13T21:30:00+01:00"), "2026-11-13");
  assert.equal(salesDayOf("2026-11-14T00:45:00+01:00"), "2026-11-13"); // fermeture de caisse
  assert.equal(salesDayOf("2026-11-14T04:59:00+01:00"), "2026-11-13");
  assert.equal(salesDayOf("2026-11-14T05:00:00+01:00"), "2026-11-14");
  // Un horodatage UTC est ramené à Bruxelles : 23 h 30 UTC = 0 h 30 l'hiver.
  assert.equal(salesDayOf("2026-11-13T23:30:00Z"), "2026-11-13");
  // Été : 2 h 30 UTC = 4 h 30 à Bruxelles → encore la veille.
  assert.equal(salesDayOf("2026-07-02T02:30:00Z"), "2026-07-01");
  assert.equal(salesDayOf("pas une date"), null);
});

test("la fenêtre demandée à l'API couvre le jour de vente en hiver comme en été", () => {
  const w = apiWindowFor("2026-11-13");
  assert.equal(w.after, "2026-11-13T02:00:00Z");
  assert.equal(w.before, "2026-11-14T05:00:00Z");
  // 5 h à Bruxelles l'hiver = 4 h UTC : inclus ; l'été = 3 h UTC : inclus.
  assert.ok(Date.parse("2026-11-13T04:00:00Z") >= Date.parse(w.after));
  assert.ok(Date.parse("2026-11-14T03:59:00Z") < Date.parse(w.before));
});

test("canaux : mêmes clés que la saisie du CA du jour", () => {
  assert.equal(channelKey("Uber Eats"), "uber");
  assert.equal(channelKey("UBER_EATS"), "uber");
  assert.equal(channelKey("Deliveroo"), "deliveroo");
  assert.equal(channelKey("Just Eat Takeaway"), "takeaway");
  assert.equal(channelKey("Website"), "autre");
  assert.equal(channelKey(null), "autre");
});

const ORDER: HubriseOrder & Record<string, unknown> = {
  id: "5dpm9",
  location_id: "1y43q-0",
  status: "completed",
  created_at: "2026-11-13T19:07:53+01:00",
  channel: "Uber Eats",
  service_type: "delivery",
  total: "27.40 EUR",
  items: [
    { product_name: "Family Bucket", sku_name: null, quantity: "1", price: "24.90 EUR", subtotal: "24.90 EUR" },
    { product_name: "Coca", quantity: "1", price: "2.50 EUR", subtotal: "2.50 EUR", deleted: true },
  ],
  discounts: [{ price_off: "2.00 EUR" }],
  charges: [{ price: "1.50 EUR" }],
  customer: { first_name: "Jean", phone: "+32470000000", address_1: "rue X" },
  payments: [{ amount: "27.40 EUR", info: { card: "1234" } }],
};

test("une commande stockée ne garde aucune donnée client (ADR 0025)", () => {
  const s = toStoredOrder(ORDER);
  assert.ok(s);
  const json = JSON.stringify(s);
  for (const leak of ["Jean", "+3247", "rue X", "1234", "customer", "payments"]) {
    assert.ok(!json.includes(leak), `fuite : ${leak}`);
  }
  assert.equal(s.total, 27.4);
  assert.equal(s.currency, "EUR");
  assert.equal(s.discounts, 2);
  assert.equal(s.charges, 1.5);
  assert.equal(s.sales_day, "2026-11-13");
  assert.equal(s.items.length, 1); // l'article supprimé est écarté
  assert.equal(s.items[0].quantity, 1);
});

test("le jour par canal exclut les commandes annulées, refusées, non livrées", () => {
  const rows = [
    { sales_day: "2026-11-13", channel: "Uber Eats", status: "completed", total: 20, first_received_via: "callback" as const },
    { sales_day: "2026-11-13", channel: "Uber Eats", status: "accepted", total: 10.5, first_received_via: "sync" as const },
    { sales_day: "2026-11-13", channel: "Uber Eats", status: "cancelled", total: 99, first_received_via: "callback" as const },
    { sales_day: "2026-11-13", channel: "Uber Eats", status: "delivery_failed", total: 5, first_received_via: "callback" as const },
    { sales_day: "2026-11-14", channel: "Deliveroo", status: "completed", total: 15, first_received_via: "callback" as const },
  ];
  const m = summarizeByDay(rows);
  assert.deepEqual(m.get("2026-11-13")?.channels.uber, { orders: 2, amount: 30.5, excluded: 2 });
  assert.equal(m.get("2026-11-13")?.viaCallback, 3);
  assert.equal(m.get("2026-11-13")?.all, 4);
  assert.equal(m.get("2026-11-14")?.channels.deliveroo?.amount, 15);
});

test("écart à la référence, en euros et en pourcentage", () => {
  assert.deepEqual(gap(270, 266), { eur: 4, pct: 1.5 });
  assert.deepEqual(gap(250, 266), { eur: -16, pct: -6 });
  assert.deepEqual(gap(10, 0), { eur: 10, pct: null });
});

test("signature d'un rappel : HMAC-SHA256 hex du corps brut avec le secret client", () => {
  const body = '{"id":"ks8f6","resource_type":"order"}';
  const sig = createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifyCallbackSignature(body, sig, "secret"), true);
  assert.equal(verifyCallbackSignature(body, sig.toUpperCase(), "secret"), true);
  assert.equal(verifyCallbackSignature(body + " ", sig, "secret"), false);
  assert.equal(verifyCallbackSignature(body, sig, "autre"), false);
  assert.equal(verifyCallbackSignature(body, null, "secret"), false);
});

test("state OAuth : signé, expiré après 15 min, refusé s'il est modifié", () => {
  const now = 1_800_000_000_000;
  const s = signState({ r: "kraainem", u: "user-1", t: now }, "k");
  assert.deepEqual(readState(s, "k", now + 60_000), { r: "kraainem", u: "user-1", t: now });
  assert.equal(readState(s, "k", now + 16 * 60_000), null);
  assert.equal(readState(s, "autre", now), null);
  const [body, sig] = s.split(".");
  const forged = Buffer.from(JSON.stringify({ r: "houba", u: "user-1", t: now })).toString("base64url");
  assert.equal(readState(`${forged}.${sig}`, "k", now), null);
  assert.equal(readState(`${body}`, "k", now), null);
  assert.equal(readState(null, "k", now), null);
});
