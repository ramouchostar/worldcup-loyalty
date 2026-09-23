import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCoherence, looksLikeMenuItem } from "./receipt-coherence";

const MENU = ["Magnifique Beef Menu", "Magnifique Chicken Menu", "Belkids Box", "Fries", "Smoky", "Finest"];

const item = (name: string, unit_price: number | null = null, quantity = 1) => ({ name, quantity, unit_price });

test("un article du ticket est reconnu malgré ses options", () => {
  assert.equal(looksLikeMenuItem("Magnifique Beef Menu (Medium Fries) + Extra Cheese + Mirinda", MENU), true);
  assert.equal(looksLikeMenuItem("Fries (Medium)", MENU), true);
  // Terrain 2026-09-20 : la lecture de loin a inventé des plats japonais
  assert.equal(looksLikeMenuItem("Sakisoba Rice", MENU), false);
  assert.equal(looksLikeMenuItem("Wagyu Roast", MENU), false);
});

test("le vrai ticket du 20/09 est cohérent", () => {
  const r = checkCoherence({
    amount: 73.3,
    orderNumber: "2026-09-20/223/01645",
    orderTime: "20:35",
    printedDate: "2026-09-20",
    keyDate: "2026-09-20",
    items: [item("Magnifique Beef Menu (Medium Fries)"), item("Magnifique Chicken Menu"), item("Belkids Box")],
    menuNames: MENU,
    hasDiscount: false,
  });
  assert.deepEqual(r.failed, []);
  assert.equal(r.checks.items_match_menu, true);
  assert.equal(r.checks.time_read, true);
});

test("la lecture hallucinée du même ticket est repérée", () => {
  const r = checkCoherence({
    amount: 73.5,
    orderNumber: "2026-09-20/221/04145",
    orderTime: null, // l'heure imprimée n'a pas été lue
    printedDate: null,
    keyDate: "2026-09-20",
    items: [item("Edamame Roast"), item("Wagyu Roast"), item("Mage Roast Chicken Menu"), item("Sakisoba Rice")],
    menuNames: MENU,
    hasDiscount: false,
  });
  assert.deepEqual(r.failed.sort(), ["items_match_menu", "time_read"]);
});

test("somme des lignes : contrôlée seulement si tout est lisible et sans remise", () => {
  const complet = { amount: 20, orderNumber: null, orderTime: "12:00", printedDate: null, keyDate: null, menuNames: MENU, hasDiscount: false };
  assert.equal(checkCoherence({ ...complet, items: [item("Smoky", 10), item("Finest", 10)] }).checks.items_sum_matches_total, true);
  assert.equal(checkCoherence({ ...complet, items: [item("Smoky", 3), item("Finest", 3)] }).checks.items_sum_matches_total, false);
  // Remise imprimée : la somme ne peut pas retomber juste, on ne teste pas
  assert.equal(
    checkCoherence({ ...complet, hasDiscount: true, items: [item("Smoky", 10), item("Finest", 10)] }).checks.items_sum_matches_total,
    undefined
  );
  // Un prix manquant : non testable
  assert.equal(
    checkCoherence({ ...complet, items: [item("Smoky", 10), item("Finest", null)] }).checks.items_sum_matches_total,
    undefined
  );
});

test("la date du numéro doit être celle imprimée sur le ticket", () => {
  const base = { amount: 10, orderNumber: "2026-09-20/223/01645", orderTime: "20:35", items: [], menuNames: MENU, hasDiscount: false };
  assert.equal(checkCoherence({ ...base, keyDate: "2026-09-20", printedDate: "2026-09-20" }).checks.key_date_matches_printed, true);
  assert.equal(checkCoherence({ ...base, keyDate: "2026-09-20", printedDate: "2026-09-19" }).checks.key_date_matches_printed, false);
  // Date imprimée non lue : non testable, jamais un échec
  assert.equal(checkCoherence({ ...base, keyDate: "2026-09-20", printedDate: null }).checks.key_date_matches_printed, undefined);
});

test("une carte vide ne fait échouer aucun contrôle", () => {
  const r = checkCoherence({
    amount: 10, orderNumber: null, orderTime: "12:00", printedDate: null, keyDate: null,
    items: [item("N'importe quoi")], menuNames: [], hasDiscount: false,
  });
  assert.deepEqual(r.failed, []);
});
