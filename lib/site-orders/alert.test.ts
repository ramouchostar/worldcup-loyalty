import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REPEATS, REPEAT_MS, acknowledge, alertTitle, gaveUp, initialAlert, stepAlert, type AlertState } from "./alert";
import type { OrderView } from "./service";

const order = (id: string, status: OrderView["status"] = "recue"): OrderView => ({
  id, number: id.padStart(4, "0"), firstName: "Amina", phone: null, lines: [], totalCents: 100, status,
  createdAt: "2026-11-13T12:00:00Z", readyAt: null, pickedUpAt: null, cancelledAt: null, cancelReason: null,
});

const run = (state: AlertState, orders: OrderView[], now: number) => stepAlert(state, orders, now);

test("première lecture : rien ne sonne, même avec des commandes déjà là", () => {
  const r = run(initialAlert(), [order("1"), order("2")], 0);
  assert.equal(r.ring, false);
  assert.deepEqual(r.state.waiting, []);
  assert.equal(r.state.seen?.size, 2);
});

test("une nouvelle commande reçue sonne tout de suite", () => {
  const first = run(initialAlert(), [order("1")], 0).state;
  const r = run(first, [order("1"), order("2")], 10_000);
  assert.equal(r.ring, true);
  assert.deepEqual(r.fresh.map((o) => o.id), ["2"]);
  assert.deepEqual(r.state.waiting, ["2"]);
  assert.equal(r.state.rings, 1);
});

test("une lecture sans rien de neuf ne sonne pas, et se rappelle après 30 s", () => {
  let s = run(initialAlert(), [], 0).state;
  s = run(s, [order("1")], 10_000).state;
  const quiet = run(s, [order("1")], 10_000 + REPEAT_MS - 1);
  assert.equal(quiet.ring, false);
  const again = run(quiet.state, [order("1")], 10_000 + REPEAT_MS);
  assert.equal(again.ring, true);
  assert.equal(again.state.rings, 2);
});

test("le rappel s'arrête après 10 sonneries, mais l'alerte reste visible", () => {
  let s = run(initialAlert(), [], 0).state;
  let t = 1000;
  s = run(s, [order("1")], t).state;
  let rings = 1;
  for (let i = 0; i < 30; i++) {
    t += REPEAT_MS;
    const r = run(s, [order("1")], t);
    if (r.ring) rings++;
    s = r.state;
  }
  assert.equal(rings, MAX_REPEATS);
  assert.equal(s.waiting.length, 1);
  assert.equal(gaveUp(s), true);
});

test("« J'ai vu » éteint l'alerte et la commande ne sonne plus", () => {
  let s = run(initialAlert(), [], 0).state;
  s = run(s, [order("1")], 1000).state;
  s = acknowledge(s);
  assert.deepEqual(s.waiting, []);
  const r = run(s, [order("1")], 1000 + REPEAT_MS * 3);
  assert.equal(r.ring, false);
  assert.equal(gaveUp(s), false);
});

test("passer la commande à « prête » ou l'annuler suffit à l'acquitter", () => {
  let s = run(initialAlert(), [], 0).state;
  s = run(s, [order("1"), order("2")], 1000).state;
  assert.deepEqual(s.waiting, ["1", "2"]);
  const r = run(s, [order("1", "prete"), order("2", "annulee")], 2000);
  assert.deepEqual(r.state.waiting, []);
  assert.equal(r.ring, false);
});

test("une deuxième commande pendant une alerte sonne à nouveau et remet le compteur à un", () => {
  let s = run(initialAlert(), [], 0).state;
  s = run(s, [order("1")], 1000).state;
  s = run(s, [order("1")], 1000 + REPEAT_MS).state; // rappel : 2 sonneries
  const r = run(s, [order("1"), order("2")], 1000 + REPEAT_MS + 5000);
  assert.equal(r.ring, true);
  assert.deepEqual(r.state.waiting, ["1", "2"]);
  assert.equal(r.state.rings, 1);
});

test("une commande déjà prête à son arrivée (vue seulement dans l'état « prête ») ne sonne pas", () => {
  const s = run(initialAlert(), [], 0).state;
  const r = run(s, [order("1", "prete")], 1000);
  assert.equal(r.ring, false);
  assert.deepEqual(r.state.waiting, []);
});

test("une commande qui disparaît de la liste (plus de 24 h) ne bloque rien", () => {
  let s = run(initialAlert(), [], 0).state;
  s = run(s, [order("1")], 1000).state;
  const r = run(s, [], 2000);
  assert.deepEqual(r.state.waiting, []);
});

test("alertTitle : singulier, pluriel, rien à signaler", () => {
  assert.equal(alertTitle(0), "Commandes du site");
  assert.equal(alertTitle(1), "(1) Nouvelle commande · Commandes du site");
  assert.equal(alertTitle(3), "(3) Nouvelles commandes · Commandes du site");
});
