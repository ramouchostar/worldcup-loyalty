import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProgramValue, countJetonsGifts, SALES_MIN_SPAN_DAYS } from "./program-value";

// Chaque scénario est recalculable à la main — même exigence que le forecast
// (ADR 0027) : le moteur doit être explicable chiffre par chiffre.

const base = {
  today: "2026-09-02",
  orders: [] as { user_id: string; order_date: string; amount: number }[],
  memberships: [] as { joined_at: string }[],
  referrals: [] as { referrer_id: string; referee_id: string; referred_at: string }[],
  rewards: [] as {
    created_at: string;
    status: string;
    solo_cost: number | null;
    community_cost: number | null;
    advancement_cost: number | null;
  }[],
  marginRows: [] as { order_date: string; margin: number | null }[],
  sales: [] as { sold_on: string; amount: number }[],
};

test("fenêtre de mois : de la première activité au mois courant, plafonnée", () => {
  const v = computeProgramValue({
    ...base,
    memberships: [{ joined_at: "2026-07-01T12:00:00Z" }],
  });
  assert.deepEqual(v.months.map((m) => m.month), ["2026-07", "2026-08", "2026-09"]);

  const long = computeProgramValue({
    ...base,
    memberships: [{ joined_at: "2025-01-15T00:00:00Z" }],
  });
  assert.equal(long.months.length, 6); // plafond par défaut
  assert.equal(long.months[long.months.length - 1].month, "2026-09");
});

test("agrégats mensuels : CA, commandes, clients actifs, nouveaux, parrainés", () => {
  const v = computeProgramValue({
    ...base,
    orders: [
      { user_id: "a", order_date: "2026-08-05", amount: 20 },
      { user_id: "b", order_date: "2026-08-10", amount: 15.5 },
      { user_id: "a", order_date: "2026-09-01", amount: 12 },
    ],
    memberships: [
      { joined_at: "2026-08-01T10:00:00Z" },
      { joined_at: "2026-08-20T10:00:00Z" },
      { joined_at: "2026-09-01T10:00:00Z" },
    ],
    referrals: [{ referrer_id: "p", referee_id: "b", referred_at: "2026-08-20T10:00:00Z" }],
  });
  const aout = v.months.find((m) => m.month === "2026-08")!;
  assert.equal(aout.orders, 2);
  assert.equal(aout.revenue, 35.5);
  assert.equal(aout.activeMembers, 2);
  assert.equal(aout.newMembers, 2);
  assert.equal(aout.referredSignups, 1);
  assert.equal(v.totals.revenue, 47.5);
  assert.equal(v.totals.orders, 3);
});

test("client revenu = actif sur une autre journée que sa toute première", () => {
  const v = computeProgramValue({
    ...base,
    orders: [
      { user_id: "a", order_date: "2026-08-05", amount: 10 },
      { user_id: "a", order_date: "2026-08-05", amount: 8 }, // même jour : pas « revenu »
      { user_id: "a", order_date: "2026-09-01", amount: 12 }, // revenu en septembre
      { user_id: "b", order_date: "2026-09-01", amount: 9 }, // premier jour : pas revenu
    ],
  });
  assert.equal(v.months.find((m) => m.month === "2026-08")!.returningMembers, 0);
  assert.equal(v.months.find((m) => m.month === "2026-09")!.returningMembers, 1);
  assert.equal(v.totals.returningMembers, 1);
  assert.equal(v.totals.membersWithOrder, 2);
});

test("cadeaux : coût engagé au mois de création, retiré compté à part", () => {
  const v = computeProgramValue({
    ...base,
    memberships: [{ joined_at: "2026-08-01T00:00:00Z" }],
    rewards: [
      { created_at: "2026-08-03T10:00:00Z", status: "redeemed", solo_cost: 1.2, community_cost: null, advancement_cost: null },
      { created_at: "2026-08-15T10:00:00Z", status: "expired", solo_cost: 0.8, community_cost: 0.5, advancement_cost: null },
      { created_at: "2026-09-01T10:00:00Z", status: "available", solo_cost: 2, community_cost: null, advancement_cost: null },
    ],
  });
  assert.equal(v.months.find((m) => m.month === "2026-08")!.rewardsCost, 2.5);
  assert.equal(v.months.find((m) => m.month === "2026-09")!.rewardsCost, 2);
  // L'expiré RESTE engagé (prudence ADR 0012) mais n'est pas « retiré ».
  assert.equal(v.rewards.costEngaged, 4.5);
  assert.equal(v.rewards.costRedeemed, 1.2);
  assert.equal(v.rewards.countDistributed, 3);
  assert.equal(v.rewards.countRedeemed, 1);
});

test("marge : un coût inconnu est exclu, jamais compté comme marge pleine", () => {
  const v = computeProgramValue({
    ...base,
    orders: [{ user_id: "a", order_date: "2026-08-05", amount: 20 }],
    marginRows: [
      { order_date: "2026-08-05", margin: 6.5 },
      { order_date: "2026-08-05", margin: null }, // cost_price NULL (ADR 0046)
    ],
  });
  assert.equal(v.months.find((m) => m.month === "2026-08")!.margin, 6.5);
  assert.equal(v.totals.margin, 6.5);
});

test("impact parrainage : seuls les filleuls ayant commandé comptent du CA", () => {
  const v = computeProgramValue({
    ...base,
    orders: [
      { user_id: "filleul1", order_date: "2026-08-05", amount: 18 },
      { user_id: "filleul1", order_date: "2026-08-20", amount: 22 },
      { user_id: "autre", order_date: "2026-08-06", amount: 50 },
    ],
    referrals: [
      { referrer_id: "p", referee_id: "filleul1", referred_at: "2026-08-01T00:00:00Z" },
      { referrer_id: "p", referee_id: "filleul2", referred_at: "2026-08-02T00:00:00Z" },
    ],
  });
  assert.equal(v.referral.signups, 2);
  assert.equal(v.referral.withOrder, 1);
  assert.equal(v.referral.revenue, 40); // jamais le CA du non-filleul
});

test("part du CA total : none / insufficient / ok avec part bornée à 100", () => {
  assert.equal(computeProgramValue(base).sales.status, "none");

  const short = computeProgramValue({
    ...base,
    sales: [
      { sold_on: "2026-08-01", amount: 1000 },
      { sold_on: "2026-08-10", amount: 900 },
    ],
  });
  assert.equal(short.sales.status, "insufficient");

  const days: { sold_on: string; amount: number }[] = [];
  for (let i = 0; i < SALES_MIN_SPAN_DAYS + 3; i++) {
    const d = new Date(Date.UTC(2026, 7, 1 + i)); // à partir du 1er août
    days.push({ sold_on: d.toISOString().slice(0, 10), amount: 100 });
  }
  const ok = computeProgramValue({
    ...base,
    orders: [{ user_id: "a", order_date: "2026-08-05", amount: 310 }],
    sales: days,
  });
  assert.equal(ok.sales.status, "ok");
  if (ok.sales.status === "ok") {
    const aout = ok.sales.months.find((m) => m.month === "2026-08")!;
    assert.equal(aout.totalSales, 3100); // 31 jours × 100
    assert.equal(aout.programSharePct, 10); // 310 / 3100
  }

  // Caisse partiellement importée : la part ne dépasse jamais 100 %.
  const overflow = computeProgramValue({
    ...base,
    orders: [{ user_id: "a", order_date: "2026-08-05", amount: 5000 }],
    sales: days,
  });
  if (overflow.sales.status === "ok") {
    assert.equal(overflow.sales.months.find((m) => m.month === "2026-08")!.programSharePct, 100);
  }
});

test("cadeaux jetons : 1 jeton/action + 1 jeton/5 filleuls, 1 cadeau/4 jetons", () => {
  // 3 actions + 5 filleuls = 4 jetons = 1 cadeau ; 7 actions seules = 1 cadeau.
  const gifts = countJetonsGifts(
    new Map([
      ["u1", 3],
      ["u2", 7],
    ]),
    new Map([["u1", 5]])
  );
  assert.equal(gifts, 2);
  assert.equal(countJetonsGifts(new Map([["u", 3]]), new Map()), 0);
});

test("aucune commande : la structure reste saine (état vide explicite)", () => {
  const v = computeProgramValue({ ...base, memberships: [{ joined_at: "2026-09-01T00:00:00Z" }] });
  assert.equal(v.totals.orders, 0);
  assert.equal(v.months.length, 1);
  assert.equal(v.referral.signups, 0);
});
