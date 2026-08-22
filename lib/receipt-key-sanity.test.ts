import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeKeyDate } from "./receipt-key-sanity";

// Pattern Bestelnummer legacy (lib/receipt-config.ts) : la date est le groupe 1.
const RE = /^(\d{4}-\d{2}-\d{2})\/\d{3}\/\d{5}$/;
const TODAY = "2026-08-22";

test("incident Kasia : année 2025 lue au lieu de 2026 → corrigée, pas rejetée", () => {
  const r = sanitizeKeyDate("2025-08-22/223/08228", RE, 1, TODAY);
  assert.equal(r.order_number, "2026-08-22/223/08228");
  assert.equal(r.corrected, true);
  assert.equal(r.issue, null);
  assert.equal(r.date, "2026-08-22");
});

test("date du jour correcte → inchangée", () => {
  const r = sanitizeKeyDate("2026-08-22/223/08228", RE, 1, TODAY);
  assert.equal(r.order_number, "2026-08-22/223/08228");
  assert.equal(r.corrected, false);
});

test("ticket d'il y a 10 jours → inchangé", () => {
  const r = sanitizeKeyDate("2026-08-12/100/00001", RE, 1, TODAY);
  assert.equal(r.corrected, false);
  assert.equal(r.issue, null);
});

test("année fausse mais jour hors fenêtre même corrigé → trop vieux, clé invalidée", () => {
  // 2025-01-15 → 2026-01-15 : > 45 jours avant le 22/08 → pas plausible
  const r = sanitizeKeyDate("2025-01-15/100/00001", RE, 1, TODAY);
  assert.equal(r.order_number, null);
  assert.equal(r.issue, "too_old");
});

test("date future → clé invalidée (on ne devine pas)", () => {
  const r = sanitizeKeyDate("2026-09-30/100/00001", RE, 1, TODAY);
  assert.equal(r.order_number, null);
  assert.equal(r.issue, "future");
});

test("début d'année : 2025-12-30 lu le 2026-01-05 est un vrai ticket récent → inchangé", () => {
  const r = sanitizeKeyDate("2025-12-30/100/00001", RE, 1, "2026-01-05");
  assert.equal(r.order_number, "2025-12-30/100/00001");
  assert.equal(r.corrected, false);
});

test("date impossible (31 février) → invalidée", () => {
  const r = sanitizeKeyDate("2026-02-31/100/00001", RE, 1, TODAY);
  assert.equal(r.order_number, null);
  assert.equal(r.issue, "invalid_date");
});

test("format sans date (date_group null) → inchangé", () => {
  const r = sanitizeKeyDate("A1234", /^[A-Z]\d{4}$/, null, TODAY);
  assert.equal(r.order_number, "A1234");
  assert.equal(r.date, null);
});

test("clé null → null, sans erreur", () => {
  const r = sanitizeKeyDate(null, RE, 1, TODAY);
  assert.equal(r.order_number, null);
  assert.equal(r.issue, null);
});
