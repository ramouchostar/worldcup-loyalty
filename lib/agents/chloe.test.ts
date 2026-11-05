import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSales,
  chloeIdeas,
  MIN_ITEMS_PER_QUIET_OCCURRENCE,
  SPOTLIGHT_DECIDE_DAYS,
  type ChloeInput,
} from "./chloe";
import type { ProductStat } from "../insights";

// Le jeudi 5 novembre 2026 est un jeudi : la prochaine occurrence du jeudi est le 12
// (jamais moins de 2 jours devant), l'annonce part le 11 (la veille, ADR 0023).
const TODAY = "2026-11-05";

const burger: ProductStat = { id: "p-burger", name: "Burger", menuPrice: 9.5, costPrice: 3, qty: 300 };
const tenders: ProductStat = { id: "p-tenders", name: "Tenders 5p", menuPrice: 8, costPrice: 2.4, qty: 250 };
const frites: ProductStat = { id: "p-frites", name: "Frites", menuPrice: 3, costPrice: 0.8, qty: 400 };

// Lundi → dimanche : le jeudi (index 3) est nettement le plus calme.
const THURSDAY_QUIET = [300, 350, 380, 100, 420, 330, 250];

function input(over: Partial<ChloeInput> = {}): ChloeInput {
  return {
    products: [burger, tenders, frites],
    byWeekday: THURSDAY_QUIET,
    totalItems: THURSDAY_QUIET.reduce((s, v) => s + v, 0),
    periodDays: 90,
    todayISO: TODAY,
    ...over,
  };
}

test("jour creux : une promo sûre, datée, annoncée la veille, relayée à Hugo", () => {
  const [idea] = chloeIdeas(input());
  assert.equal(idea.type, "jour_creux_promo");
  assert.equal(idea.assistant, "chloe");
  assert.equal(idea.title, "Le jeudi est ton jour le plus calme");
  assert.equal(idea.question, "Je demande à Hugo une promo ?");
  // Le burger est le plat à plus forte marge ; −30 % laisse la moitié de sa marge (ADR 0022).
  assert.equal(idea.relay.productId, "p-burger");
  assert.equal(idea.relay.discountPct, 30);
  assert.equal(idea.relay.to, "hugo");
  // ADR 0023 : la promo vise la prochaine occurrence, l'annonce part la veille, jamais plus tôt.
  assert.equal(idea.relay.promoOn, "2026-11-12");
  assert.equal(idea.relay.sendOn, "2026-11-11");
  assert.equal(idea.decideBy, "2026-11-11");
  assert.match(idea.lines.what, /−30 %/);
  assert.match(idea.lines.what, /Burger/);
});

test("jour creux : l'estimation déduit la remise faite aux ventes habituelles", () => {
  const [idea] = chloeIdeas(input());
  // 100 articles sur 90/7 jeudis = 7,78 par jeudi ; marge restante 3,65 € ; la remise de 2,85 €
  // s'applique aussi aux 1,10 burgers déjà vendus chaque jeudi (coût 3,12 €).
  assert.deepEqual([idea.estimate?.low, idea.estimate?.high], [-0.28, 3.98]);
  assert.ok(idea.estimate && idea.estimate.low < idea.estimate.high);
  assert.match(idea.estimate!.basis, /Hypothèse de départ/);
  assert.equal(idea.evidence.qty, 100);
  assert.equal(idea.evidence.busiestQty, 420);
});

test("le brouillon d'annonce n'affiche jamais d'euro et part en nature promo (ADR 0007, 0039)", () => {
  for (const idea of chloeIdeas(input())) {
    assert.doesNotMatch(idea.relay.message, /€/);
    assert.equal(idea.relay.nature, "promo");
  }
});

test("pas assez de ventes : aucune idée, jamais une idée de remplissage", () => {
  assert.deepEqual(chloeIdeas(input({ totalItems: 20 })), []);
});

test("aucun jour nettement creux : rien à proposer", () => {
  const flat = [300, 310, 305, 290, 300, 295, 300];
  assert.deepEqual(chloeIdeas(input({ byWeekday: flat, totalItems: flat.reduce((s, v) => s + v, 0) })), []);
});

test("creux trop mince pour payer une remise : rien", () => {
  // 20 articles sur 90 jours = 1,5 par jeudi, sous le seuil.
  const thin = [300, 350, 380, 20, 420, 330, 250];
  assert.ok(20 / (90 / 7) < MIN_ITEMS_PER_QUIET_OCCURRENCE);
  assert.deepEqual(chloeIdeas(input({ byWeekday: thin, totalItems: thin.reduce((s, v) => s + v, 0) })), []);
});

test("aucun plat avec une remise qui garde la marge : rien", () => {
  const stingy: ProductStat = { id: "p-x", name: "Eau", menuPrice: 5, costPrice: 4.8, qty: 400 };
  assert.deepEqual(chloeIdeas(input({ products: [stingy] })), []);
});

test("une promo qui ne peut pas rembourser sa remise n'est pas proposée", () => {
  // Le plat fait la moitié des ventes : la remise coûte plus que la meilleure hausse espérée.
  const staple: ProductStat = { id: "p-staple", name: "Menu midi", menuPrice: 10, costPrice: 5, qty: 1000 };
  assert.deepEqual(chloeIdeas(input({ products: [staple], totalItems: 2000, byWeekday: [300, 350, 380, 150, 420, 330, 250] })), []);
});

test("plat à forte marge qui se vend peu : une mise en avant, sans toucher au prix", () => {
  // Quatre plats : un « puzzle » (Wrap, marge 9 €, 5 ventes) est le seul à mettre en avant.
  const products: ProductStat[] = [
    { id: "a", name: "Classique", menuPrice: 8, costPrice: 6, qty: 100 },
    { id: "b", name: "Burger simple", menuPrice: 7, costPrice: 5, qty: 90 },
    { id: "c", name: "Chicken box", menuPrice: 10, costPrice: 3, qty: 80 },
    { id: "d", name: "Wrap du chef", menuPrice: 12, costPrice: 3, qty: 5 },
  ];
  const flat = [40, 40, 40, 40, 40, 40, 35];
  const ideas = chloeIdeas({ products, byWeekday: flat, totalItems: 275, periodDays: 90, todayISO: TODAY });
  assert.equal(ideas.length, 1);
  const [idea] = ideas;
  assert.equal(idea.type, "plat_a_mettre_en_avant");
  assert.equal(idea.relay.productId, "d");
  assert.equal(idea.relay.discountPct, null);
  assert.equal(idea.relay.sendOn, null);
  assert.match(idea.lines.cost, /0 €/);
  assert.match(idea.lines.cost, /aucun prix ne bouge/);
  assert.equal(idea.estimate, null); // pas de chiffre inventé
  assert.equal(idea.decideBy, "2026-11-08");
  assert.equal(SPOTLIGHT_DECIDE_DAYS, 3);
});

test("agrégation : jour de semaine du ticket (lundi = 0), quantité 1 par défaut, hors période ignoré", () => {
  const orders = [
    { id: "o1", order_date: "2026-11-02" }, // lundi
    { id: "o2", order_date: "2026-11-05" }, // jeudi
  ];
  const items = [
    { order_id: "o1", quantity: 2, menu_item_id: "p1" },
    { order_id: "o1", quantity: 0, menu_item_id: "p2" }, // quantité absente → 1
    { order_id: "o2", quantity: 3, menu_item_id: null }, // hors catalogue : compté, sans plat
    { order_id: "o-hors-periode", quantity: 9, menu_item_id: "p1" },
  ];
  const menu = [
    { id: "p1", name: "Burger", menu_price: 9.5, cost_price: 3 },
    { id: "p2", name: "Frites", menu_price: 3, cost_price: 0.8 },
  ];
  const out = aggregateSales(orders, items, menu);
  assert.equal(out.totalItems, 6);
  assert.equal(out.byWeekday[0], 3);
  assert.equal(out.byWeekday[3], 3);
  assert.deepEqual(out.products.map((p) => [p.id, p.qty]), [["p1", 2], ["p2", 1]]);
});
