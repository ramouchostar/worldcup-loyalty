import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { getConsentingUserIds } from "../consent";
import { getRestaurantBudgetPct } from "../budget";
import { isMissingJournal } from "../message-log";
import { isHoldout, HOLDOUT_PCT } from "../sequence-rules";
import { addDays } from "../daily-revenue-model";
import type { HugoRelay, IdeaLines } from "./chloe";

// Hugo — les relances (Brigade 08, chantier « La brigade »).
//
// Deux idées, toutes deux validées par le gérant avant le moindre envoi :
//
//   1. « clients_a_relancer » — des membres qui avaient commandé ne sont pas revenus depuis
//      21 jours ou plus. Hugo rédige UN message pour eux ; sur « Oui », il part en promo
//      (consentement marketing exigé, ADR 0039 ; 2 par semaine et par membre ; 10 % de témoins
//      qui ne reçoivent rien, pour mesurer l'effet, ADR 0063).
//   2. « promo_a_annoncer » — le relais de Chloé : une promo ou un plat à mettre en avant devient
//      une annonce programmée à la bonne date (ADR 0023).
//
// Ce que Hugo NE fait PAS, et pourquoi :
//   - l'anniversaire : il est déjà fêté par `lib/member-strategies.ts` (ADR 0024 §3), avec un
//     cadeau calibré sur la fidélité. Une seconde idée enverrait deux messages le même jour ;
//   - doubler la réactivation automatique (`winback`, ADR 0024 §4, ≥ 3 tickets et silence ≥ 2×
//     son rythme) : un membre déjà relancé par elle ces 30 derniers jours n'est jamais retenu ici ;
//   - créer un cadeau : le message invite à revenir, les cadeaux restent ceux du programme, déjà
//     plafonnés au taux choisi par le gérant (ADR 0012 / 0068) ;
//   - écrire un euro : ADR 0007, un message est une surface membre.
//
// Un jour sans bonne idée vaut mieux qu'une idée de remplissage : dans tous les autres cas,
// Hugo ne dit rien.

// ─── Types provisoires ────────────────────────────────────────────────────────
// Le contrat commun des idées (lib/agents/types.ts) est écrit par Mehdi (Brigade 01). À son
// arrivée, on remplace ces types, pas la logique. Le « geste » d'une idée de Hugo est une
// `action` que `execute-hugo.ts` sait exécuter après le « Oui » du gérant.

export type HugoAction =
  | { kind: "send_to_members"; campaign: typeof HUGO_WINBACK_KEY; message: string; label: string }
  | { kind: "schedule_broadcast"; message: string; sendOn: string; promoOn: string | null; label: string };

export type HugoIdea = {
  assistant: "hugo";
  type: "clients_a_relancer" | "promo_a_annoncer";
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: null; // aucune promesse de retour de clients : on ne chiffre pas (ADR 0068, bouclier ADR 0065)
  decideBy: string; // ISO : au-delà, l'idée n'a plus de sens, elle expire
  action: HugoAction;
  evidence: Record<string, number | string>; // les chiffres qui ont produit l'idée (trace)
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** Clé du message dans le journal (`message_sends.message_key`) et dans le catalogue. */
export const HUGO_WINBACK_KEY = "hugo_winback" as const;

/**
 * Un membre « ne revient plus » après ce nombre de jours sans ticket validé. HYPOTHÈSE à mesurer
 * (la fiche de la tâche dit « seuil à mesurer ») : la réactivation automatique attend au moins
 * 14 jours et 2× le rythme du membre ; 21 jours laisse passer trois semaines de vacances scolaires
 * sans accuser personne. La trace garde l'ancienneté de chaque cohorte pour le réviser.
 */
export const LAPSED_DAYS = 21;
/** Au-delà, ce n'est plus une habitude qui se perd mais un client parti : on ne le dérange pas. HYPOTHÈSE. */
export const LAPSED_MAX_DAYS = 90;
/** En dessous, une relance n'a pas de témoin lisible (10 % de 9 membres = 0 ou 1) : on ne la propose pas. */
export const MIN_AUDIENCE = 10;
/** Un membre déjà relancé (par la réactivation automatique ou par Hugo) ne l'est pas deux fois en 30 jours. */
export const CONTACT_COOLDOWN_DAYS = 30;
/** L'idée reste valable une semaine : la cohorte ne change pas d'un jour à l'autre. */
export const LAPSED_DECIDE_DAYS = 7;
/** Longueur maximale d'un message de promo (une notification push se lit sur deux lignes). */
export const MAX_MESSAGE_LENGTH = 300;

const DAY_MS = 86_400_000;

// ─── Le message ───────────────────────────────────────────────────────────────

/**
 * Pourquoi ce message ne partirait pas, ou `null`. Vérifié à la proposition ET à l'envoi : le
 * gérant peut modifier le brouillon. Un montant en euros n'a rien à faire dans un message membre
 * (ADR 0007, ADR 0028 §5).
 */
export function messageProblem(message: string): string | null {
  const m = message.trim();
  if (m.length === 0) return "Le message est vide.";
  if (m.length > MAX_MESSAGE_LENGTH) return `Le message dépasse ${MAX_MESSAGE_LENGTH} caractères.`;
  if (/€|\beuros?\b/i.test(m)) return "Pas de montant en euros dans un message aux membres.";
  return null;
}

/** Le brouillon écrit pour le gérant, modifiable avant l'envoi. Sans euro, sans promesse de cadeau. */
export function lapsedDraft(restaurantName: string): string {
  return `Ça fait un moment ! Viens voir ce que tes points te permettent d'avoir chez ${restaurantName} 😊`;
}

// ─── 1. Les clients à relancer (pur, déterministe) ────────────────────────────

export type HugoMember = {
  userId: string;
  lastOrderAt: string; // ISO du dernier ticket validé
  orders: number; // tickets validés
  promoConsent: boolean; // a accepté les offres (`marketing_push`, ADR 0039)
  lastContactAt: string | null; // dernière relance reçue (réactivation automatique ou Hugo), ISO
};

export type HugoLapsedInput = {
  restaurantId: string;
  restaurantName: string;
  todayISO: string; // jour de Bruxelles
  nowMs: number;
  pct: number; // taux cadeaux choisi par le gérant (ADR 0068)
  members: HugoMember[];
};

export type LapsedSelection = {
  /** Anciens clients dans la fenêtre (21 à 90 jours), avec ou sans consentement. */
  lapsed: number;
  /** … dont déjà relancés ces 30 derniers jours : écartés. */
  recentlyContacted: number;
  /** … dont sans consentement aux offres : écartés. */
  noConsent: number;
  /** Joignables : consentants et pas relancés récemment. */
  reachable: string[];
  /** Tirés pour mesurer l'effet : ils ne reçoivent rien. */
  holdout: string[];
  /** Ceux qui reçoivent le message. */
  treated: string[];
};

/**
 * Qui relancer. Une seule règle, partagée par l'idée et par l'exécuteur : ce que le gérant a vu
 * est ce qui part, sans que deux copies de la règle puissent diverger.
 */
export function selectLapsed(input: Pick<HugoLapsedInput, "nowMs" | "members">): LapsedSelection {
  const { nowMs } = input;
  let lapsed = 0;
  let recentlyContacted = 0;
  let noConsent = 0;
  const reachable: string[] = [];

  for (const m of input.members) {
    const last = Date.parse(m.lastOrderAt);
    if (!Number.isFinite(last) || m.orders < 1) continue;
    const days = Math.floor((nowMs - last) / DAY_MS);
    if (days < LAPSED_DAYS || days > LAPSED_MAX_DAYS) continue;
    lapsed++;
    const contact = m.lastContactAt ? Date.parse(m.lastContactAt) : NaN;
    if (Number.isFinite(contact) && nowMs - contact < CONTACT_COOLDOWN_DAYS * DAY_MS) {
      recentlyContacted++;
      continue;
    }
    if (!m.promoConsent) {
      noConsent++;
      continue;
    }
    reachable.push(m.userId);
  }

  // Le tirage est celui des séquences (ADR 0063) : stable, un même membre est toujours témoin ou
  // toujours traité pour cette relance.
  const holdout = reachable.filter((id) => isHoldout(id, HUGO_WINBACK_KEY));
  const held = new Set(holdout);
  const treated = reachable.filter((id) => !held.has(id));
  return { lapsed, recentlyContacted, noConsent, reachable, holdout, treated };
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** L'idée « des clients ne reviennent plus », ou `null` quand la cohorte est trop petite pour être mesurée. */
export function lapsedIdea(input: HugoLapsedInput): HugoIdea | null {
  const sel = selectLapsed(input);
  if (sel.reachable.length < MIN_AUDIENCE) return null;

  const message = lapsedDraft(input.restaurantName);
  if (messageProblem(message) !== null) return null; // un nom d'établissement qui ferait échouer le brouillon

  const n = sel.reachable.length;
  const t = sel.treated.length;
  const h = sel.holdout.length;
  return {
    assistant: "hugo",
    type: "clients_a_relancer",
    title: `${n} clients ne sont pas revenus depuis ${LAPSED_DAYS} jours`,
    question: "Je leur écris ?",
    lines: {
      what: `Un message à ${t} ${plural(t, "client", "clients")} qui avaient commandé et ne sont pas revenus : « ${message} »`,
      who: `Seulement les membres qui ont accepté les offres. ${h} ${plural(h, "autre est laissé", "autres sont laissés")} de côté, sans message, pour mesurer ce que la relance change.`,
      cost: `0 € de cadeau en plus : le message ne crée aucun cadeau, ceux du programme restent plafonnés à ton taux de ${Math.round(input.pct * 100)} %.`,
    },
    estimate: null,
    decideBy: addDays(input.todayISO, LAPSED_DECIDE_DAYS),
    action: { kind: "send_to_members", campaign: HUGO_WINBACK_KEY, message, label: "Envoyer" },
    evidence: {
      lapsed: sel.lapsed,
      reachable: n,
      treated: t,
      holdout: h,
      noConsent: sel.noConsent,
      recentlyContacted: sel.recentlyContacted,
      minDays: LAPSED_DAYS,
      maxDays: LAPSED_MAX_DAYS,
      holdoutPct: HOLDOUT_PCT,
    },
  };
}

// ─── 2. Le relais de Chloé : l'annonce à programmer (pur, déterministe) ───────

/**
 * L'annonce d'une promo ou d'un plat mis en avant, depuis le relais de Chloé. Elle part le jour
 * que Chloé a calculé (la veille de la promo, ADR 0023), jamais plus tôt, jamais au passé : une
 * annonce dont le jour est derrière nous n'a plus de sens, Hugo ne la propose pas.
 */
export function promoAnnouncementIdea(relay: HugoRelay, todayISO: string): HugoIdea | null {
  const sendOn = relay.sendOn ?? todayISO;
  if (sendOn < todayISO) return null;
  if (messageProblem(relay.message) !== null) return null;

  const withPromo = relay.discountPct != null && relay.promoOn != null;
  return {
    assistant: "hugo",
    type: "promo_a_annoncer",
    title: withPromo ? `Annoncer la promo du ${relay.promoOn} à tes membres` : "Annoncer ce plat à tes membres",
    question: "J'envoie l'annonce ?",
    lines: {
      what: `${sendOn === todayISO ? "Annonce aujourd'hui" : `Annonce le ${sendOn}`}${withPromo ? `, la veille de la promo` : ""} : « ${relay.message} »`,
      who: "Seulement les membres qui ont accepté les offres, jamais les autres.",
      cost: withPromo
        ? "0 € pour l'annonce ; la remise annoncée est celle de l'idée de Chloé."
        : "0 € : une annonce, aucun prix ne bouge.",
    },
    estimate: null,
    decideBy: sendOn,
    action: { kind: "schedule_broadcast", message: relay.message, sendOn, promoOn: relay.promoOn, label: "Programmer" },
    evidence: { productId: relay.productId, discountPct: relay.discountPct ?? "aucune", sendOn, promoOn: relay.promoOn ?? "aucune" },
  };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

type MemberRow = { user_id: string };
type OrderRow = { user_id: string; submitted_at: string };
type WinbackRow = { user_id: string; sent_at: string };
type SendRow = { user_id: string | null; created_at: string };

/**
 * Membres, derniers tickets validés, consentements et dernières relances d'un établissement.
 *
 * Toutes les lectures qui agrègent sont paginées et refusent un résultat tronqué : une cohorte
 * calculée sur 1 000 tickets sur 10 000 serait fausse sans que rien ne le dise. Le consentement
 * ne se lit que pour la cohorte de la fenêtre (pas pour tous les membres), par lots, pour que la
 * requête reste sous la longueur d'URL de PostgREST.
 *
 * Les relances récentes se lisent à deux endroits : `notification_log` (réactivation automatique,
 * `winback`) et `message_sends` (relances de Hugo, statut « envoyé » — un témoin n'a rien reçu, il
 * reste donc éligible). Le journal des messages absent (migration pas appliquée) se lit « aucune
 * relance de Hugo » ; toute autre erreur remonte.
 */
export async function loadHugoInput(restaurantId: string, nowMs = Date.now()): Promise<HugoLapsedInput> {
  const admin = createAdminClient();
  const todayISO = new Date(nowMs).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const since = new Date(nowMs - CONTACT_COOLDOWN_DAYS * DAY_MS).toISOString();

  const [resto, memberRows, orderRows, winbacks, pct] = await Promise.all([
    admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
    fetchAllRowsStrict<MemberRow>("Hugo : membres", (from, to) =>
      admin.from("memberships").select("user_id").eq("restaurant_id", restaurantId).order("user_id").range(from, to)
    ),
    fetchAllRowsStrict<OrderRow>("Hugo : tickets validés", (from, to) =>
      admin
        .from("orders")
        .select("user_id, submitted_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "validated")
        .order("id")
        .range(from, to)
    ),
    fetchAllRowsStrict<WinbackRow>("Hugo : réactivations récentes", (from, to) =>
      admin
        .from("notification_log")
        .select("user_id, sent_at")
        .eq("restaurant_id", restaurantId)
        .eq("trigger_type", "winback")
        .gte("sent_at", since)
        .order("id")
        .range(from, to)
    ),
    getRestaurantBudgetPct(restaurantId),
  ]);
  if (resto.error) throw new Error(`restaurants : ${resto.error.message}`);

  // Dernier ticket et nombre de tickets par membre.
  const members = new Set(memberRows.map((m) => m.user_id));
  const byUser = new Map<string, { last: string; orders: number }>();
  for (const o of orderRows) {
    if (!members.has(o.user_id)) continue;
    const cur = byUser.get(o.user_id);
    if (!cur) byUser.set(o.user_id, { last: o.submitted_at, orders: 1 });
    else {
      cur.orders++;
      if (o.submitted_at > cur.last) cur.last = o.submitted_at;
    }
  }

  // Dernière relance reçue, tous canaux confondus.
  const lastContact = new Map<string, string>();
  const note = (id: string | null, at: string) => {
    if (id && (!lastContact.has(id) || at > (lastContact.get(id) as string))) lastContact.set(id, at);
  };
  for (const w of winbacks) note(w.user_id, w.sent_at);

  const hugoSends = await admin
    .from("message_sends")
    .select("user_id, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("message_key", HUGO_WINBACK_KEY)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(5000);
  if (hugoSends.error && !isMissingJournal(hugoSends.error)) throw new Error(`message_sends : ${hugoSends.error.message}`);
  for (const s of (hugoSends.data ?? []) as SendRow[]) note(s.user_id, s.created_at);

  // Le consentement ne se lit que pour la fenêtre : c'est la seule cohorte qui en a besoin.
  const inWindow = [...byUser.entries()]
    .filter(([, v]) => {
      const days = Math.floor((nowMs - Date.parse(v.last)) / DAY_MS);
      return days >= LAPSED_DAYS && days <= LAPSED_MAX_DAYS;
    })
    .map(([id]) => id);
  const consenting = new Set<string>();
  for (let i = 0; i < inWindow.length; i += 200) {
    for (const id of await getConsentingUserIds(inWindow.slice(i, i + 200), "marketing_push", admin)) consenting.add(id);
  }

  return {
    restaurantId,
    restaurantName: ((resto.data as { name: string | null } | null)?.name ?? "").trim() || "chez nous",
    todayISO,
    nowMs,
    pct,
    members: [...byUser.entries()].map(([userId, v]) => ({
      userId,
      lastOrderAt: v.last,
      orders: v.orders,
      promoConsent: consenting.has(userId),
      lastContactAt: lastContact.get(userId) ?? null,
    })),
  };
}
