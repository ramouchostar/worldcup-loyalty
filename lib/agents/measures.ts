import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { isMissingJournal } from "../message-log";
import { brusselsDay, isMissingProposals, type ProposalRow } from "./proposals";
import { ASSISTANTS, type AssistantId, type DiscardReason, type RefusalReason } from "./types";

// Les mesures de la brigade (ADR 0089 §7, Brigade 06) : de quoi dire, par assistant et par
// établissement, si la règle est fausse (ADR 0065). LECTURE SEULE de `agent_proposals` — rien d'ici
// ne décide, n'envoie ni ne modifie une idée.
//
// Deux moitiés : des calculs PURS (testés), et des lectures de base à la fin, strictes sur ce
// qu'elles agrègent (`fetchAllRowsStrict`) et fail-open sur la table absente.
//
// Ce que la table permet de mesurer vraiment, et ce qu'elle ne permet pas :
//   - « ouvre ses idées » : `seen_at` est noté à l'ouverture de l'écran (Brigade 03) ✔
//   - « décidées », « délai », « taux de Oui », « raisons de refus » : `status`, `decided_at`,
//     `refusal_reason` ✔
//   - « temps passé par jour » : AUCUN chronomètre n'existe. On l'ESTIME à partir des vues et des
//     décisions (`activityMinutes`) : c'est une durée d'activité, jamais un temps de lecture. Le
//     nom le dit partout où il s'affiche ✘ (mesure indirecte, assumée)
//   - « clients revenus contre le groupe témoin » : pour les relances de Hugo, `message_sends`
//     (témoin / envoyé) et les tickets validés ✔ (`campaignEffect`)

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** Fenêtre des mesures : « à plus de 70 % de refus sur un mois, un assistant est revu » (ADR 0089 §7). */
export const MEASURE_DAYS = 30;
/** Alerte quand le taux de Oui d'un assistant passe sous ce seuil (ADR 0089 §7). */
export const YES_RATE_ALERT = 0.3;
/** Sous ce nombre d'idées décidées, un taux ne dit rien : on l'affiche, sans alerte (« pas assez de recul »). */
export const MIN_DECIDED_FOR_ALERT = 10;
/** Deux événements séparés de plus que cela ne sont plus la même visite à l'écran. HYPOTHÈSE à mesurer. */
export const SESSION_GAP_MINUTES = 10;
/** On promet cinq minutes par jour au gérant (ADR 0089 §1). */
export const PROMISED_MINUTES = 5;
/** Une relance se juge sur les tickets validés dans les 14 jours qui suivent l'envoi. HYPOTHÈSE à mesurer. */
export const RETURN_WINDOW_DAYS = 14;
/** Sous ce nombre de témoins, la comparaison est affichée mais dite « trop petite pour conclure ». */
export const MIN_HOLDOUT_FOR_EFFECT = 30;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

// ─── Les lignes dont on a besoin ──────────────────────────────────────────────

export type MeasureRow = Pick<
  ProposalRow,
  | "restaurant_id"
  | "assistant"
  | "type"
  | "origin"
  | "status"
  | "proposed_on"
  | "created_at"
  | "seen_at"
  | "decided_at"
  | "snooze_count"
  | "refusal_reason"
  | "refusal_note"
  | "discard_reason"
  | "execution_error"
  | "executed_at"
>;

// ─── Un groupe d'idées (un assistant, un établissement, ou tout le réseau) ────

export type GroupMeasure = {
  /** Idées produites (montrées ou écartées). */
  produced: number;
  /** Idées montrées au gérant (tout sauf les écartées). */
  shown: number;
  /** Écartées avant d'être montrées, par raison : « Rien ne disparaît en silence » (ADR 0065). */
  discarded: Partial<Record<DiscardReason, number>>;
  decided: number;
  yes: number;
  no: number;
  expired: number;
  /** Encore ouvertes : ni décidées ni expirées. Exclues des parts, elles n'ont pas dit leur dernier mot. */
  open: number;
  /** « Plus tard » cliqués. */
  snoozes: number;
  /** Décidées / (décidées + expirées). `null` : rien de clos encore. */
  decidedShare: number | null;
  /** Oui / décidées. `null` : rien de décidé encore. */
  yesRate: number | null;
  /** Vrai quand le taux de Oui passe sous le seuil ET que l'échantillon le permet. */
  yesRateAlert: boolean;
  /** Vrai quand `decided` est sous le minimum : le taux est affiché, jamais jugé. */
  tooFewToJudge: boolean;
  /** Délai de décision (production → décision), en heures, médiane. `null` : aucune décision. */
  medianDecisionHours: number | null;
  refusals: Partial<Record<RefusalReason, number>>;
  /** Refus accompagnés d'une saisie libre (lue par l'équipe). */
  refusalNotes: number;
  /** « Oui » dont l'exécution a échoué : à traiter, jamais cachés. */
  failedExecutions: number;
  /** « Oui » qui attendent l'équipe (geste préparé à la main). */
  awaitingTeam: number;
  /** Idées préparées à la main par l'équipe (Brigade 04). */
  fromTeam: number;
};

const SHOWN_STATUS = new Set(["proposee", "acceptee", "refusee", "expiree", "executee"]);

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function measureGroup(rows: readonly MeasureRow[]): GroupMeasure {
  const discarded: GroupMeasure["discarded"] = {};
  const refusals: GroupMeasure["refusals"] = {};
  let shown = 0, decided = 0, yes = 0, no = 0, expired = 0, open = 0, snoozes = 0;
  let refusalNotes = 0, failedExecutions = 0, awaitingTeam = 0, fromTeam = 0;
  const delays: number[] = [];

  for (const r of rows) {
    if (r.origin === "equipe") fromTeam++;
    if (r.status === "ecartee") {
      const why = r.discard_reason ?? "plafond_du_jour";
      discarded[why] = (discarded[why] ?? 0) + 1;
      continue;
    }
    if (!SHOWN_STATUS.has(r.status)) continue;
    shown++;
    snoozes += r.snooze_count ?? 0;

    if (r.status === "refusee") {
      no++; decided++;
      if (r.refusal_reason) refusals[r.refusal_reason] = (refusals[r.refusal_reason] ?? 0) + 1;
      if (r.refusal_note) refusalNotes++;
    } else if (r.status === "acceptee" || r.status === "executee") {
      yes++; decided++;
      if (r.execution_error) failedExecutions++;
      else if (r.status === "acceptee") awaitingTeam++;
    } else if (r.status === "expiree") expired++;
    else open++;

    if (r.decided_at && (r.status === "refusee" || r.status === "acceptee" || r.status === "executee")) {
      const h = (Date.parse(r.decided_at) - Date.parse(r.created_at)) / HOUR_MS;
      if (Number.isFinite(h) && h >= 0) delays.push(h);
    }
  }

  const closed = decided + expired;
  const tooFewToJudge = decided < MIN_DECIDED_FOR_ALERT;
  const yesRate = decided > 0 ? yes / decided : null;
  const med = median(delays);
  return {
    produced: rows.length,
    shown,
    discarded,
    decided,
    yes,
    no,
    expired,
    open,
    snoozes,
    decidedShare: closed > 0 ? decided / closed : null,
    yesRate,
    yesRateAlert: yesRate !== null && !tooFewToJudge && yesRate < YES_RATE_ALERT,
    tooFewToJudge,
    medianDecisionHours: med === null ? null : round1(med),
    refusals,
    refusalNotes,
    failedExecutions,
    awaitingTeam,
    fromTeam,
  };
}

// ─── Les jours où le gérant ouvre ses idées ───────────────────────────────────

export type OpenedDays = {
  /** Jours où au moins une idée a été montrée à cet établissement. */
  withIdeas: number;
  /** … dont au moins une idée a été vue. */
  opened: number;
  /** Part de jours ouverts. `null` : aucun jour avec une idée. */
  share: number | null;
};

/** Par jour de production : une idée montrée, et une vue notée sur l'une d'elles. */
export function openedDays(rows: readonly MeasureRow[]): OpenedDays {
  const byDay = new Map<string, { seen: boolean }>();
  for (const r of rows) {
    if (!SHOWN_STATUS.has(r.status)) continue;
    const key = `${r.restaurant_id}|${r.proposed_on}`;
    const cur = byDay.get(key) ?? { seen: false };
    if (r.seen_at) cur.seen = true;
    byDay.set(key, cur);
  }
  const withIdeas = byDay.size;
  const opened = [...byDay.values()].filter((d) => d.seen).length;
  return { withIdeas, opened, share: withIdeas > 0 ? opened / withIdeas : null };
}

// ─── Le temps passé (estimé) ──────────────────────────────────────────────────

/**
 * La durée d'ACTIVITÉ d'un établissement un jour donné, en minutes : on met bout à bout les vues
 * et les décisions de ce jour, on coupe quand deux événements sont séparés de plus de
 * `SESSION_GAP_MINUTES`, et on additionne la durée de chaque visite.
 *
 * Ce n'est PAS un temps de lecture : rien ne mesure le temps réel à l'écran. Un gérant qui lit
 * trois idées avant de décider la première compte pour une visite courte. C'est un plancher
 * honnête, pas une mesure ; à remplacer le jour où l'écran enverra de vrais événements.
 */
export function activityMinutes(eventsMs: readonly number[], gapMinutes = SESSION_GAP_MINUTES): number {
  const t = [...eventsMs].filter(Number.isFinite).sort((a, b) => a - b);
  if (t.length === 0) return 0;
  let total = 0;
  let start = t[0];
  let prev = t[0];
  for (let i = 1; i < t.length; i++) {
    if (t[i] - prev > gapMinutes * MINUTE_MS) {
      total += prev - start;
      start = t[i];
    }
    prev = t[i];
  }
  total += prev - start;
  return total / MINUTE_MS;
}

export type TimeSpent = {
  /** Jours où le gérant a fait quelque chose (vu ou décidé). */
  activeDays: number;
  medianMinutes: number | null;
  /** Part de ces jours à `PROMISED_MINUTES` ou moins : la promesse tenue. */
  withinPromise: number | null;
};

/** Pour chaque établissement et chaque jour d'activité, la durée estimée ; puis leur médiane. */
export function timeSpent(rows: readonly MeasureRow[]): TimeSpent {
  const days = new Map<string, number[]>();
  const push = (restaurantId: string, iso: string | null) => {
    if (!iso) return;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return;
    const key = `${restaurantId}|${brusselsDay(new Date(ms))}`;
    const list = days.get(key) ?? [];
    list.push(ms);
    days.set(key, list);
  };
  for (const r of rows) {
    push(r.restaurant_id, r.seen_at);
    push(r.restaurant_id, r.decided_at);
  }
  const minutes = [...days.values()].map((events) => activityMinutes(events));
  if (minutes.length === 0) return { activeDays: 0, medianMinutes: null, withinPromise: null };
  const med = median(minutes) as number;
  return {
    activeDays: minutes.length,
    medianMinutes: round1(med),
    withinPromise: minutes.filter((m) => m <= PROMISED_MINUTES).length / minutes.length,
  };
}

// ─── Tout ensemble : réseau, assistants, établissements ───────────────────────

export type MeasureReport = {
  sinceDay: string;
  days: number;
  network: GroupMeasure & { opened: OpenedDays; time: TimeSpent };
  byAssistant: { assistant: AssistantId; name: string; measure: GroupMeasure }[];
  byRestaurant: { restaurantId: string; measure: GroupMeasure; opened: OpenedDays; time: TimeSpent }[];
  /** Les assistants à revoir : taux de Oui sous le seuil sur un échantillon qui permet de juger. */
  alerts: { assistant: AssistantId; name: string; yesRate: number; decided: number }[];
};

export function buildReport(rows: readonly MeasureRow[], opts: { todayISO: string; days?: number }): MeasureReport {
  const days = opts.days ?? MEASURE_DAYS;
  const group = (list: readonly MeasureRow[]) => measureGroup(list);

  const byAssistantMap = new Map<AssistantId, MeasureRow[]>();
  const byRestaurantMap = new Map<string, MeasureRow[]>();
  for (const r of rows) {
    (byAssistantMap.get(r.assistant) ?? byAssistantMap.set(r.assistant, []).get(r.assistant)!).push(r);
    (byRestaurantMap.get(r.restaurant_id) ?? byRestaurantMap.set(r.restaurant_id, []).get(r.restaurant_id)!).push(r);
  }

  // Tous les assistants figurent au rapport, même sans une idée : un assistant muet se voit, il ne disparaît pas.
  const byAssistant = (Object.keys(ASSISTANTS) as AssistantId[]).map((assistant) => ({
    assistant,
    name: ASSISTANTS[assistant].name,
    measure: group(byAssistantMap.get(assistant) ?? []),
  }));

  const byRestaurant = [...byRestaurantMap.entries()]
    .map(([restaurantId, list]) => ({ restaurantId, measure: group(list), opened: openedDays(list), time: timeSpent(list) }))
    .sort((a, b) => b.measure.shown - a.measure.shown || a.restaurantId.localeCompare(b.restaurantId));

  return {
    sinceDay: opts.todayISO,
    days,
    network: { ...group(rows), opened: openedDays(rows), time: timeSpent(rows) },
    byAssistant,
    byRestaurant,
    alerts: byAssistant
      .filter((a) => a.measure.yesRateAlert)
      .map((a) => ({ assistant: a.assistant, name: a.name, yesRate: a.measure.yesRate as number, decided: a.measure.decided })),
  };
}

// ─── L'effet d'une relance contre son groupe témoin ───────────────────────────

export type CampaignEffect = {
  treated: number;
  treatedReturned: number;
  holdout: number;
  holdoutReturned: number;
  treatedRate: number | null;
  holdoutRate: number | null;
  /** Écart en points de pourcentage (traités − témoins). `null` si l'un des deux groupes est vide. */
  liftPoints: number | null;
  /** La fenêtre de retour est-elle écoulée ? Sinon l'effet est « en cours », pas définitif. */
  complete: boolean;
  /** Assez de témoins pour que l'écart pèse quelque chose. */
  enoughHoldout: boolean;
};

/**
 * Qui est revenu (un ticket validé dans la fenêtre qui suit l'envoi), chez les traités et chez les
 * témoins. L'écart ne PROUVE rien : il se lit avec les effectifs, et se dit « trop petit pour
 * conclure » sous `MIN_HOLDOUT_FOR_EFFECT` témoins. Jamais de « grâce à nous » (ADR 0064).
 */
export function campaignEffect(input: {
  treatedIds: readonly string[];
  holdoutIds: readonly string[];
  /** Pour chaque membre : instants (ms) de ses tickets validés. */
  orderTimes: ReadonlyMap<string, readonly number[]>;
  sentAtMs: number;
  nowMs: number;
  windowDays?: number;
}): CampaignEffect {
  const windowDays = input.windowDays ?? RETURN_WINDOW_DAYS;
  const end = input.sentAtMs + windowDays * 86_400_000;
  const returned = (ids: readonly string[]) =>
    ids.filter((id) => (input.orderTimes.get(id) ?? []).some((t) => t > input.sentAtMs && t <= end)).length;

  const treated = input.treatedIds.length;
  const holdout = input.holdoutIds.length;
  const treatedReturned = returned(input.treatedIds);
  const holdoutReturned = returned(input.holdoutIds);
  const treatedRate = treated > 0 ? treatedReturned / treated : null;
  const holdoutRate = holdout > 0 ? holdoutReturned / holdout : null;
  return {
    treated,
    treatedReturned,
    holdout,
    holdoutReturned,
    treatedRate,
    holdoutRate,
    liftPoints: treatedRate !== null && holdoutRate !== null ? Math.round((treatedRate - holdoutRate) * 1000) / 10 : null,
    complete: input.nowMs >= end,
    enoughHoldout: holdout >= MIN_HOLDOUT_FOR_EFFECT,
  };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

const MEASURE_COLUMNS =
  "restaurant_id, assistant, type, origin, status, proposed_on, created_at, seen_at, decided_at, snooze_count, refusal_reason, refusal_note, discard_reason, execution_error, executed_at";

/**
 * Les idées des `days` derniers jours, tous établissements ou ceux de `restaurantIds` seulement.
 * `null` : la table n'existe pas encore (migration pas appliquée) — la page le dit, rien ne casse.
 * Toute autre erreur remonte, et un plafond de lecture atteint fait échouer la lecture : une
 * mesure calculée sur un échantillon présenté comme le tout serait fausse sans le dire.
 */
export async function loadMeasureRows(days = MEASURE_DAYS, restaurantIds?: readonly string[], nowMs = Date.now()): Promise<MeasureRow[] | null> {
  if (restaurantIds && restaurantIds.length === 0) return [];
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  const admin = createAdminClient();
  try {
    const rows = await fetchAllRowsStrict<MeasureRow>("agent_proposals (mesures)", (from, to) => {
      let q = admin.from("agent_proposals").select(MEASURE_COLUMNS).gte("created_at", since);
      if (restaurantIds) q = q.in("restaurant_id", restaurantIds as string[]);
      return q.order("created_at", { ascending: false }).order("id").range(from, to);
    });
    return rows;
  } catch (e) {
    if (isMissingProposals({ message: (e as Error).message })) return null;
    throw e;
  }
}

export type CampaignRow = {
  proposalId: string;
  restaurantId: string;
  campaignId: string;
  sentAt: string;
  effect: CampaignEffect;
};

/**
 * Les relances de Hugo exécutées et leur effet contre le groupe témoin. Une relance sans journal
 * lisible est comptée « non mesurable » (`unreadable`), jamais passée sous silence.
 */
export async function loadCampaignEffects(days = 60, nowMs = Date.now()): Promise<{ campaigns: CampaignRow[]; unreadable: number } | null> {
  const admin = createAdminClient();
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  type Exec = { id: string; restaurant_id: string; executed_at: string | null; result: { detail?: { campaignId?: string } } | null };

  let execs: Exec[];
  try {
    execs = await fetchAllRowsStrict<Exec>("agent_proposals (relances exécutées)", (from, to) =>
      admin
        .from("agent_proposals")
        .select("id, restaurant_id, executed_at, result")
        .eq("action_kind", "send_to_members")
        .eq("status", "executee")
        .gte("created_at", since)
        .order("id")
        .range(from, to)
    );
  } catch (e) {
    if (isMissingProposals({ message: (e as Error).message })) return null;
    throw e;
  }

  const campaigns: CampaignRow[] = [];
  let unreadable = 0;
  for (const e of execs) {
    const campaignId = e.result?.detail?.campaignId;
    if (!campaignId || !e.executed_at) { unreadable++; continue; }

    const sends = await admin.from("message_sends").select("user_id, status").eq("campaign_id", campaignId).limit(20000);
    if (sends.error) {
      if (!isMissingJournal(sends.error)) throw new Error(`message_sends : ${sends.error.message}`);
      unreadable++;
      continue;
    }
    const treatedIds: string[] = [];
    const holdoutIds: string[] = [];
    for (const s of (sends.data ?? []) as { user_id: string | null; status: string }[]) {
      if (!s.user_id) continue;
      if (s.status === "holdout") holdoutIds.push(s.user_id);
      else if (s.status === "sent") treatedIds.push(s.user_id);
    }
    const everyone = [...treatedIds, ...holdoutIds];
    const orderTimes = new Map<string, number[]>();
    for (let i = 0; i < everyone.length; i += 200) {
      const chunk = everyone.slice(i, i + 200);
      const orders = await fetchAllRowsStrict<{ user_id: string; submitted_at: string }>("tickets validés (relance)", (from, to) =>
        admin
          .from("orders")
          .select("user_id, submitted_at")
          .eq("restaurant_id", e.restaurant_id)
          .eq("status", "validated")
          .gte("submitted_at", e.executed_at as string)
          .in("user_id", chunk)
          .order("id")
          .range(from, to)
      );
      for (const o of orders) (orderTimes.get(o.user_id) ?? orderTimes.set(o.user_id, []).get(o.user_id)!).push(Date.parse(o.submitted_at));
    }
    campaigns.push({
      proposalId: e.id,
      restaurantId: e.restaurant_id,
      campaignId,
      sentAt: e.executed_at,
      effect: campaignEffect({ treatedIds, holdoutIds, orderTimes, sentAtMs: Date.parse(e.executed_at), nowMs }),
    });
  }
  return { campaigns, unreadable };
}
