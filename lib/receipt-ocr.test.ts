import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeReadings, needsRescue, readJsonFromContent, type Reading } from "./receipt-ocr";

const complete: Reading = {
  order_number: "2026-09-05/223/09353",
  raw_order_number: "2026-09-05/223/09353",
  key_corrected: false,
  amount: 9.8,
  has_restaurant_header: true,
  looks_like_qr_or_poster: false,
  order_time: "18:42",
  items: [{ name: "Finest Burger", quantity: 1, unit_price: 9.8 }],
  printed_date: "2026-09-05",
  channel: "Self-order kiosk",
  daily_sequence: "179",
  subtotal: 9.8,
  discount_total: null,
  payment_method: "Cash",
};
const empty: Reading = {
  order_number: null,
  raw_order_number: null,
  key_corrected: false,
  amount: null,
  has_restaurant_header: false,
  looks_like_qr_or_poster: false,
  order_time: null,
  items: [],
  printed_date: null,
  channel: null,
  daily_sequence: null,
  subtotal: null,
  discount_total: null,
  payment_method: null,
};

// ── Quand Fable relit (ADR 0072 §2, précisé par l'ADR 0073) ─────────────────

const base = { amount: 9.8, orderNumber: "2026-09-05/223/09353", hasKeyPattern: true, looksLikePoster: false, totalOrKeySeen: true } as const;

// ── ADR 0079 : pas de relecture quand le premier passage n'a rien lu d'un ticket ──

test("pas de relecture : ni total ni clé lus (photo floue, ticket trop loin, pas un ticket)", () => {
  // 16 des 35 relectures inutiles du 2026-09-30 au 2026-10-06, ~10 s d'attente chacune
  assert.equal(needsRescue({ ...base, amount: null, orderNumber: null, totalOrKeySeen: false }), false);
});

test("relecture : le total est lu mais pas la clé — un ticket est bien là", () => {
  assert.equal(needsRescue({ ...base, orderNumber: null, totalOrKeySeen: true }), true);
});

test("relecture : une clé a été lue puis écartée (code inconnu) sans total — un ticket est bien là", () => {
  assert.equal(needsRescue({ ...base, amount: null, orderNumber: null, keyIssue: "unknown_code", totalOrKeySeen: true }), true);
});

test("relecture : quand le total manque", () => {
  assert.equal(needsRescue({ ...base, amount: null }), true);
});

test("relecture : quand aucune clé n'a été lue, là où l'établissement en a une", () => {
  assert.equal(needsRescue({ ...base, orderNumber: null }), true);
});

test("relecture : une clé de mauvaise forme est probablement une lecture fausse (« 00121 » pour « 0121 »)", () => {
  assert.equal(needsRescue({ ...base, orderNumber: null, keyIssue: null }), true);
});

test("relecture : un code d'établissement que personne n'utilise (228 lu pour 223) est probablement faux", () => {
  assert.equal(needsRescue({ ...base, orderNumber: null, keyIssue: "unknown_code" }), true);
});

test("pas de relecture : la clé est celle d'un AUTRE établissement — elle est bien lue, le ticket vient d'ailleurs", () => {
  assert.equal(needsRescue({ ...base, orderNumber: null, keyIssue: "other_establishment" }), false);
});

test("pas de relecture : lecture complète", () => {
  assert.equal(needsRescue(base), false);
});

test("pas de relecture : une clé courte valide (« …/223/036 ») est une lecture complète", () => {
  assert.equal(needsRescue({ ...base, orderNumber: "2026-09-17/223/036", amount: 7.9 }), false);
});

test("pas de relecture : une affiche est refusée telle quelle, sans dépense", () => {
  assert.equal(needsRescue({ ...base, amount: null, orderNumber: null, looksLikePoster: true }), false);
});

test("pas de relecture : établissement sans clé fiable et total lu", () => {
  assert.equal(needsRescue({ ...base, orderNumber: null, hasKeyPattern: false }), false);
});

test("relecture : sans clé fiable mais sans total non plus", () => {
  assert.equal(needsRescue({ ...base, amount: null, orderNumber: null, hasKeyPattern: false }), true);
});

// ── La relecture comble, elle ne remplace pas ───────────────────────────────

test("fusion : la clé manquait, la relecture la donne", () => {
  const first: Reading = { ...complete, order_number: null, raw_order_number: null, order_time: null };
  const { merged, filled, conflict } = mergeReadings(first, { ...complete, order_time: "18:40" });
  assert.deepEqual(filled, ["key"]);
  assert.equal(conflict, false);
  assert.equal(merged.order_number, "2026-09-05/223/09353");
  assert.equal(merged.raw_order_number, "2026-09-05/223/09353");
  assert.equal(merged.order_time, "18:40"); // un trou secondaire est comblé aussi
});

test("fusion : la clé brute suit la clé retenue — celle de la relecture quand c'est elle qui l'a donnée", () => {
  const first: Reading = { ...complete, order_number: null, raw_order_number: "2026-09-05/228/09353" };
  const { merged } = mergeReadings(first, complete);
  assert.equal(merged.order_number, "2026-09-05/223/09353");
  assert.equal(merged.raw_order_number, "2026-09-05/223/09353");
});

test("fusion : le total manquait, la relecture le donne", () => {
  const { merged, filled } = mergeReadings({ ...complete, amount: null }, complete);
  assert.deepEqual(filled, ["amount"]);
  assert.equal(merged.amount, 9.8);
});

test("fusion : ce que la première lecture a lu reste, même si la relecture diffère (ticket de loin du 2026-09-20)", () => {
  const first: Reading = { ...complete, order_number: null, raw_order_number: null, amount: 73.3 };
  const second: Reading = { ...complete, order_number: "2026-09-20/223/01645", amount: 73.5 };
  const { merged, filled, conflict } = mergeReadings(first, second);
  assert.equal(merged.amount, 73.3, "le total déjà lu n'est jamais réécrit");
  assert.deepEqual(filled, ["key"]);
  assert.equal(conflict, true, "le désaccord sur le total est mesuré");
});

test("fusion : deux lectures identiques ne créent aucun désaccord", () => {
  const { filled, conflict } = mergeReadings(complete, complete);
  assert.deepEqual(filled, []);
  assert.equal(conflict, false);
});

test("fusion : rien lu par la première, rien lu par la relecture", () => {
  const { merged, filled } = mergeReadings(empty, empty);
  assert.deepEqual(filled, []);
  assert.equal(merged.order_number, null);
  assert.equal(merged.amount, null);
});

test("fusion : c'est la relecture qui dit « affiche » quand la première n'avait rien trouvé", () => {
  const { merged } = mergeReadings(empty, { ...empty, looks_like_qr_or_poster: true });
  assert.equal(merged.looks_like_qr_or_poster, true);
});

test("fusion : la clé de la relecture garde sa propre année réparée", () => {
  const { merged } = mergeReadings(empty, { ...complete, key_corrected: true });
  assert.equal(merged.key_corrected, true);
});

test("fusion : les articles de la première lecture sont gardés s'il y en a", () => {
  const { merged } = mergeReadings(complete, { ...complete, items: [{ name: "Autre", quantity: 2, unit_price: 1 }] });
  assert.equal(merged.items[0].name, "Finest Burger");
});

// ── Lire le JSON quand le modèle réfléchit ──────────────────────────────────

test("JSON : un bloc de réflexion en premier n'empêche pas de lire la réponse", () => {
  const parsed = readJsonFromContent([
    { type: "thinking" },
    { type: "text", text: '{"order_number": "2026-09-05/223/09353", "amount": 9.8, "has_restaurant_header": true}' },
  ]);
  assert.equal(parsed.order_number, "2026-09-05/223/09353");
  assert.equal(parsed.amount, 9.8);
});

test("JSON : les balises markdown autour sont retirées", () => {
  const parsed = readJsonFromContent([{ type: "text", text: '```json\n{"order_number": null, "amount": 5, "has_restaurant_header": false}\n```' }]);
  assert.equal(parsed.amount, 5);
});

test("JSON : une réponse tronquée ou vide lève une erreur (jamais une lecture inventée)", () => {
  assert.throws(() => readJsonFromContent([{ type: "text", text: '{"order_number": "2026-09' }]));
  assert.throws(() => readJsonFromContent([{ type: "thinking" }]));
});
