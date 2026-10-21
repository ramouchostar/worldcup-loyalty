import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La migration des avis (ADR 0084, PR W) et le code croient aux mêmes colonnes, aux mêmes sens et à la même unicité.
const SQL = readFileSync("docs/migrations/20261021-1200-prestataires-avis.sql", "utf8");
const DB = readFileSync("lib/missions-reviews.ts", "utf8");
const ADMIN_ROUTE = readFileSync("app/api/admin/missions/[id]/review/route.ts", "utf8");
const PROVIDER_ROUTE = readFileSync("app/api/prestataire/missions/[id]/review/route.ts", "utf8");

test("un avis par mission et par sens, table réservée au service, rejouable", () => {
  assert.match(SQL, /UNIQUE \(mission_id, direction\)/);
  assert.match(SQL, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS mission_reviews/);
});

test("les deux sens du code sont ceux que la base accepte", () => {
  for (const d of ["restaurant_to_provider", "provider_to_restaurant"]) {
    assert.ok(SQL.includes(`'${d}'`), d);
    assert.ok(DB.includes(`"${d}"`), d);
  }
});

test("la lecture publique ne renvoie jamais les notes privées ni les avis masqués", () => {
  const fn = DB.slice(DB.indexOf("export async function providerReviewSummary"), DB.indexOf("export type PlatformReview"));
  assert.match(fn, /\.eq\("direction", "restaurant_to_provider"\)/);
  assert.match(fn, /\.is\("hidden_at", null\)/);
  assert.doesNotMatch(fn, /author_id/);
});

test("un doublon (23505) répond « déjà noté », jamais une erreur", () => {
  assert.match(DB, /error\.code === "23505"[\s\S]{0,60}already_reviewed/);
});

test("chaque côté n'écrit que son sens, avec sa garde", () => {
  assert.match(ADMIN_ROUTE, /requireMarketplace\(restaurantId\)/);
  assert.match(ADMIN_ROUTE, /reviewProvider\(id, restaurantId, guard\.userId/);
  assert.match(PROVIDER_ROUTE, /requireProvider\(\)/);
  assert.match(PROVIDER_ROUTE, /reviewRestaurant\(id, guard\.provider/);
  assert.doesNotMatch(ADMIN_ROUTE + PROVIDER_ROUTE, /direction/);
});
