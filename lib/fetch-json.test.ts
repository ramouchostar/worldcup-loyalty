import { test } from "node:test";
import assert from "node:assert/strict";
import { describeHttpFailure, readJsonSafe } from "./fetch-json";

test("413 plateforme (corps texte) → message vrai, jamais « réseau »", () => {
  const m = describeHttpFailure(413, null);
  assert.match(m, /trop lourd/);
  assert.doesNotMatch(m, /réseau/);
});

test("message serveur explicite → prime sur le statut", () => {
  assert.equal(describeHttpFailure(400, "Montant invalide."), "Montant invalide.");
  assert.equal(describeHttpFailure(502, "Import échoué : colonne date absente."), "Import échoué : colonne date absente.");
});

test("readJsonSafe ne lève jamais sur un corps non-JSON", async () => {
  const res = new Response("Request Entity Too Large\nFUNCTION_PAYLOAD_TOO_LARGE", { status: 413 });
  const r = await readJsonSafe(res);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
  assert.equal(r.data, null);
});

test("readJsonSafe lit le JSON quand il y en a", async () => {
  const res = new Response(JSON.stringify({ ok: true, n: 3 }), { status: 200, headers: { "content-type": "application/json" } });
  const r = await readJsonSafe<{ ok: boolean; n: number }>(res);
  assert.equal(r.ok, true);
  assert.equal(r.data?.n, 3);
});
