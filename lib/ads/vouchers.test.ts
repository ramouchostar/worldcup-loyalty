import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOUCHER_ALPHABET,
  formatVoucherCode,
  funnelFlags,
  hasVoucherPage,
  judgeRedeem,
  newVoucherCode,
  normalizeVoucherCode,
  offerOf,
  offerWindow,
  viewSource,
  voucherAdLink,
  voucherCookieName,
  voucherPath,
} from "./vouchers";

const OFFER = { text: "Family Bucket à 19,90 €", keyword: "BUCKET", from: "2026-11-16", to: "2026-11-29" };

test("code : six caractères de l'alphabet, jamais 0, O, 1 ni I", () => {
  assert.equal(/[01OI]/.test(VOUCHER_ALPHABET), false);
  let i = 0;
  const code = newVoucherCode((n) => (i++ * 7) % n);
  assert.equal(code.length, 6);
  for (const ch of code) assert.ok(VOUCHER_ALPHABET.includes(ch));
});

test("code tapé : espaces, tiret et minuscules acceptés ; une lettre exclue n'est jamais devinée", () => {
  assert.equal(normalizeVoucherCode("k7p 4qx"), "K7P4QX");
  assert.equal(normalizeVoucherCode("K7P-4QX"), "K7P4QX");
  assert.equal(normalizeVoucherCode("K7P4Q0"), null);
  assert.equal(normalizeVoucherCode("K7P4QI"), null);
  assert.equal(normalizeVoucherCode("K7P4Q"), null);
  assert.equal(formatVoucherCode("K7P4QX"), "K7P 4QX");
});

test("offre : complète ou rien ; la page n'existe que pour une pub payée ou au-delà", () => {
  assert.deepEqual(offerOf(OFFER), OFFER);
  assert.equal(offerOf({ ...OFFER, keyword: null }), null);
  assert.equal(offerOf({ text: " ", keyword: "X", from: "2026-11-16", to: "2026-11-29" }), null);
  assert.equal(hasVoucherPage("en_diffusion", OFFER), true);
  assert.equal(hasVoucherPage("preparee", OFFER), true);
  assert.equal(hasVoucherPage("terminee", OFFER), true);
  assert.equal(hasVoucherPage("paiement_attendu", OFFER), false);
  assert.equal(hasVoucherPage("annulee", OFFER), false);
  assert.equal(hasVoucherPage("en_diffusion", null), false);
});

test("dates de l'offre : bornes comprises", () => {
  assert.equal(offerWindow(OFFER, "2026-11-15"), "avant");
  assert.equal(offerWindow(OFFER, "2026-11-16"), "ouverte");
  assert.equal(offerWindow(OFFER, "2026-11-29"), "ouverte");
  assert.equal(offerWindow(OFFER, "2026-11-30"), "finie");
});

test("caisse : un bon se valide une fois, et seulement pendant l'offre", () => {
  assert.deepEqual(judgeRedeem({ redeemedAt: null }, OFFER, "2026-11-20"), { ok: true, already: false });
  assert.deepEqual(judgeRedeem({ redeemedAt: "2026-11-20T12:00:00Z" }, OFFER, "2026-11-21"), { ok: true, already: true, at: "2026-11-20T12:00:00Z" });
  assert.deepEqual(judgeRedeem({ redeemedAt: null }, OFFER, "2026-11-30"), { ok: false, reason: "finie" });
  assert.deepEqual(judgeRedeem({ redeemedAt: null }, OFFER, "2026-11-10"), { ok: false, reason: "avant" });
});

test("lien de la pub : la page du bon, marquée Meta, avec le nom de campagne", () => {
  assert.equal(voucherPath("houba", 3), "/bon/houba/3");
  assert.equal(
    voucherAdLink("houba", 3, "BE002_houba_META_TRAFIC_v1", "https://www.boosteats.be"),
    "https://www.boosteats.be/bon/houba/3?utm_source=meta&utm_medium=paid_social&utm_campaign=BE002_houba_META_TRAFIC_v1"
  );
  assert.equal(viewSource({ utm_source: "meta" }), "meta");
  assert.equal(viewSource({ fbclid: "abc" }), "meta");
  assert.equal(viewSource({ utm_source: "flyer" }), "direct");
  assert.equal(viewSource({}), "direct");
});

test("cookie : un nom par pub, sans tiret", () => {
  assert.equal(voucherCookieName("0b6f1c2e-1111-2222-3333-444455556666"), "bon_0b6f1c2e11112222");
});

test("mesure : aucun signal sur de petits volumes, les deux seuils de l'ADR au-delà", () => {
  assert.deepEqual(funnelFlags(50, { views: 40, issued: 2, redeemed: 0 }), []);
  assert.deepEqual(funnelFlags(200, { views: 150, issued: 30, redeemed: 2 }), ["page_a_revoir", "caisse_a_revoir"]);
  assert.deepEqual(funnelFlags(200, { views: 150, issued: 60, redeemed: 12 }), []);
});

test("lien de la pub : Visites + offre → page du bon et « Obtenir l'offre » ; sinon l'itinéraire", async () => {
  const { adDestination, voucherOfferLine } = await import("./vouchers");
  const base = { offer: OFFER, vouchersReady: true, restaurantId: "houba", seq: 4, campaignName: "BE002_houba_META_TRAFIC_v1", mapsLink: "https://maps", origin: "https://www.boosteats.be" };
  const v = adDestination({ ...base, objective: "TRAFIC" });
  assert.equal(v.cta, "GET_OFFER");
  assert.equal(v.voucher, true);
  assert.match(v.link, /^https:\/\/www\.boosteats\.be\/bon\/houba\/4\?utm_source=meta/);
  assert.deepEqual(adDestination({ ...base, objective: "NOTORIETE" }), { link: "https://maps", cta: "LEARN_MORE", voucher: false });
  assert.deepEqual(adDestination({ ...base, objective: "TRAFIC", offer: null }), { link: "https://maps", cta: "LEARN_MORE", voucher: false });
  assert.deepEqual(adDestination({ ...base, objective: "TRAFIC", vouchersReady: false }), { link: "https://maps", cta: "LEARN_MORE", voucher: false });
  assert.equal(voucherOfferLine(OFFER), "🎁 Family Bucket à 19,90 €, du 16/11 au 29/11. Appuie sur « Obtenir l'offre » et montre ton bon à la caisse.");
});
