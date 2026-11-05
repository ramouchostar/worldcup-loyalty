import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { getMenuItems } from "../menu";
import { getAverageBasket } from "../avg-basket";
import { getRestaurantBudgetPct } from "../budget";
import { catalogPricePoints, personalPointsForOrder } from "../catalogue";
import { pickBestGift, type GiftCandidate } from "../reward-sizing";
import { addDays } from "../daily-revenue-model";
import type { IdeaLines } from "./chloe";

// Léa — la fidélité (Brigade 11, chantier « La brigade »).
//
// Deux idées, toutes deux sur des gestes DÉJÀ présents dans la console. Léa ne crée aucun
// écran, aucune règle, aucun texte côté membre : elle montre au gérant ce qui attend, et
// propose le geste que l'écran existant sait déjà faire.
//
//   1. « tickets_a_verifier » — des tickets attendent dans l'onglet Commandes (ADR 0052)
//      au-delà du délai que la page affiche déjà en alerte (2 h). Le geste est d'OUVRIR la
//      file : valider ou rejeter un ticket reste un acte humain, devant l'image. Léa ne
//      valide jamais à la place du gérant.
//   2. « cadeau_a_ajouter » — le catalogue « Mes points » est maigre et un article de la carte
//      y entrerait sans dépasser le taux cadeaux choisi (ADR 0017 / 0068). Le geste est
//      d'appeler `PATCH /api/admin/menu/eligible`, le même appel que le bouton « au catalogue »
//      de la page Menu (ADR 0061) ; il se défait d'un clic.
//
// Aucune estimation chiffrée : rien dans nos données ne relie un cadeau de plus à un nombre de
// clients de plus (ADR 0068, bouclier ADR 0065). Et un jour sans bonne idée vaut mieux qu'une
// idée de remplissage : dans tous les autres cas, Léa ne dit rien.

// ─── Types provisoires ────────────────────────────────────────────────────────
// Le contrat commun des idées (lib/agents/types.ts) est écrit par Mehdi (Brigade 01). À son
// arrivée, on remplace ces types, pas la logique. Une idée de Léa n'a pas de relais vers Hugo :
// son « geste » est une `action` — ouvrir un écran, ou appeler une route existante.

export type LeaAction =
  | { kind: "open"; path: string; label: string }
  | { kind: "call"; method: "PATCH"; path: string; body: Record<string, string | boolean>; label: string };

export type LeaIdea = {
  assistant: "lea";
  type: "tickets_a_verifier" | "cadeau_a_ajouter";
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: null; // aucune promesse de gain : on ne chiffre pas
  decideBy: string; // ISO : au-delà, l'idée n'a plus de sens, elle expire
  action: LeaAction;
  evidence: Record<string, number | string>; // les chiffres qui ont produit l'idée (trace)
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

/**
 * Délai d'attente au-delà duquel la page Commandes alerte (`waitHours(...) > 2` dans
 * `app/admin/[restaurantId]/orders/page.tsx`). Léa reprend CE seuil : elle ne durcit pas la
 * règle de l'écran, elle la répète au gérant qui n'ouvre pas l'écran.
 */
export const TICKET_SLA_HOURS = 2;

/** En dessous de ce nombre d'articles au catalogue, il est « maigre » : on cherche à l'étoffer. */
export const GIFT_CATALOGUE_TARGET = 3;

/**
 * Un cadeau proposé doit s'obtenir en au plus ce nombre de tickets moyens. HYPOTHÈSE à mesurer :
 * le catalogue de référence (ADR 0068) montre des cadeaux entre 3 et 6 tickets ; 8 laisse une
 * marge sans proposer un cadeau que personne n'atteindrait. La trace garde le nombre de tickets
 * de chaque idée, pour réviser ce seuil sur des cas réels.
 */
export const GIFT_MAX_TICKETS = 8;

/** Une idée de cadeau reste valable une semaine : le catalogue ne change pas d'un jour à l'autre. */
export const GIFT_DECIDE_DAYS = 7;

// ─── 1. Les tickets à vérifier (pur, déterministe) ────────────────────────────

export type PendingTicket = {
  id: string;
  submittedAt: string; // ISO (horodatage de dépôt)
  flagged: boolean; // la lecture a levé au moins un signalement (« Suspectes » dans l'écran)
  inDuplicateReview: boolean; // en cours d'arbitrage : il vit dans l'onglet « Doublons » (ADR 0052)
};

export type LeaTicketsInput = {
  restaurantId: string;
  todayISO: string; // jour de Bruxelles
  nowMs: number; // l'instant de lecture
  pending: PendingTicket[];
};

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Les heures d'attente, entières, jamais négatives (une horloge en avance ne fabrique pas de retard). */
function waitedHours(submittedAt: string, nowMs: number): number {
  const t = Date.parse(submittedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 3_600_000));
}

/** L'idée « des tickets attendent », ou `null` quand aucun ne dépasse le délai. */
export function ticketsToVerifyIdea(input: LeaTicketsInput): LeaIdea | null {
  const { restaurantId, todayISO, nowMs } = input;

  // Un ticket en arbitrage de doublon n'est PAS dans la file « En attente » de l'écran : le
  // compter ici renverrait le gérant vers un onglet où il ne le trouve pas.
  const queue = input.pending.filter((t) => !t.inDuplicateReview);
  // Strictement plus de 2 h, comme l'écran (`waitHours(...) > 2`) : à 2 h pile il n'alerte pas encore.
  const overSla = queue.filter((t) => nowMs - Date.parse(t.submittedAt) > TICKET_SLA_HOURS * 3_600_000);
  if (overSla.length === 0) return null;

  const oldest = Math.max(...overSla.map((t) => waitedHours(t.submittedAt, nowMs)));
  const flagged = overSla.filter((t) => t.flagged).length;
  const n = overSla.length;

  const closer = flagged > 0 ? `, dont ${flagged} à regarder de près` : "";
  return {
    assistant: "lea",
    type: "tickets_a_verifier",
    title: n > 1 ? `${n} tickets attendent depuis plus de ${TICKET_SLA_HOURS} h` : `1 ticket attend depuis plus de ${TICKET_SLA_HOURS} h`,
    question: "Tu les regardes ?",
    lines: {
      what: `${n} ${plural(n, "ticket", "tickets")} ${plural(n, "attend", "attendent")} ta validation (le plus ancien depuis ${oldest} h)${closer}. Je t'ouvre l'onglet Commandes.`,
      who: "Toi, ou ton manager : valider ou rejeter se fait devant l'image du ticket.",
      cost: "0 € : tes clients reçoivent leurs points dès que tu valides.",
    },
    estimate: null,
    decideBy: todayISO,
    action: { kind: "open", path: `/admin/${restaurantId}/orders`, label: "Voir les tickets" },
    evidence: { pending: queue.length, overSla: n, flagged, oldestHours: oldest, slaHours: TICKET_SLA_HOURS },
  };
}

// ─── 2. Le cadeau à ajouter (pur, déterministe) ───────────────────────────────

export type GiftItem = {
  id: string;
  name: string;
  menuPrice: number;
  costPrice: number | null; // null = prix de revient inconnu : jamais un cadeau (ADR 0046)
  isActive: boolean;
  rewardEligible: boolean; // déjà au catalogue « Mes points »
};

export type LeaGiftInput = {
  restaurantId: string;
  todayISO: string;
  pct: number; // taux cadeaux choisi par le gérant (ADR 0068)
  avgBasket: number; // panier moyen des tickets validés (ADR 0017)
  items: GiftItem[];
};

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * L'idée d'étoffer le catalogue, ou `null` : catalogue déjà fourni, aucun article éligible au
 * calcul, ou rien qui s'obtienne en `GIFT_MAX_TICKETS` tickets moyens ou moins.
 *
 * « Coût ≤ taux choisi » : le prix en points vient de `catalogPricePoints(coût, taux)`, donc le
 * coût réel du cadeau ne dépasse jamais la part du taux sur les dépenses qui l'ont produit
 * (arrondi vers le haut, ADR 0017). Ce qu'on filtre ici est l'AUTRE sens : un cadeau que le
 * taux rend trop cher en points ne se mérite plus. Au taux de 4 % il faut deux fois plus de
 * points qu'à 8 % pour le même article, d'où le calcul en tickets plutôt qu'un seuil en euros.
 */
export function giftToAddIdea(input: LeaGiftInput): LeaIdea | null {
  const { restaurantId, todayISO, pct, avgBasket } = input;
  const ticketPoints = personalPointsForOrder(avgBasket);
  if (!(pct > 0) || ticketPoints <= 0) return null;

  const live = input.items.filter((i) => i.isActive);
  const inCatalogue = live.filter((i) => i.rewardEligible && Number(i.costPrice) > 0).length;
  if (inCatalogue >= GIFT_CATALOGUE_TARGET) return null;

  // Chaque candidat avec ce qu'il coûterait en points et en tickets, à CE taux.
  const reachable = live
    .filter((i) => !i.rewardEligible && Number(i.costPrice) > 0)
    .map((i) => {
      const pricePoints = catalogPricePoints(i.costPrice, pct);
      return { item: i, pricePoints, tickets: pricePoints == null ? Infinity : Math.ceil(pricePoints / ticketPoints) };
    })
    .filter((c) => c.pricePoints != null && c.tickets <= GIFT_MAX_TICKETS);
  if (reachable.length === 0) return null;

  // Parmi eux, le meilleur rapport valeur perçue / coût réel (la règle de l'ADR 0013, réutilisée).
  const candidates: GiftCandidate[] = reachable.map((c) => ({
    id: c.item.id,
    name: c.item.name,
    menu_price: Number(c.item.menuPrice),
    cost_price: Number(c.item.costPrice),
  }));
  const best = pickBestGift(candidates, Number.MAX_SAFE_INTEGER);
  if (!best) return null;
  const chosen = reachable.find((c) => c.item.id === best.id)!;
  const tickets = chosen.tickets;
  const pricePoints = chosen.pricePoints as number;

  return {
    assistant: "lea",
    type: "cadeau_a_ajouter",
    title: `« ${chosen.item.name} » manque à ton catalogue`,
    question: "Je l'ajoute ?",
    lines: {
      what: `Mettre « ${chosen.item.name} » au catalogue « Mes points » : ${pricePoints} points, soit ${tickets} ${plural(tickets, "ticket moyen", "tickets moyens")}.`,
      who: "Toi, en un clic : tu peux le retirer d'un clic depuis la page Menu.",
      cost: `Au plus ${eur(Number(chosen.item.costPrice))} par cadeau offert, dans ton taux de ${Math.round(pct * 100)} %.`,
    },
    estimate: null,
    decideBy: addDays(todayISO, GIFT_DECIDE_DAYS),
    action: {
      kind: "call",
      method: "PATCH",
      path: "/api/admin/menu/eligible",
      body: { restaurantId, menuItemId: chosen.item.id, rewardEligible: true },
      label: "Ajouter",
    },
    evidence: {
      item: chosen.item.name,
      pricePoints,
      tickets,
      pct,
      inCatalogue,
      candidates: reachable.length,
      maxTickets: GIFT_MAX_TICKETS,
    },
  };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

type PendingRow = { id: string; submitted_at: string; flag_reasons: string[] | null };

/**
 * Les tickets en attente d'un établissement, par pages (une file qui s'est accumulée dépasse
 * facilement 1 000 lignes) et sans jamais présenter un échantillon comme le tout : un plafond
 * atteint fait échouer la lecture, il ne rend pas un compte partiel.
 */
export async function loadLeaTicketsInput(restaurantId: string, todayISO: string, nowMs = Date.now()): Promise<LeaTicketsInput> {
  const admin = createAdminClient();
  const rows = await fetchAllRowsStrict<PendingRow>("Léa : tickets en attente", (from, to) =>
    admin
      .from("orders")
      .select("id, submitted_at, flag_reasons")
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .order("submitted_at")
      .order("id")
      .range(from, to)
  );
  const pending: PendingTicket[] = rows.map((r) => ({
    id: r.id,
    submittedAt: r.submitted_at,
    flagged: Array.isArray(r.flag_reasons) && r.flag_reasons.length > 0,
    inDuplicateReview: Array.isArray(r.flag_reasons) && r.flag_reasons.includes("duplicate_review"),
  }));
  return { restaurantId, todayISO, nowMs, pending };
}

/** La carte, le taux cadeaux choisi et le panier moyen : de quoi juger ce qu'un cadeau coûterait. */
export async function loadLeaGiftInput(restaurantId: string, todayISO: string): Promise<LeaGiftInput> {
  const [menu, pct, avgBasket] = await Promise.all([
    getMenuItems(restaurantId),
    getRestaurantBudgetPct(restaurantId),
    getAverageBasket(restaurantId),
  ]);
  const items: GiftItem[] = menu.map((m) => ({
    id: m.id,
    name: m.name,
    menuPrice: Number(m.menu_price),
    costPrice: m.cost_price == null ? null : Number(m.cost_price),
    isActive: m.is_active,
    rewardEligible: m.reward_eligible,
  }));
  return { restaurantId, todayISO, pct, avgBasket, items };
}
