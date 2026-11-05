import { test } from "node:test";
import assert from "node:assert/strict";
import {
  giftToAddIdea,
  GIFT_CATALOGUE_TARGET,
  GIFT_MAX_TICKETS,
  ticketsToVerifyIdea,
  type GiftItem,
  type LeaGiftInput,
  type LeaTicketsInput,
  type PendingTicket,
} from "./lea";

const TODAY = "2026-11-05";
const NOW = Date.parse("2026-11-05T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function ticket(id: string, h: number, over: Partial<PendingTicket> = {}): PendingTicket {
  return { id, submittedAt: hoursAgo(h), flagged: false, inDuplicateReview: false, ...over };
}

function tickets(pending: PendingTicket[]): LeaTicketsInput {
  return { restaurantId: "demo-x", todayISO: TODAY, nowMs: NOW, pending };
}

// ─── Les tickets à vérifier ───────────────────────────────────────────────────

test("un ticket attend depuis plus de 2 h : une idée qui ouvre l'onglet Commandes", () => {
  const idea = ticketsToVerifyIdea(tickets([ticket("a", 3)]));
  assert.ok(idea);
  assert.equal(idea.assistant, "lea");
  assert.equal(idea.type, "tickets_a_verifier");
  assert.equal(idea.title, "1 ticket attend depuis plus de 2 h");
  assert.equal(idea.question, "Tu les regardes ?");
  assert.deepEqual(idea.action, { kind: "open", path: "/admin/demo-x/orders", label: "Voir les tickets" });
  assert.match(idea.lines.what, /^1 ticket attend ta validation \(le plus ancien depuis 3 h\)/);
  assert.equal(idea.estimate, null);
  assert.equal(idea.decideBy, TODAY);
});

test("rien n'attend assez longtemps : Léa ne dit rien", () => {
  assert.equal(ticketsToVerifyIdea(tickets([])), null);
  assert.equal(ticketsToVerifyIdea(tickets([ticket("a", 1), ticket("b", 0.5)])), null);
});

test("à 2 h pile l'écran n'alerte pas encore, Léa non plus ; quelques minutes après, oui", () => {
  assert.equal(ticketsToVerifyIdea(tickets([ticket("a", 2)])), null);
  assert.ok(ticketsToVerifyIdea(tickets([ticket("a", 2.05)])));
});

test("plusieurs tickets : le pluriel, le plus ancien, et seuls ceux en retard sont comptés", () => {
  const idea = ticketsToVerifyIdea(tickets([ticket("a", 3), ticket("b", 9.5), ticket("c", 5), ticket("frais", 0.2)]));
  assert.ok(idea);
  assert.equal(idea.title, "3 tickets attendent depuis plus de 2 h");
  assert.match(idea.lines.what, /^3 tickets attendent ta validation \(le plus ancien depuis 9 h\)/);
  assert.equal(idea.evidence.pending, 4); // la file entière, dont le ticket de 12 minutes
  assert.equal(idea.evidence.overSla, 3);
  assert.equal(idea.evidence.oldestHours, 9);
});

test("les tickets signalés sont dits « à regarder de près »", () => {
  const idea = ticketsToVerifyIdea(tickets([ticket("a", 3, { flagged: true }), ticket("b", 4), ticket("c", 5, { flagged: true })]));
  assert.ok(idea);
  assert.match(idea.lines.what, /dont 2 à regarder de près/);
  assert.equal(idea.evidence.flagged, 2);
  // Sans signalement, la précision n'apparaît pas.
  const calm = ticketsToVerifyIdea(tickets([ticket("a", 3)]));
  assert.ok(calm);
  assert.doesNotMatch(calm.lines.what, /de près/);
});

test("un ticket en arbitrage de doublon vit dans l'onglet Doublons : il n'est pas compté", () => {
  assert.equal(ticketsToVerifyIdea(tickets([ticket("a", 8, { inDuplicateReview: true, flagged: true })])), null);
  const idea = ticketsToVerifyIdea(tickets([ticket("a", 8, { inDuplicateReview: true }), ticket("b", 3)]));
  assert.ok(idea);
  assert.equal(idea.evidence.overSla, 1);
  assert.equal(idea.evidence.pending, 1);
});

test("horodatage illisible ou dans le futur : aucune fausse alerte", () => {
  assert.equal(ticketsToVerifyIdea(tickets([ticket("a", 3, { submittedAt: "pas une date" })])), null);
  assert.equal(ticketsToVerifyIdea(tickets([ticket("a", -5)])), null);
});

// ─── Le cadeau à ajouter ──────────────────────────────────────────────────────

// Panier moyen 20 € = 200 points par ticket. À 8 % : un article à 0,80 € de revient vaut 100 points.
function item(id: string, name: string, menuPrice: number, costPrice: number | null, over: Partial<GiftItem> = {}): GiftItem {
  return { id, name, menuPrice, costPrice, isActive: true, rewardEligible: false, ...over };
}

const burger = item("i-burger", "Burger", 9.5, 3); // 375 points, 2 tickets
const tenders = item("i-tenders", "Tenders 5p", 8, 2.4); // 300 points, 2 tickets
const frites = item("i-frites", "Frites", 3, 0.8); // 100 points, 1 ticket, meilleur rapport valeur/coût (3,75)
const bucket = item("i-bucket", "Bucket familial", 45, 20); // 2 500 points, 13 tickets : hors de portée

function gifts(items: GiftItem[], over: Partial<LeaGiftInput> = {}): LeaGiftInput {
  return { restaurantId: "demo-x", todayISO: TODAY, pct: 0.08, avgBasket: 20, items, ...over };
}

test("catalogue vide : l'article au meilleur rapport valeur / coût, avec son prix en points et en tickets", () => {
  const idea = giftToAddIdea(gifts([burger, tenders, frites, bucket]));
  assert.ok(idea);
  assert.equal(idea.assistant, "lea");
  assert.equal(idea.type, "cadeau_a_ajouter");
  assert.equal(idea.title, "« Frites » manque à ton catalogue");
  assert.equal(idea.question, "Je l'ajoute ?");
  assert.match(idea.lines.what, /100 points, soit 1 ticket moyen\./);
  assert.match(idea.lines.cost, /Au plus 0,80 € par cadeau offert, dans ton taux de 8 %\./);
  assert.equal(idea.estimate, null); // aucune promesse d'acquisition (ADR 0068)
  assert.equal(idea.decideBy, "2026-11-12");
});

test("le geste est l'appel existant qui met l'article au catalogue, rien de neuf", () => {
  const idea = giftToAddIdea(gifts([frites]));
  assert.ok(idea);
  assert.deepEqual(idea.action, {
    kind: "call",
    method: "PATCH",
    path: "/api/admin/menu/eligible",
    body: { restaurantId: "demo-x", menuItemId: "i-frites", rewardEligible: true },
    label: "Ajouter",
  });
});

test("catalogue déjà fourni : rien à proposer", () => {
  const fourni = [1, 2, 3].map((n) => item(`e${n}`, `Déjà ${n}`, 5, 1, { rewardEligible: true }));
  assert.equal(fourni.length, GIFT_CATALOGUE_TARGET);
  assert.equal(giftToAddIdea(gifts([...fourni, frites])), null);
  // Deux au catalogue, c'est encore maigre.
  assert.ok(giftToAddIdea(gifts([...fourni.slice(0, 2), frites])));
});

test("un article au catalogue mais sans prix de revient ne compte pas comme fourni", () => {
  const sansCout = [1, 2, 3].map((n) => item(`e${n}`, `Sans coût ${n}`, 5, null, { rewardEligible: true }));
  assert.ok(giftToAddIdea(gifts([...sansCout, frites])));
});

test("jamais un article inactif, sans prix de revient, ou déjà au catalogue", () => {
  assert.equal(giftToAddIdea(gifts([item("a", "Inactif", 3, 0.8, { isActive: false })])), null);
  assert.equal(giftToAddIdea(gifts([item("b", "Sans coût", 3, null)])), null);
  assert.equal(giftToAddIdea(gifts([item("c", "Coût nul", 3, 0)])), null);
  assert.equal(giftToAddIdea(gifts([item("d", "Déjà là", 3, 0.8, { rewardEligible: true })])), null);
});

test("rien ne s'obtient en 8 tickets ou moins : pas de cadeau que personne n'atteindrait", () => {
  assert.equal(giftToAddIdea(gifts([bucket])), null);
});

test("le seuil de tickets est inclusif : 8 passe, 9 non", () => {
  assert.equal(GIFT_MAX_TICKETS, 8);
  // 12,80 € → 1 600 points → 8 tickets de 200 points.
  assert.ok(giftToAddIdea(gifts([item("limite", "Limite", 30, 12.8)])));
  // 12,90 € → 1 615 points → 9 tickets.
  assert.equal(giftToAddIdea(gifts([item("trop", "Trop cher", 30, 12.9)])), null);
});

test("baisser le taux renchérit le cadeau : le même article demande deux fois plus de tickets", () => {
  const a8 = giftToAddIdea(gifts([burger], { pct: 0.08 }));
  const a4 = giftToAddIdea(gifts([burger], { pct: 0.04 }));
  assert.ok(a8 && a4);
  assert.equal(a8.evidence.pricePoints, 375);
  assert.equal(a8.evidence.tickets, 2);
  assert.equal(a4.evidence.pricePoints, 750);
  assert.equal(a4.evidence.tickets, 4);
  assert.match(a4.lines.what, /750 points, soit 4 tickets moyens/);
  assert.match(a4.lines.cost, /dans ton taux de 4 %/);
});

test("à 4 %, un article qui passait à 8 % peut sortir de portée", () => {
  // 7 € → 875 points à 8 % (5 tickets), 1 750 points à 4 % (9 tickets).
  const lourd = item("lourd", "Plat lourd", 18, 7);
  assert.ok(giftToAddIdea(gifts([lourd], { pct: 0.08 })));
  assert.equal(giftToAddIdea(gifts([lourd], { pct: 0.04 })), null);
});

test("panier moyen ou taux inutilisables : Léa ne devine pas", () => {
  assert.equal(giftToAddIdea(gifts([frites], { avgBasket: 0 })), null);
  assert.equal(giftToAddIdea(gifts([frites], { pct: 0 })), null);
});

test("la trace garde de quoi réviser le seuil : points, tickets, taux, catalogue, candidats", () => {
  const idea = giftToAddIdea(gifts([burger, tenders, frites, bucket]));
  assert.ok(idea);
  assert.deepEqual(idea.evidence, {
    item: "Frites",
    pricePoints: 100,
    tickets: 1,
    pct: 0.08,
    inCatalogue: 0,
    candidates: 3, // le bucket est hors de portée
    maxTickets: 8,
  });
});
