import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPARISON_CHECKED, COMPARISON_ROWS, comparisonTotals, includedDetail } from "./comparatif";
import { getArticle } from "./blog";
import { BRIGADE } from "../components/restaurateurs/brigade";

// Mots du site public (mêmes règles que lib/marketing-pages.test.ts).
const BANNED = ["seo", " crm", "segment", " ia ", "intelligence artificielle", "algorithme", "copilote", "grâce à nous", "owner.com"];

test("comparatif : chaque poste a ses marques, une source et un article qui existe", () => {
  assert.equal(COMPARISON_ROWS.length, 7);
  for (const r of COMPARISON_ROWS) {
    assert.ok(r.brands.length >= 1 && r.brands.length <= 3, r.id);
    for (const b of r.brands) {
      assert.match(b.source, /^https:\/\//, `${r.id} / ${b.name} : source manquante`);
      if (b.article) assert.ok(getArticle(b.article), `${r.id} / ${b.name} → article ${b.article} absent du blog`);
    }
    const text = ` ${JSON.stringify({ ...r, brands: r.brands.map(({ name, price }) => ({ name, price })) }).toLowerCase()} `;
    assert.deepEqual(BANNED.filter((w) => text.includes(w)), [], `${r.id} : mot interdit dans le texte visible`);
  }
});

test("comparatif : Nina et Max restent en pilote, comme sur la landing (ADR 0070)", () => {
  const pilots = BRIGADE.filter((a) => a.pilot).map((a) => a.id).sort();
  assert.deepEqual(COMPARISON_ROWS.filter((r) => r.pilot).map((r) => r.id).sort(), pilots);
});

test("comparatif : totaux par forfait, la création du site hors total mensuel", () => {
  assert.deepEqual(comparisonTotals("gratuit"), { monthly: 670, oneOff: 0, count: 4, price: 0, savedMonthly: 670 });
  assert.deepEqual(comparisonTotals("croissance"), { monthly: 770, oneOff: 0, count: 5, price: 150, savedMonthly: 620 });
  assert.deepEqual(comparisonTotals("pro"), { monthly: 1270, oneOff: 700, count: 7, price: 500, savedMonthly: 770 });
});

test("comparatif : les frais Pub suivent le forfait", () => {
  const emma = COMPARISON_ROWS.find((r) => r.id === "emma")!;
  assert.equal(includedDetail(emma, "gratuit"), "frais 20 % du budget pub");
  assert.equal(includedDetail(emma, "croissance"), "frais 15 % du budget pub");
  assert.equal(includedDetail(emma, "pro"), "frais 5 % du budget pub");
});

test("comparatif : les prix des concurrents ont été relus il y a moins de 200 jours", () => {
  const days = (Date.now() - Date.parse(`${COMPARISON_CHECKED}T00:00:00Z`)) / 86_400_000;
  assert.ok(
    days < 200,
    `Prix relevés le ${COMPARISON_CHECKED} : relire chaque prix (lib/comparatif.ts et articles *-ou-boosteats), puis changer la date`,
  );
});
