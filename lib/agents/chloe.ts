import { createAdminClient } from "../supabase";
import { fetchAllRows } from "../paged-select";
import {
  WEEKDAY_LABELS,
  addDaysISO,
  findQuietDay,
  menuEngineering,
  nextPromoDates,
  pickPromoProduct,
  type ProductStat,
} from "../insights";

// Chloé — l'assistante des chiffres (Brigade 07, chantier « La brigade »).
//
// Elle lit les ventes déjà là (tickets validés, lignes d'articles, catalogue) et
// prépare des IDÉES que le gérant décide : elle ne dépense rien et n'envoie rien.
// Deux types pour commencer, tous deux tirés de lib/insights.ts (ADR 0022) :
//   - jour_creux_promo         « Le jeudi est ton jour le plus calme : je demande à
//                               Hugo une promo ? » — la promo garde la marge ;
//   - plat_a_mettre_en_avant   un plat à forte marge qui se vend peu (menu
//                               engineering) : une annonce, aucun prix ne bouge.
// Sur « Oui », l'idée passe le relais à Hugo (`relay`) : le brouillon de l'annonce,
// la date d'envoi (ADR 0023 : la veille de la promo, jamais plus tôt) et sa nature
// « promo » (consentement exigé, ADR 0039). Cette couche ne fait que PRÉPARER.
//
// Règle de la brigade : un jour sans bonne idée vaut mieux qu'une idée de
// remplissage. Chaque garde-fou ci-dessous renvoie « rien » plutôt qu'une idée
// creuse : pas assez de données, creux trop mince pour payer la remise, promo qui
// ne peut pas se rembourser.

// ─── Types provisoires ────────────────────────────────────────────────────────
// Le contrat commun des idées (lib/agents/types.ts) est écrit par Mehdi
// (Brigade 01). Tant qu'il n'est pas là, Chloé produit ce BROUILLON : sans
// identifiant ni statut, que la persistance (Brigade 02) ajoutera. À l'arrivée de
// types.ts, on remplace ces types, pas la logique.

export type IdeaLines = { what: string; who: string; cost: string };
export type IdeaEstimate = { low: number; high: number; unit: string; basis: string };

export type HugoRelay = {
  to: "hugo";
  nature: "promo";
  message: string; // brouillon de l'annonce aux membres — jamais d'euro (ADR 0007)
  productId: string;
  discountPct: number | null; // null : on met en avant, aucun prix ne bouge
  sendOn: string | null;
  promoOn: string | null;
};

export type ChloeIdea = {
  assistant: "chloe";
  type: "jour_creux_promo" | "plat_a_mettre_en_avant";
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: IdeaEstimate | null; // null : pas assez de recul pour chiffrer, et on le dit
  decideBy: string; // au-delà, l'idée n'a plus de sens : elle expire (ISO, Europe/Brussels)
  action: { kind: "relay"; to: "hugo"; label: string }; // le geste du contrat (ADR 0089) ; le détail est dans `relay`
  relay: HugoRelay;
  evidence: Record<string, number | string>; // les chiffres qui ont produit l'idée (trace)
};

export type ChloeInput = {
  products: ProductStat[];
  byWeekday: number[]; // articles vendus par jour de semaine, 0 = lundi
  totalItems: number;
  periodDays: number;
  todayISO: string;
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

export const PERIOD_DAYS = 90;
// Un jour creux qui vend moins de 5 articles par occurrence ne paiera jamais une remise.
export const MIN_ITEMS_PER_QUIET_OCCURRENCE = 5;
// HYPOTHÈSE DE DÉPART : une promo ciblée ramène de 10 à 25 % d'articles en plus ce
// jour-là. À recalibrer sur le résultat mesuré (Brigade 06), pas à croire.
export const UPLIFT_LOW = 0.1;
export const UPLIFT_HIGH = 0.25;
// Une idée « mettre en avant » n'a pas de date ; elle expire vite pour ne pas s'empiler.
export const SPOTLIGHT_DECIDE_DAYS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;
const euro = (n: number) => Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// ─── Les idées (pur, déterministe) ────────────────────────────────────────────

function quietDayIdea(input: ChloeInput): ChloeIdea | null {
  const quiet = findQuietDay(input.byWeekday, input.totalItems);
  const promo = pickPromoProduct(input.products);
  if (!quiet || !promo || input.totalItems <= 0) return null;

  const occurrences = input.periodDays / 7;
  const perDay = quiet.qty / occurrences;
  if (perDay < MIN_ITEMS_PER_QUIET_OCCURRENCE) return null;

  const p = promo.product;
  const day = WEEKDAY_LABELS[quiet.day];
  const { promoOn, sendOn } = nextPromoDates(input.todayISO, quiet.day);
  const discount = round2((p.menuPrice * promo.discountPct) / 100);
  const keptMargin = round2(p.menuPrice - p.costPrice - discount);

  // Ce que la promo coûte vraiment : la remise s'applique AUSSI aux ventes que le
  // plat aurait faites sans elle. On l'estime avec la part du plat dans les ventes.
  const baselineUnits = perDay * (p.qty / input.totalItems);
  const cannibalCost = round2(baselineUnits * discount);
  const low = round2(perDay * UPLIFT_LOW * keptMargin - cannibalCost);
  const high = round2(perDay * UPLIFT_HIGH * keptMargin - cannibalCost);
  if (high <= 0) return null; // même le bon scénario ne rembourse pas la remise : pas d'idée

  return {
    assistant: "chloe",
    type: "jour_creux_promo",
    title: `Le ${day} est ton jour le plus calme`,
    question: "Je demande à Hugo une promo ?",
    lines: {
      what: `Promo −${promo.discountPct} % sur « ${p.name} » le ${fmtDate(promoOn)}, annoncée la veille à tes membres.`,
      who: "Les membres qui ont accepté les offres, jamais les autres.",
      cost: `Remise de ${euro(discount)} par article, il te reste ${euro(keptMargin)} de marge. Coût estimé sur les ventes que tu ferais déjà : ${euro(cannibalCost)}.`,
    },
    estimate: {
      low,
      high,
      unit: `€ de marge par ${day}`,
      basis: `+${Math.round(UPLIFT_LOW * 100)} à ${Math.round(UPLIFT_HIGH * 100)} % sur ${round2(perDay)} articles un ${day}, remise déduite. Hypothèse de départ, mesurée ensuite.`,
    },
    decideBy: sendOn,
    action: { kind: "relay", to: "hugo", label: "Demander à Hugo" },
    relay: {
      to: "hugo",
      nature: "promo",
      message: `😍 Spécial ${day} : −${promo.discountPct}% sur ${p.name} pour les membres ! Montre ton app en caisse 🎉`,
      productId: p.id,
      discountPct: promo.discountPct,
      sendOn,
      promoOn,
    },
    evidence: {
      weekday: quiet.day,
      qty: quiet.qty,
      busiestWeekday: quiet.busiestDay,
      busiestQty: quiet.busiestQty,
      perOccurrence: round2(perDay),
      productId: p.id,
      discountPct: promo.discountPct,
    },
  };
}

function spotlightIdea(input: ChloeInput): ChloeIdea | null {
  const audit = menuEngineering(input.products, input.totalItems);
  if (!audit || audit.puzzles.length === 0) return null;
  const p = [...audit.puzzles].sort((a, b) => b.menuPrice - b.costPrice - (a.menuPrice - a.costPrice))[0];
  const margin = round2(p.menuPrice - p.costPrice);
  if (margin <= 0) return null;

  return {
    assistant: "chloe",
    type: "plat_a_mettre_en_avant",
    title: `« ${p.name} » rapporte ${euro(margin)} par vente et se vend peu`,
    question: "Je demande à Hugo de le mettre en avant ?",
    lines: {
      what: `Une annonce aux membres qui met « ${p.name} » en avant cette semaine, sans toucher au prix.`,
      who: "Les membres qui ont accepté les offres, jamais les autres.",
      cost: "0 € : aucun prix ne bouge.",
    },
    estimate: null, // aucune donnée pour chiffrer honnêtement un plat qu'on ne met jamais en avant
    decideBy: addDaysISO(input.todayISO, SPOTLIGHT_DECIDE_DAYS),
    action: { kind: "relay", to: "hugo", label: "Demander à Hugo" },
    relay: {
      to: "hugo",
      nature: "promo",
      message: `😋 À essayer cette semaine : ${p.name} ! Montre ton app en caisse 🎉`,
      productId: p.id,
      discountPct: null,
      sendOn: null,
      promoOn: null,
    },
    evidence: { productId: p.id, qty: p.qty, margin, popularityThreshold: round2(audit.popThreshold), marginThreshold: round2(audit.marginThreshold) },
  };
}

/** Les idées de Chloé pour un établissement, la plus forte d'abord. Vide = rien de solide aujourd'hui. */
export function chloeIdeas(input: ChloeInput): ChloeIdea[] {
  return [quietDayIdea(input), spotlightIdea(input)].filter((i): i is ChloeIdea => i !== null);
}

// ─── Agrégation des ventes (pur) ──────────────────────────────────────────────
// Même lecture que la page Opportunités (articles par jour de semaine, ventes par
// plat) : le jour de la semaine suit la date du ticket, lundi = 0.

export type OrderRow = { id: string; order_date: string };
export type ItemRow = { order_id: string; quantity: number | null; menu_item_id: string | null };
export type MenuRow = { id: string; name: string; menu_price: number; cost_price: number };

export function aggregateSales(
  orders: OrderRow[],
  items: ItemRow[],
  menu: MenuRow[]
): { products: ProductStat[]; byWeekday: number[]; totalItems: number } {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const qtyByProduct = new Map<string, number>();
  const byWeekday = new Array<number>(7).fill(0);
  let totalItems = 0;

  for (const it of items) {
    const order = orderById.get(it.order_id);
    if (!order) continue; // ligne d'un ticket hors période
    const qty = Number(it.quantity) || 1;
    totalItems += qty;
    byWeekday[(new Date(`${order.order_date}T00:00:00Z`).getUTCDay() + 6) % 7] += qty;
    if (it.menu_item_id) qtyByProduct.set(it.menu_item_id, (qtyByProduct.get(it.menu_item_id) ?? 0) + qty);
  }

  const products: ProductStat[] = menu.map((m) => ({
    id: m.id,
    name: m.name,
    menuPrice: Number(m.menu_price),
    costPrice: Number(m.cost_price),
    qty: qtyByProduct.get(m.id) ?? 0,
  }));
  return { products, byWeekday, totalItems };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

/**
 * Charge les 90 derniers jours d'un établissement. Lecture paginée (lib/paged-select) :
 * PostgREST tronque en silence à 1 000 lignes, et un agrégat partiel présenté comme
 * complet donnerait un faux « jour creux ». Si le plafond de sécurité est atteint, on
 * échoue franchement au lieu de proposer une idée sur des chiffres tronqués.
 */
export async function loadChloeInput(restaurantId: string, todayISO: string): Promise<ChloeInput> {
  const admin = createAdminClient();
  const since = addDaysISO(todayISO, -PERIOD_DAYS);

  const orders = await fetchAllRows<OrderRow>((from, to) =>
    admin
      .from("orders")
      .select("id, order_date")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .gte("order_date", since)
      .order("id")
      .range(from, to)
  );
  if (orders.truncated) throw new Error("orders : plafond de lecture atteint, agrégat refusé");

  const items: ItemRow[] = [];
  const ids = orders.rows.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin
      .from("order_items")
      .select("order_id, quantity, menu_item_id")
      .in("order_id", ids.slice(i, i + 150));
    if (error) throw new Error(`order_items : ${error.message}`);
    items.push(...((data ?? []) as ItemRow[]));
  }

  const { data: menu, error: menuError } = await admin
    .from("menu_items")
    .select("id, name, menu_price, cost_price")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (menuError) throw new Error(`menu_items : ${menuError.message}`);

  return { ...aggregateSales(orders.rows, items, (menu ?? []) as MenuRow[]), periodDays: PERIOD_DAYS, todayISO };
}
