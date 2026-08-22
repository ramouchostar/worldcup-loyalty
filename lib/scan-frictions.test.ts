import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScanFrictions, type FrictionScan } from "./scan-frictions";

const t = (hhmm: string) => `2026-08-22T${hhmm}:00.000Z`;
const scan = (p: Partial<FrictionScan> & { scanned_at: string; outcome: FrictionScan["outcome"] }): FrictionScan => ({
  id: Math.random().toString(36).slice(2),
  restaurant_id: "kraainem",
  user_id: "kasia",
  ocr_order_number: "2025-08-22/223/08228",
  ocr_amount: 41.8,
  ocr_has_restaurant_header: true,
  ...p,
});

test("incident Kasia : 6 essais en 9 min puis soumission → 1 friction résolue, indices année + même n°", () => {
  const scans = [
    scan({ scanned_at: t("13:34"), outcome: "parsed" }),
    scan({ scanned_at: t("13:36"), outcome: "parsed" }),
    scan({ scanned_at: t("13:36"), outcome: "header_rejected", ocr_has_restaurant_header: false }),
    scan({ scanned_at: t("13:36"), outcome: "parsed" }),
    scan({ scanned_at: t("13:37"), outcome: "parsed", ocr_order_number: "2025-08-22/223/08229", ocr_amount: 44.77 }),
    scan({ scanned_at: t("13:38"), outcome: "parsed" }),
    scan({ scanned_at: t("13:43"), outcome: "submitted", ocr_order_number: "2026-08-22/223/08228" }),
  ];
  const f = detectScanFrictions(scans);
  assert.equal(f.length, 1);
  assert.equal(f[0].attempts, 6);
  assert.equal(f[0].resolved, true);
  assert.ok(f[0].hints.some((h) => /année lue/.test(h)), f[0].hints.join(" | "));
});

test("un scan puis soumission immédiate → aucune friction", () => {
  const f = detectScanFrictions([
    scan({ scanned_at: t("12:00"), outcome: "parsed" }),
    scan({ scanned_at: t("12:01"), outcome: "submitted" }),
  ]);
  assert.equal(f.length, 0);
});

test("3 essais non soumis espacés de plus de 10 min → pas une série", () => {
  const f = detectScanFrictions([
    scan({ scanned_at: t("10:00"), outcome: "parsed" }),
    scan({ scanned_at: t("10:20"), outcome: "parsed" }),
    scan({ scanned_at: t("10:40"), outcome: "parsed" }),
  ]);
  assert.equal(f.length, 0);
});

test("3 essais en 5 min jamais soumis → friction NON résolue", () => {
  const f = detectScanFrictions([
    scan({ scanned_at: t("18:00"), outcome: "parsed", user_id: "u2" }),
    scan({ scanned_at: t("18:02"), outcome: "header_rejected", user_id: "u2", ocr_has_restaurant_header: false }),
    scan({ scanned_at: t("18:05"), outcome: "parsed", user_id: "u2" }),
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].resolved, false);
  assert.equal(f[0].user_id, "u2");
});

test("deux membres distincts ne se mélangent pas", () => {
  const f = detectScanFrictions([
    scan({ scanned_at: t("09:00"), outcome: "parsed", user_id: "a" }),
    scan({ scanned_at: t("09:01"), outcome: "parsed", user_id: "b" }),
    scan({ scanned_at: t("09:02"), outcome: "parsed", user_id: "a" }),
    scan({ scanned_at: t("09:03"), outcome: "parsed", user_id: "b" }),
  ]);
  assert.equal(f.length, 0); // 2 chacun, sous le seuil
});
