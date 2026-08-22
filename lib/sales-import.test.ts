import { test } from "node:test";
import assert from "node:assert/strict";
import { guessMappingSmart, parseCsvTable } from "./sales-import";

const table = (csv: string) => parseCsvTable(csv);

test("rapport hebdo « Semaine du ; Chiffre d'affaires » → date + montant devinés", () => {
  const { headers, rows } = table("Semaine du;Chiffre d'affaires\n04/05/2026;6000\n11/05/2026;6100\n18/05/2026;6200\n");
  const m = guessMappingSmart(headers, rows);
  assert.equal(m.date, 0);
  assert.equal(m.amount, 1);
});

test("en-têtes exotiques (« Periode », « Omzet ») → devinés par le contenu", () => {
  const { headers, rows } = table("Periode,Omzet\n2026-06-01,1234.50\n2026-06-02,980.00\n2026-06-03,1105.25\n");
  const m = guessMappingSmart(headers, rows);
  assert.equal(m.date, 0);
  assert.equal(m.amount, 1);
});

test("sans aucun en-tête parlant (Col1/Col2/Col3) → la colonne de dates et la colonne la plus « totale »", () => {
  // col0 = n° ticket (petit entier), col1 = date, col2 = quantité, col3 = total
  const { headers, rows } = table("A;B;C;D\n101;01/06/2026;2;24,50\n102;01/06/2026;1;12,00\n103;02/06/2026;3;41,70\n104;02/06/2026;1;9,90\n");
  const m = guessMappingSmart(headers, rows);
  assert.equal(m.date, 1);
  assert.equal(m.amount, 3, "le total (moyenne la plus haute) l'emporte sur la quantité");
});

test("date+heure dans une cellule + colonne heure séparée → la date n'est pas prise pour un montant", () => {
  const { headers, rows } = table("Date;Heure;Total TTC\n12/06/2026;12:30;18,90\n12/06/2026;19:05;32,40\n13/06/2026;13:10;11,00\n");
  const m = guessMappingSmart(headers, rows);
  assert.deepEqual(m, { date: 0, time: 1, amount: 2 });
});

test("en-tête « Date » explicite mais contenu vide → on ne s'accroche pas à l'en-tête", () => {
  const { headers, rows } = table("Date;Jour de vente;Montant\n;01/06/2026;50\n;02/06/2026;60\n;03/06/2026;70\n");
  const m = guessMappingSmart(headers, rows);
  assert.equal(m.date, 1);
  assert.equal(m.amount, 2);
});

test("totaux mensuels « Mois ; CA TTC » → date mensuelle + montant", () => {
  const { headers, rows } = table("Mois;CA TTC\n2026-01-01;41000\n2026-02-01;39500\n2026-03-01;44200\n");
  const m = guessMappingSmart(headers, rows);
  assert.equal(m.date, 0);
  assert.equal(m.amount, 1);
});
