import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeScanOutcomes, type ScanLite } from "./scan-outcomes";

const scan = (p: Partial<ScanLite> & { id: string }): ScanLite => ({
  restaurant_id: "r1",
  user_id: null,
  ocr_order_number: null,
  outcome: "parsed",
  ...p,
});

test("l'aperçu visiteur devenu commande n'est plus « jamais soumis »", () => {
  const r = summarizeScanOutcomes([
    scan({ id: "a", ocr_order_number: "01234" }),
    scan({ id: "b", ocr_order_number: "01234", user_id: "u1", outcome: "submitted" }),
  ]);
  assert.deepEqual([...r.previewBecameOrder], ["a"]);
  assert.equal(r.abandonedTickets, 0);
});

test("le même ticket rescanné compte une seule fois", () => {
  const r = summarizeScanOutcomes([
    scan({ id: "a", ocr_order_number: "01234" }),
    scan({ id: "b", ocr_order_number: "01234", user_id: "u1" }),
    scan({ id: "c", ocr_order_number: "05555" }),
  ]);
  assert.equal(r.abandonedTickets, 2);
});

test("même numéro dans un autre restaurant = autre ticket", () => {
  const r = summarizeScanOutcomes([
    scan({ id: "a", ocr_order_number: "01234" }),
    scan({ id: "b", restaurant_id: "r2", ocr_order_number: "01234", user_id: "u1", outcome: "submitted" }),
  ]);
  assert.equal(r.previewBecameOrder.size, 0);
  assert.equal(r.abandonedTickets, 1);
});

test("sans numéro lu : une ligne = un ticket, les refus ne comptent pas", () => {
  const r = summarizeScanOutcomes([
    scan({ id: "a" }),
    scan({ id: "b" }),
    scan({ id: "c", outcome: "header_rejected" }),
  ]);
  assert.equal(r.abandonedTickets, 2);
});
