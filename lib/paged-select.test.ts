import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, fetchAllRowsStrict } from "./paged-select";

// Une « table » de n lignes lue comme PostgREST : `.range(from, to)` rend au plus
// `serverCap` lignes (le `max_rows` du projet), jamais d'erreur quand on en demande plus.
function table(n: number, serverCap = 1000) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + serverCap - 1, n - 1);
    const data = [];
    for (let i = from; i <= end; i++) data.push({ id: i });
    return { data, error: null };
  };
  return { page, calls };
}

test("plus de 1 000 lignes : tout est lu, page après page", async () => {
  const t = table(2500);
  const { rows, truncated } = await fetchAllRows<{ id: number }>(t.page);
  assert.equal(rows.length, 2500);
  assert.equal(truncated, false);
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  // aucune ligne sautée ni doublée
  assert.deepEqual(rows.map((r) => r.id), Array.from({ length: 2500 }, (_, i) => i));
});

test("exactement 1 000 lignes : une page vide confirme la fin, sans troncature", async () => {
  const t = table(1000);
  const { rows, truncated } = await fetchAllRows<{ id: number }>(t.page);
  assert.equal(rows.length, 1000);
  assert.equal(truncated, false);
  assert.equal(t.calls.length, 2);
});

test("table vide ou presque : une seule requête", async () => {
  const t = table(3);
  const { rows, truncated } = await fetchAllRows<{ id: number }>(t.page);
  assert.equal(rows.length, 3);
  assert.equal(truncated, false);
  assert.equal(t.calls.length, 1);
});

test("plafond de sécurité atteint : on le SIGNALE au lieu de rendre un total partiel", async () => {
  const t = table(5000);
  const { rows, truncated } = await fetchAllRows<{ id: number }>(t.page, { maxRows: 2000 });
  assert.equal(rows.length, 2000);
  assert.equal(truncated, true);
});

test("une erreur de lecture remonte, elle n'est pas prise pour une table vide", async () => {
  await assert.rejects(
    fetchAllRows(async () => ({ data: null, error: { message: "boom" } })),
    /boom/
  );
});

test("lecture stricte : rend directement les lignes quand tout est lu", async () => {
  const t = table(1500);
  const rows = await fetchAllRowsStrict<{ id: number }>("Ventes par plat : tickets", t.page);
  assert.equal(rows.length, 1500);
});

test("lecture stricte : un résultat tronqué est REFUSÉ, avec le nom de la lecture", async () => {
  const t = table(5000);
  await assert.rejects(
    fetchAllRowsStrict<{ id: number }>("Opportunités : tickets", t.page, { maxRows: 2000 }),
    /Opportunités : tickets : plafond de lecture atteint \(2000 lignes\), résultat refusé/
  );
});

test("lecture stricte : une erreur de lecture remonte aussi", async () => {
  await assert.rejects(
    fetchAllRowsStrict("Mes clients : adhésions", async () => ({ data: null, error: { message: "table absente" } })),
    /table absente/
  );
});
