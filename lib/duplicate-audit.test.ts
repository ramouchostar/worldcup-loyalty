import { test } from "node:test";
import assert from "node:assert/strict";
import { replayDuplicates, buildAuditReport, type AuditOrder } from "./duplicate-audit";
import type { FingerprintLine } from "./receipt-fingerprint";

const TICKET: FingerprintLine[] = [
  { name: "Finest (Burger)", quantity: 1, unit_price: 11.5 },
  { name: "Fries (Medium)", quantity: 2, unit_price: 3.2 },
];

function order(over: Partial<AuditOrder> & { id: string; submitted_at: string }): AuditOrder {
  return {
    restaurant_id: "kraainem",
    user_id: "membre-a",
    amount: 17.9,
    order_date: "2026-08-22",
    order_time: "13:34",
    order_number: "2026-08-22/223/08228",
    ...over,
  };
}

test("le rejeu retrouve le doublon dont le numéro a été mal lu", () => {
  const orders = [
    order({ id: "o1", submitted_at: "2026-08-22T13:36:00Z" }),
    order({
      id: "o2",
      submitted_at: "2026-08-22T13:43:00Z",
      order_number: "2026-08-22/223/08223", // 8 relu 3
    }),
  ];
  const items = new Map([
    ["o1", TICKET],
    ["o2", TICKET],
  ]);

  const findings = replayDuplicates(orders, items);
  assert.equal(findings.length, 1);
  // Le SECOND ticket est le fautif — jamais le premier, qui était légitime.
  assert.equal(findings[0].order.id, "o2");
  assert.equal(findings[0].matched?.id, "o1");
  assert.equal(findings[0].verdict.decision, "duplicate");
});

test("le rejeu est chronologique quel que soit l'ordre reçu", () => {
  const tard = order({
    id: "o2",
    submitted_at: "2026-08-22T13:43:00Z",
    order_number: "2026-08-22/223/08223",
  });
  const tot = order({ id: "o1", submitted_at: "2026-08-22T13:36:00Z" });
  const items = new Map([
    ["o1", TICKET],
    ["o2", TICKET],
  ]);

  // Entrée volontairement à l'envers : le tri doit remettre les choses en place.
  const findings = replayDuplicates([tard, tot], items);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].order.id, "o2");
});

test("deux établissements ne se contaminent jamais", () => {
  const orders = [
    order({ id: "o1", submitted_at: "2026-08-22T13:36:00Z" }),
    order({
      id: "o2",
      submitted_at: "2026-08-22T13:37:00Z",
      restaurant_id: "houba",
      order_number: "2026-08-22/258/08228",
    }),
  ];
  const items = new Map([
    ["o1", TICKET],
    ["o2", TICKET],
  ]);
  assert.equal(replayDuplicates(orders, items).length, 0);
});

test("un historique sain ne produit aucun constat", () => {
  const orders = [
    order({ id: "o1", submitted_at: "2026-08-22T13:36:00Z" }),
    order({
      id: "o2",
      submitted_at: "2026-08-22T19:20:00Z",
      order_time: "19:15",
      order_number: "2026-08-22/223/08402",
    }),
  ];
  const items = new Map([
    ["o1", TICKET],
    ["o2", TICKET],
  ]);
  assert.equal(replayDuplicates(orders, items).length, 0);
});

test("le rapport compte les points et les euros comptés deux fois", () => {
  const orders = [
    order({ id: "o1", submitted_at: "2026-08-22T13:36:00Z" }),
    order({
      id: "o2",
      submitted_at: "2026-08-22T13:43:00Z",
      order_number: "2026-08-22/223/08223",
    }),
  ];
  const items = new Map([
    ["o1", TICKET],
    ["o2", TICKET],
  ]);
  const findings = replayDuplicates(orders, items);

  const md = buildAuditReport({
    findings,
    ordersExamined: orders.length,
    itemsByOrder: items,
    memberById: new Map([["membre-a", "Kasia"]]),
    since: "2026-08-01",
    restaurantId: "kraainem",
    generatedAt: "2026-09-04 19:00",
  });

  assert.match(md, /# Audit rétroactif des doublons/);
  assert.match(md, /Ce rapport ne modifie rien/);
  assert.match(md, /Doublons \*\*certains\*\* \| \*\*1\*\*/);
  // floor(17,90) = 17 points crédités en trop.
  assert.match(md, /Points crédités en trop \(doublons certains\) \| \*\*17\*\*/);
  assert.match(md, /17,90 €/);
  assert.match(md, /Kasia/);
  assert.match(md, /2026-08-22\/223\/08223/);
  assert.match(md, /Finest \(Burger\)/);
});

test("un rapport vide reste un rapport lisible", () => {
  const md = buildAuditReport({
    findings: [],
    ordersExamined: 0,
    itemsByOrder: new Map(),
    memberById: new Map(),
    since: "2026-08-01",
    restaurantId: null,
    generatedAt: "2026-09-04 19:00",
  });
  assert.match(md, /tous établissements/);
  assert.match(md, /_Aucun\._/);
  assert.match(md, /Doublons \*\*certains\*\* \| \*\*0\*\*/);
});

test("un libellé d'article contenant une barre ne casse pas le tableau", () => {
  const piege: FingerprintLine[] = [{ name: "Menu | XL", quantity: 1, unit_price: 12 }];
  const orders = [
    order({ id: "o1", submitted_at: "2026-08-22T13:36:00Z", amount: 12 }),
    order({
      id: "o2",
      submitted_at: "2026-08-22T13:43:00Z",
      amount: 12,
      order_number: "2026-08-22/223/08223",
    }),
  ];
  const items = new Map([
    ["o1", piege],
    ["o2", piege],
  ]);
  const md = buildAuditReport({
    findings: replayDuplicates(orders, items),
    ordersExamined: 2,
    itemsByOrder: items,
    memberById: new Map(),
    since: "2026-08-01",
    restaurantId: "kraainem",
    generatedAt: "2026-09-04 19:00",
  });
  assert.match(md, /Menu \\\| XL/);
  // La ligne du tableau garde ses 10 colonnes malgré la barre échappée.
  const ligne = md.split("\n").find((l) => l.includes("Menu \\| XL"));
  assert.ok(ligne);
  assert.equal(ligne!.split(/(?<!\\)\|/).length - 2, 10);
});
