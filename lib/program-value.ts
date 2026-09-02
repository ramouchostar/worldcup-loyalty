// ============================================================
// Valeur générée par le programme — DÉTERMINISTE (issue #22).
//
// Même contrat que le forecast (ADR 0027) : la date « aujourd'hui » est
// INJECTÉE, chaque chiffre est recalculable à la main depuis les lignes
// sources. Aucune estimation inventée : on affiche ce que les données
// PROUVENT, avec le vocabulaire exact de ce qu'elles prouvent.
//
// Cadrage produit (2026-09-02, validé par le porteur) :
//   - le CA des tickets scannés n'est pas vendu comme « additionnel » —
//     c'est « le CA des clients qui participent au programme » : la preuve
//     d'une base de clients fidèles, pas une promesse de causalité ;
//   - la part du programme dans le CA TOTAL n'apparaît que si le resto a
//     importé ses ventes de caisse (restaurant_sales, ADR 0027) sur au
//     moins 4 semaines — le « hook data-ready » de l'ADR 0029 ;
//   - le coût des cadeaux reste compté à la création (prudent) mais
//     l'affichage distingue engagé / réellement retiré.
//
// Rien ici n'atteint jamais un membre — surface admin only (ADR 0007).
// ============================================================

export type ValueOrderRow = { user_id: string; order_date: string; amount: number };
export type ValueMembershipRow = { joined_at: string };
export type ValueReferralRow = { referrer_id: string; referee_id: string; referred_at: string };
export type ValueRewardRow = {
  created_at: string;
  status: string; // pending | available | redeemed | expired | banked
  solo_cost: number | null;
  community_cost: number | null;
  advancement_cost: number | null;
};
// Marge d'une ligne de ticket déjà résolue par l'appelant : quantité ×
// (prix carte − coût matière), ou NULL si le coût est inconnu (ADR 0046 —
// un coût absent n'est JAMAIS une marge pleine, Number(null)=0 mentirait).
export type ValueMarginRow = { order_date: string; margin: number | null };
export type ValueSalesRow = { sold_on: string; amount: number };

export type ValueMonth = {
  month: string; // "2026-08" (UTC)
  orders: number;
  revenue: number; // CA des clients du programme (tickets validés)
  margin: number; // marge sur les articles reconnus à coût connu
  activeMembers: number; // membres distincts ayant commandé ce mois
  returningMembers: number; // dont clients revenus (déjà commandé un autre jour avant)
  newMembers: number; // adhésions du mois
  referredSignups: number; // dont venues par parrainage
  rewardsCost: number; // coût engagé des cadeaux créés ce mois
};

export type ReferralImpact = {
  signups: number; // filleuls inscrits (depuis le début)
  withOrder: number; // filleuls ayant déjà commandé au moins une fois
  revenue: number; // CA cumulé de ces filleuls — prouvé à 100 %
};

export type RewardTotals = {
  costEngaged: number; // coût figé à la création, jamais décrémenté (choix prudent ADR 0012)
  costRedeemed: number; // coût des cadeaux réellement retirés au comptoir
  countDistributed: number;
  countRedeemed: number;
};

// Part du programme dans le CA total : ne se calcule que sur des ventes de
// caisse importées. Mêmes planchers d'honnêteté que le forecast.
export const SALES_MIN_SPAN_DAYS = 28; // ≈ MIN_WEEKS × 7 (ADR 0027 §7)

export type SalesMonth = { month: string; totalSales: number; programSharePct: number | null };
export type SalesCoverage =
  | { status: "none" } // rien d'importé → inviter à importer (hook ADR 0029)
  | { status: "insufficient"; spanDays: number }
  | { status: "ok"; months: SalesMonth[] };

export type ProgramValue = {
  months: ValueMonth[]; // du plus ancien au plus récent, mois courant inclus
  totals: {
    revenue: number;
    orders: number;
    margin: number;
    members: number; // membres inscrits (adhésions)
    membersWithOrder: number;
    returningMembers: number; // clients revenus au moins une deuxième journée
  };
  rewards: RewardTotals;
  // Cadeaux 4 jetons gagnés (ADR 0017 §2) — coût pur, aucune commande en face.
  jetons: { gifts: number; cost: number };
  referral: ReferralImpact;
  sales: SalesCoverage;
};

// ── Dates (UTC, comparaisons lexicographiques sur ISO — patron forecast) ────

const monthOf = (isoDateOrTs: string): string => isoDateOrTs.slice(0, 7);

function monthsBetween(firstMonth: string, lastMonth: string, cap: number): string[] {
  const out: string[] = [];
  let [y, m] = firstMonth.split("-").map(Number);
  const [ly, lm] = lastMonth.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out.slice(-cap); // les `cap` mois les plus récents
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Cadeau 4 jetons (ADR 0017 §2) ───────────────────────────────────────────

// Nombre de cadeaux jetons GAGNÉS, membre par membre : mêmes formules que les
// surfaces membres (1 jeton par action sociale validée, 1 jeton par tranche
// de 5 filleuls, 1 cadeau par tranche de 4 jetons). Sert l'affichage admin ;
// le compteur budget (ADR 0012) est incrémenté au fil de l'eau par
// recordJetonsGiftCostIfEarned (lib/jetons-gift.ts).
export function countJetonsGifts(
  socialTokensByUser: Map<string, number>,
  referralsByReferrer: Map<string, number>
): number {
  const users = new Set([...socialTokensByUser.keys(), ...referralsByReferrer.keys()]);
  let gifts = 0;
  users.forEach((u) => {
    const tokens = (socialTokensByUser.get(u) ?? 0) + Math.floor((referralsByReferrer.get(u) ?? 0) / 5);
    gifts += Math.floor(tokens / 4);
  });
  return gifts;
}

// ── Moteur ──────────────────────────────────────────────────────────────────

export function computeProgramValue(input: {
  today: string; // AAAA-MM-JJ (injecté)
  orders: ValueOrderRow[]; // commandes VALIDÉES uniquement
  memberships: ValueMembershipRow[];
  referrals: ValueReferralRow[];
  rewards: ValueRewardRow[];
  marginRows: ValueMarginRow[];
  sales: ValueSalesRow[];
  // Jetons par membre (actions sociales validées) + coût unitaire du cadeau
  // 4 jetons — optionnels : sans eux, la ligne jetons affiche simplement zéro.
  socialTokensByUser?: Map<string, number>;
  jetonsGiftCost?: number;
  monthsBack?: number; // fenêtre d'historique affichée (défaut 6)
}): ProgramValue {
  const { today, orders, memberships, referrals, rewards, marginRows, sales } = input;
  const cap = input.monthsBack ?? 6;

  // Fenêtre de mois : de la première trace d'activité au mois courant.
  const currentMonth = monthOf(today);
  const firstDates = [
    ...orders.map((o) => o.order_date),
    ...memberships.map((m) => m.joined_at),
  ].map(monthOf);
  const firstMonth = firstDates.length ? firstDates.reduce((a, b) => (a < b ? a : b)) : currentMonth;
  const monthKeys = monthsBetween(firstMonth, currentMonth, cap);

  // Premier jour de commande par membre → distingue « nouveau » de « revenu ».
  const daysByUser = new Map<string, Set<string>>();
  for (const o of orders) {
    if (!daysByUser.has(o.user_id)) daysByUser.set(o.user_id, new Set());
    daysByUser.get(o.user_id)!.add(o.order_date);
  }
  const firstDayByUser = new Map<string, string>();
  daysByUser.forEach((days, u) => firstDayByUser.set(u, [...days].reduce((a, b) => (a < b ? a : b))));

  const months: ValueMonth[] = monthKeys.map((mk) => {
    const mOrders = orders.filter((o) => monthOf(o.order_date) === mk);
    const active = new Set(mOrders.map((o) => o.user_id));
    // « Client revenu » : actif ce mois-ci sur une AUTRE journée que sa toute
    // première commande — la définition la plus simple à expliquer au comptoir.
    let returning = 0;
    active.forEach((u) => {
      const first = firstDayByUser.get(u)!;
      if (mOrders.some((o) => o.user_id === u && o.order_date > first)) returning++;
    });
    const mRewards = rewards.filter((rw) => monthOf(rw.created_at) === mk);
    return {
      month: mk,
      orders: mOrders.length,
      revenue: round2(sum(mOrders.map((o) => Number(o.amount)))),
      margin: round2(
        sum(marginRows.filter((r) => monthOf(r.order_date) === mk).map((r) => Number(r.margin ?? 0)))
      ),
      activeMembers: active.size,
      returningMembers: returning,
      newMembers: memberships.filter((m) => monthOf(m.joined_at) === mk).length,
      referredSignups: referrals.filter((r) => monthOf(r.referred_at) === mk).length,
      rewardsCost: round2(sum(mRewards.map(rewardCost))),
    };
  });

  // Totaux depuis le début (pas seulement la fenêtre affichée).
  const membersWithOrder = daysByUser.size;
  let returningTotal = 0;
  daysByUser.forEach((days) => {
    if (days.size >= 2) returningTotal++;
  });

  const redeemed = rewards.filter((r) => r.status === "redeemed");
  const rewardTotals: RewardTotals = {
    costEngaged: round2(sum(rewards.map(rewardCost))),
    costRedeemed: round2(sum(redeemed.map(rewardCost))),
    countDistributed: rewards.length,
    countRedeemed: redeemed.length,
  };

  // Impact parrainage — la jointure filleuls × commandes : du CA prouvé à
  // 100 % (le client n'existait pas dans la base avant son lien de parrainage).
  const refereeIds = new Set(referrals.map((r) => r.referee_id));
  const refereeOrders = orders.filter((o) => refereeIds.has(o.user_id));
  const referral: ReferralImpact = {
    signups: referrals.length,
    withOrder: new Set(refereeOrders.map((o) => o.user_id)).size,
    revenue: round2(sum(refereeOrders.map((o) => Number(o.amount)))),
  };

  // Part du programme dans le CA total — uniquement sur des ventes importées.
  let salesCoverage: SalesCoverage;
  if (sales.length === 0) {
    salesCoverage = { status: "none" };
  } else {
    const soldDates = sales.map((s) => s.sold_on).sort();
    const spanDays = daysBetween(soldDates[0], soldDates[soldDates.length - 1]) + 1;
    if (spanDays < SALES_MIN_SPAN_DAYS) {
      salesCoverage = { status: "insufficient", spanDays };
    } else {
      const byMonth = new Map<string, number>();
      for (const s of sales) {
        const mk = monthOf(s.sold_on);
        byMonth.set(mk, (byMonth.get(mk) ?? 0) + Number(s.amount));
      }
      const salesMonths: SalesMonth[] = monthKeys
        .filter((mk) => byMonth.has(mk))
        .map((mk) => {
          const total = byMonth.get(mk)!;
          const program = months.find((m) => m.month === mk)?.revenue ?? 0;
          return {
            month: mk,
            totalSales: round2(total),
            // Part bornée à 100 : un mois de caisse partiellement importé ne
            // doit jamais afficher « 130 % de ton CA vient du programme ».
            programSharePct: total > 0 ? Math.min(100, Math.round((program / total) * 100)) : null,
          };
        });
      salesCoverage = { status: "ok", months: salesMonths };
    }
  }

  const referralsByReferrer = new Map<string, number>();
  for (const r of referrals) {
    referralsByReferrer.set(r.referrer_id, (referralsByReferrer.get(r.referrer_id) ?? 0) + 1);
  }
  const jetonsGifts = countJetonsGifts(input.socialTokensByUser ?? new Map(), referralsByReferrer);

  return {
    months,
    jetons: { gifts: jetonsGifts, cost: round2(jetonsGifts * (input.jetonsGiftCost ?? 0)) },
    totals: {
      revenue: round2(sum(orders.map((o) => Number(o.amount)))),
      orders: orders.length,
      margin: round2(sum(marginRows.map((r) => Number(r.margin ?? 0)))),
      members: memberships.length,
      membersWithOrder,
      returningMembers: returningTotal,
    },
    rewards: rewardTotals,
    referral,
    sales: salesCoverage,
  };
}

function rewardCost(r: ValueRewardRow): number {
  return Number(r.solo_cost ?? 0) + Number(r.community_cost ?? 0) + Number(r.advancement_cost ?? 0);
}

// ── Chargement (service role — surface admin uniquement, ADR 0007) ──────────

import { createAdminClient } from "./supabase";
import { getJetonsGift } from "./jetons-gift";

// Mêmes plafonds de volume que le dashboard actuel : au-delà de 10 000
// commandes on assumera une agrégation SQL, pas avant (YAGNI documenté).
const MAX_ROWS = 10000;

export async function getProgramValue(
  restaurantId: string,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<ProgramValue> {
  const admin = createAdminClient();

  const [ordersQ, membershipsQ, referralsQ, rewardsQ, marginQ, salesQ, claimsQ, jetonsGift] = await Promise.all([
    admin
      .from("orders")
      .select("user_id, order_date, amount")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .limit(MAX_ROWS),
    admin.from("memberships").select("joined_at").eq("restaurant_id", restaurantId).limit(MAX_ROWS),
    admin
      .from("referrals")
      .select("referrer_id, referee_id, referred_at")
      .eq("restaurant_id", restaurantId)
      .limit(MAX_ROWS),
    admin
      .from("pending_rewards")
      .select("created_at, status, solo_cost, community_cost, advancement_cost")
      .eq("restaurant_id", restaurantId)
      .limit(MAX_ROWS),
    admin
      .from("order_items")
      .select("quantity, is_ignored, menu_items!inner(menu_price, cost_price), orders!inner(restaurant_id, status, order_date)")
      .eq("orders.restaurant_id", restaurantId)
      .eq("orders.status", "validated")
      .limit(MAX_ROWS),
    admin
      .from("restaurant_sales")
      .select("sold_on, amount")
      .eq("restaurant_id", restaurantId)
      .order("sold_on", { ascending: true })
      .limit(MAX_ROWS),
    admin
      .from("micro_reward_claims")
      .select("user_id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .limit(MAX_ROWS),
    getJetonsGift(restaurantId),
  ]);

  const socialTokensByUser = new Map<string, number>();
  for (const c of (claimsQ.data ?? []) as { user_id: string }[]) {
    socialTokensByUser.set(c.user_id, (socialTokensByUser.get(c.user_id) ?? 0) + 1);
  }

  type MarginJoinRow = {
    quantity: number;
    is_ignored: boolean | null;
    menu_items: { menu_price: number; cost_price: number | null } | { menu_price: number; cost_price: number | null }[];
    orders: { order_date: string } | { order_date: string }[];
  };
  const marginRows: ValueMarginRow[] = (((marginQ.data ?? []) as unknown) as MarginJoinRow[]).flatMap((row) => {
    if (row.is_ignored) return []; // ligne technique de caisse (ADR 0046)
    const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
    const ord = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!mi || !ord) return [];
    // Coût inconnu → marge inconnue, EXCLUE (Number(null)=0 afficherait une
    // marge de 100 %, le piège ADR 0046 — corrige aussi l'ancienne tuile).
    if (mi.cost_price == null) return [];
    return [{
      order_date: ord.order_date,
      margin: (Number(mi.menu_price) - Number(mi.cost_price)) * (Number(row.quantity) || 1),
    }];
  });

  return computeProgramValue({
    today,
    orders: ((ordersQ.data ?? []) as ValueOrderRow[]),
    memberships: ((membershipsQ.data ?? []) as ValueMembershipRow[]),
    referrals: ((referralsQ.data ?? []) as ValueReferralRow[]),
    rewards: ((rewardsQ.data ?? []) as ValueRewardRow[]),
    marginRows,
    sales: ((salesQ.data ?? []) as ValueSalesRow[]),
    socialTokensByUser,
    jetonsGiftCost: jetonsGift.cost,
  });
}
