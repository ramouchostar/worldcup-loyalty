import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { brusselsInstant } from "../mission-cancellation";
import type { Plan } from "../entitlements";
import {
  ASSISTANTS,
  DAILY_IDEA_CAP,
  IDEA_TYPE_PLAN,
  LEARNING_WINDOW_DAYS,
  MUTE_DAYS,
  REFUSAL_COOLDOWN_DAYS,
  REFUSAL_NOTE_MAX,
  refusalLearnedText,
  type AssistantId,
  type DiscardReason,
  type Idea,
  type IdeaOrigin,
  type IdeaStatus,
  type RefusalReason,
} from "./types";

// La couche des idées (ADR 0089, Brigade 02) : tout ce qui écrit ou lit
// `agent_proposals` passe par ici. Les générateurs (lib/agents/<prénom>.ts)
// produisent des `Idea` ; ce module décide lesquelles se montrent (forfait,
// doublon, refus récent, plafond de 3 par jour), les enregistre, et porte les
// décisions du gérant (Oui / Non / Plus tard), l'exécution et l'expiration.
//
// Deux moitiés :
//   - des règles PURES (testées dans proposals.test.ts), sans base ;
//   - des accès base, FAIL-OPEN sur la table absente (« indisponible », jamais
//     une exception qui casse la console), et stricts sur tout le reste.
//
// Ce module ne joue AUCUN geste : un « Oui » passe l'idée à « acceptée », et
// c'est l'exécuteur de l'assistant (execute-<prénom>.ts) qui appelle le chemin
// existant puis rend compte par `markExecuted` / `markExecutionFailed`.

// ─── Règles pures ─────────────────────────────────────────────────────────────

const PLAN_RANK: Record<Plan, number> = { gratuit: 0, croissance: 1, pro: 2 };

/** Le forfait qu'il faut pour qu'une idée soit montrée (ADR 0089 §1). */
export function requiredPlan(idea: Pick<Idea, "assistant" | "type">): Plan {
  return IDEA_TYPE_PLAN[idea.type] ?? ASSISTANTS[idea.assistant].plan;
}

export function planCovers(plan: Plan, required: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

/**
 * L'identité d'une idée pour l'anti-doublon : même assistant, même type, même
 * objet. L'objet est le plat (`evidence.productId`) ou le manque de la fiche
 * (`finding`) quand l'idée en a un ; sinon le type suffit.
 */
export function ideaKey(idea: Idea): string {
  const finding = (idea as Idea & { finding?: unknown }).finding;
  const subject =
    (typeof idea.evidence.productId === "string" && idea.evidence.productId) ||
    (idea.action.kind === "update_fiche" && idea.action.finding) ||
    (typeof finding === "string" && finding) ||
    "";
  return [idea.assistant, idea.type, subject].filter(Boolean).join(":");
}

/**
 * L'instant où l'idée expire. Une date seule (« 2026-11-11 ») vaut jusqu'à la
 * fin de ce jour à Bruxelles ; un instant ISO vaut tel quel.
 */
export function decideByInstant(decideBy: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(decideBy)) return new Date(brusselsInstant(decideBy, "23:59").getTime() + 59_999);
  const d = new Date(decideBy);
  if (Number.isNaN(d.getTime())) throw new Error(`decideBy illisible : « ${decideBy} »`);
  return d;
}

export function brusselsDay(ts: string | Date): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`); // midi : aucun changement d'heure ne fait sauter de jour
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Ce que la brigade apprend d'un établissement (ADR 0089 §8) ───────────────

const DAY_MS = 86_400_000;

/** Le type d'idée, tous objets confondus : c'est à ce niveau que la brigade apprend les goûts. */
export function typeKey(idea: Pick<Idea, "assistant" | "type">): string {
  return `${idea.assistant}:${idea.type}`;
}

export type TypeStats = {
  oui: number;
  non: number;
  byReason: Record<RefusalReason, number>;
  lastRefusalAt: number | null;
};

export type IdeaProfile = {
  /** Par type d'idée (`typeKey`), sur LEARNING_WINDOW_DAYS. */
  types: Map<string, TypeStats>;
  /** Le dernier refus de chaque idée (`ideaKey`), pour le délai propre à sa raison. */
  refusals: Map<string, { reason: RefusalReason; at: number }>;
};

export type HistoryRow = Pick<ProposalRow, "idea_key" | "assistant" | "type" | "status" | "decided_at" | "refusal_reason">;

const emptyStats = (): TypeStats => ({
  oui: 0,
  non: 0,
  byReason: { pas_le_moment: 0, trop_cher: 0, pas_pour_moi: 0, deja_fait: 0, autre: 0 },
  lastRefusalAt: null,
});

/** Le profil d'un établissement, à partir de ses idées décidées (pur). */
export function buildProfile(rows: HistoryRow[], nowMs: number): IdeaProfile {
  const profile: IdeaProfile = { types: new Map(), refusals: new Map() };
  const since = nowMs - LEARNING_WINDOW_DAYS * DAY_MS;
  for (const r of rows) {
    if (!r.decided_at) continue;
    const at = Date.parse(r.decided_at);
    if (!(at >= since)) continue;
    const yes = r.status === "acceptee" || r.status === "executee";
    const no = r.status === "refusee";
    if (!yes && !no) continue;
    const k = typeKey(r);
    const st = profile.types.get(k) ?? emptyStats();
    if (yes) st.oui++;
    else {
      const reason = r.refusal_reason ?? "autre";
      st.non++;
      st.byReason[reason]++;
      st.lastRefusalAt = Math.max(st.lastRefusalAt ?? 0, at);
      const prev = profile.refusals.get(r.idea_key);
      if (!prev || prev.at < at) profile.refusals.set(r.idea_key, { reason, at });
    }
    profile.types.set(k, st);
  }
  return profile;
}

/** Le goût d'un établissement pour un type d'idée : part de Oui, lissée (un type jamais vu vaut 0,5). */
export function acceptanceScore(stats: TypeStats | undefined): number {
  return ((stats?.oui ?? 0) + 1) / ((stats?.oui ?? 0) + (stats?.non ?? 0) + 2);
}

/**
 * Un type est en pause pour un établissement quand il l'a dit deux fois
 * (« pas pour mon établissement ») ou l'a refusé trois fois sans jamais dire
 * oui ; la pause dure MUTE_DAYS après le dernier refus, puis on retente.
 */
export function isTypeMuted(stats: TypeStats | undefined, nowMs: number): boolean {
  if (!stats || stats.lastRefusalAt === null) return false;
  const tired = stats.byReason.pas_pour_moi >= 2 || (stats.non >= 3 && stats.oui === 0);
  return tired && nowMs - stats.lastRefusalAt < MUTE_DAYS * DAY_MS;
}

/** La même idée, refusée : elle ne revient pas avant le délai de SA raison. */
export function refusalStillBlocks(refusal: { reason: RefusalReason; at: number } | undefined, nowMs: number): boolean {
  return !!refusal && nowMs - refusal.at < REFUSAL_COOLDOWN_DAYS[refusal.reason] * DAY_MS;
}

export const EMPTY_PROFILE: IdeaProfile = { types: new Map(), refusals: new Map() };

// ─── Le choix du jour ─────────────────────────────────────────────────────────

export type Selection = {
  show: Idea[];
  discard: { idea: Idea; reason: DiscardReason }[];
};

export type SelectionContext = {
  plan: Plan;
  /** Idées déjà montrées aujourd'hui à cet établissement (hors écartées). */
  shownToday: number;
  /** Clés des idées qui attendent une décision. */
  openKeys: Set<string>;
  /** Ce que la brigade a appris de cet établissement. */
  profile: IdeaProfile;
  /** Clés déjà écartées aujourd'hui : un second passage ne les réécrit pas. */
  discardedTodayKeys?: Set<string>;
  nowMs: number;
  cap?: number;
};

/**
 * Le tri entre les candidates (ADR 0089 §4 amendé §8) : ce que l'établissement
 * accepte le plus passe devant (part de Oui, au dixième) ; à goût égal, la date
 * limite la plus proche, puis celle qui a une estimation, puis l'ordre d'arrivée.
 */
export function rankIdeas(ideas: Idea[], profile: IdeaProfile = EMPTY_PROFILE): Idea[] {
  return ideas
    .map((idea, i) => ({
      idea,
      i,
      taste: Math.round(acceptanceScore(profile.types.get(typeKey(idea))) * 10),
      by: decideByInstant(idea.decideBy).getTime(),
    }))
    .sort((a, b) => b.taste - a.taste || a.by - b.by || Number(b.idea.estimate !== null) - Number(a.idea.estimate !== null) || a.i - b.i)
    .map((x) => x.idea);
}

/**
 * Ce qui se montre et ce qui s'écarte, avec la raison. Une idée déjà échue est
 * ignorée (rien à décider). Deux candidates de même clé dans le même lot : la
 * seconde est un doublon.
 */
export function selectIdeas(candidates: Idea[], ctx: SelectionContext): Selection {
  const cap = ctx.cap ?? DAILY_IDEA_CAP;
  let slots = Math.max(0, cap - ctx.shownToday);
  const seen = new Set<string>();
  const out: Selection = { show: [], discard: [] };

  for (const idea of rankIdeas(candidates, ctx.profile)) {
    if (decideByInstant(idea.decideBy).getTime() <= ctx.nowMs) continue;
    const key = ideaKey(idea);
    let reason: DiscardReason | null = null;
    if (!planCovers(ctx.plan, requiredPlan(idea))) reason = "forfait";
    else if (isTypeMuted(ctx.profile.types.get(typeKey(idea)), ctx.nowMs)) reason = "appris";
    else if (ctx.openKeys.has(key) || seen.has(key)) reason = "deja_proposee";
    else if (refusalStillBlocks(ctx.profile.refusals.get(key), ctx.nowMs)) reason = "refusee_recemment";
    else if (slots <= 0) reason = "plafond_du_jour";
    seen.add(key);
    if (reason && ctx.discardedTodayKeys?.has(key)) continue;
    if (reason) out.discard.push({ idea, reason });
    else {
      out.show.push(idea);
      slots--;
    }
  }
  return out;
}

/** Une idée « Plus tard » réapparaît le lendemain ; une idée échue n'est plus à décider. */
export function isVisibleToday(row: Pick<ProposalRow, "status" | "snoozed_until" | "decide_by">, today: string, nowMs: number): boolean {
  if (row.status !== "proposee") return false;
  if (new Date(row.decide_by).getTime() <= nowMs) return false;
  return !row.snoozed_until || row.snoozed_until <= today;
}

export type Decision = { kind: "oui" } | { kind: "non"; reason: RefusalReason; note?: string | null } | { kind: "plus_tard" };

/** La saisie libre : espaces retirés, coupée à REFUSAL_NOTE_MAX, `null` si vide. */
export function cleanRefusalNote(note: string | null | undefined): string | null {
  const t = (note ?? "").replace(/\s+/g, " ").trim().slice(0, REFUSAL_NOTE_MAX);
  return t.length > 0 ? t : null;
}

/** Ce que la décision écrit (pur). `null` : la décision n'a plus de sens (déjà décidée, ou échue). */
export function decisionPatch(
  row: Pick<ProposalRow, "status" | "decide_by" | "snooze_count">,
  decision: Decision,
  ctx: { userId: string; nowMs: number }
): Record<string, unknown> | null {
  if (row.status !== "proposee") return null;
  if (new Date(row.decide_by).getTime() <= ctx.nowMs) return null;
  const now = new Date(ctx.nowMs).toISOString();
  const base = { decided_by: ctx.userId, updated_at: now };
  switch (decision.kind) {
    case "oui":
      return { ...base, status: "acceptee", decided_at: now };
    case "non":
      return { ...base, status: "refusee", decided_at: now, refusal_reason: decision.reason, refusal_note: cleanRefusalNote(decision.note) };
    case "plus_tard":
      // Reste « proposée » : ni decided_at ni décision, seulement cachée jusqu'à demain.
      return {
        updated_at: now,
        snoozed_until: addDays(brusselsDay(new Date(ctx.nowMs)), 1),
        snooze_count: (row.snooze_count ?? 0) + 1,
      };
  }
}

// ─── Base ─────────────────────────────────────────────────────────────────────

export type ProposalRow = {
  id: string;
  restaurant_id: string;
  assistant: AssistantId;
  type: string;
  idea_key: string;
  origin: IdeaOrigin;
  status: IdeaStatus;
  action_kind: string;
  content: Idea & Record<string, unknown>;
  proposed_on: string;
  decide_by: string;
  seen_at: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  decided_at: string | null;
  decided_by: string | null;
  refusal_reason: RefusalReason | null;
  refusal_note: string | null;
  discard_reason: DiscardReason | null;
  executed_at: string | null;
  execution_error: string | null;
  result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "agent_proposals";

/** Table absente (migration pas encore appliquée) : on lit « indisponible », jamais une erreur. */
export function isMissingProposals(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /agent_proposals/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? "");
}

/** Lecture paginée stricte ; `null` si la table manque (fetchAllRowsStrict ne garde que le message). */
async function readRows<T>(label: string, page: Parameters<typeof fetchAllRowsStrict<T>>[1]): Promise<T[] | null> {
  try {
    return await fetchAllRowsStrict<T>(label, page);
  } catch (e) {
    if (isMissingProposals({ message: (e as Error).message })) return null;
    throw e;
  }
}

export type Unavailable = { unavailable: true };
const UNAVAILABLE: Unavailable = { unavailable: true };

type HistoryReadRow = HistoryRow & Pick<ProposalRow, "proposed_on">;

/**
 * Ce que la brigade sait d'un établissement : ses idées ouvertes, celles du jour
 * (`includeToday`), et ses décisions des LEARNING_WINDOW_DAYS derniers jours.
 * Filtrable par type d'idée. `null` si la table manque.
 */
async function readHistory(
  restaurantId: string,
  nowMs: number,
  opts: { includeToday?: string; assistant?: AssistantId; type?: string } = {}
): Promise<HistoryReadRow[] | null> {
  const since = new Date(nowMs - LEARNING_WINDOW_DAYS * 86_400_000).toISOString();
  const or = [
    "status.eq.proposee",
    `and(status.in.(acceptee,executee,refusee),decided_at.gte.${since})`,
    ...(opts.includeToday ? [`proposed_on.eq.${opts.includeToday}`] : []),
  ].join(",");
  const admin = createAdminClient();
  return readRows<HistoryReadRow>("agent_proposals (historique)", (from, to) => {
    let q = admin
      .from(TABLE)
      .select("idea_key, assistant, type, status, proposed_on, decided_at, refusal_reason")
      .eq("restaurant_id", restaurantId)
      .or(or);
    if (opts.assistant) q = q.eq("assistant", opts.assistant);
    if (opts.type) q = q.eq("type", opts.type);
    return q.order("created_at", { ascending: true }).range(from, to);
  });
}

export type RecordResult = { unavailable: false; shown: ProposalRow[]; discarded: { idea: Idea; reason: DiscardReason }[] } | Unavailable;

/**
 * Enregistre les idées produites pour un établissement : celles qui se montrent
 * passent « proposée », les autres « écartée » avec leur raison (comptées sur
 * /platform). Rejouable : une idée déjà ouverte n'est jamais montrée deux fois
 * (index unique partiel — un passage concurrent la reçoit en doublon).
 */
export async function recordIdeas(
  restaurantId: string,
  candidates: Idea[],
  opts: { plan: Plan; origin?: IdeaOrigin; createdBy?: string | null; nowMs?: number }
): Promise<RecordResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const today = brusselsDay(new Date(nowMs));
  const origin = opts.origin ?? "systeme";
  const admin = createAdminClient();

  const rows = await readHistory(restaurantId, nowMs, { includeToday: today });
  if (!rows) return UNAVAILABLE;
  const selection = selectIdeas(candidates, {
    plan: opts.plan,
    nowMs,
    shownToday: rows.filter((r) => r.proposed_on === today && r.status !== "ecartee").length,
    openKeys: new Set(rows.filter((r) => r.status === "proposee").map((r) => r.idea_key)),
    profile: buildProfile(rows, nowMs),
    discardedTodayKeys: new Set(rows.filter((r) => r.status === "ecartee" && r.proposed_on === today).map((r) => r.idea_key)),
  });

  const toRow = (idea: Idea, status: IdeaStatus, discard: DiscardReason | null) => ({
    restaurant_id: restaurantId,
    assistant: idea.assistant,
    type: idea.type,
    idea_key: ideaKey(idea),
    origin,
    status,
    action_kind: idea.action.kind,
    content: idea,
    proposed_on: today,
    decide_by: decideByInstant(idea.decideBy).toISOString(),
    discard_reason: discard,
    created_by: opts.createdBy ?? null,
  });

  const shown: ProposalRow[] = [];
  const discarded = [...selection.discard];
  for (const idea of selection.show) {
    const { data, error: insErr } = await admin.from(TABLE).insert(toRow(idea, "proposee", null)).select("*").single();
    if (insErr?.code === "23505") {
      // Un autre passage l'a montrée entre-temps : c'est un doublon, pas une erreur.
      discarded.push({ idea, reason: "deja_proposee" });
      continue;
    }
    if (insErr) {
      if (isMissingProposals(insErr)) return UNAVAILABLE;
      throw new Error(`agent_proposals (enregistrement) : ${insErr.message}`);
    }
    shown.push(data as ProposalRow);
  }
  if (discarded.length > 0) {
    const { error: dErr } = await admin.from(TABLE).insert(discarded.map((d) => toRow(d.idea, "ecartee", d.reason)));
    if (dErr && !isMissingProposals(dErr)) throw new Error(`agent_proposals (écartées) : ${dErr.message}`);
  }
  return { unavailable: false, shown, discarded };
}

export type TodayIdeas = { unavailable: false; toDecide: ProposalRow[]; inProgress: ProposalRow[] } | Unavailable;

/**
 * Ce que l'écran « Idées du jour » montre : les idées à décider (hors « Plus
 * tard » et hors échues), et les « Oui » pas encore exécutés — dont ceux en
 * échec, qui restent visibles avec leur erreur (ADR 0089 §5).
 */
export async function listTodayIdeas(restaurantId: string, nowMs = Date.now()): Promise<TodayIdeas> {
  const today = brusselsDay(new Date(nowMs));
  const admin = createAdminClient();
  const rows = await readRows<ProposalRow>("agent_proposals (idées du jour)", (from, to) =>
    admin
      .from(TABLE)
      .select("*")
      .eq("restaurant_id", restaurantId)
      .in("status", ["proposee", "acceptee"])
      .order("decide_by", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to)
  );
  if (!rows) return UNAVAILABLE;
  return {
    unavailable: false,
    toDecide: rows.filter((r) => isVisibleToday(r, today, nowMs)),
    inProgress: rows.filter((r) => r.status === "acceptee"),
  };
}

/** Une idée de CET établissement ; `null` si introuvable, « indisponible » si la table manque. */
export async function getIdea(restaurantId: string, id: string): Promise<ProposalRow | null | Unavailable> {
  const { data, error } = await createAdminClient().from(TABLE).select("*").eq("restaurant_id", restaurantId).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingProposals(error)) return UNAVAILABLE;
    throw new Error(`agent_proposals (lecture) : ${error.message}`);
  }
  return (data as ProposalRow | null) ?? null;
}

/** Les idées décidées ou expirées ces `days` derniers jours, les plus récentes d'abord (« Décidé cette semaine »). */
export async function listRecentDecisions(restaurantId: string, days = 7, nowMs = Date.now()): Promise<ProposalRow[] | Unavailable> {
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  const admin = createAdminClient();
  const rows = await readRows<ProposalRow>("agent_proposals (décidées)", (from, to) =>
    admin
      .from(TABLE)
      .select("*")
      .eq("restaurant_id", restaurantId)
      .in("status", ["executee", "refusee", "expiree"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .range(from, to)
  );
  return rows ?? UNAVAILABLE;
}

/** Note la première fois que le gérant voit ses idées (mesure « ouvre ses idées », Brigade 06). */
export async function markSeen(restaurantId: string, ids: string[], nowMs = Date.now()): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await createAdminClient()
    .from(TABLE)
    .update({ seen_at: new Date(nowMs).toISOString() })
    .eq("restaurant_id", restaurantId)
    .in("id", ids)
    .is("seen_at", null);
  if (error && !isMissingProposals(error)) console.error("[agent_proposals] markSeen:", error.message);
}

export type DecideResult =
  | { ok: true; row: ProposalRow; learned: string | null }
  | { ok: false; reason: "introuvable" | "deja_decidee" | "echue" | "indisponible" };

/**
 * Oui / Non / Plus tard. Conditionnel sur le statut « proposée » : deux appuis
 * (deux téléphones, double tap) ne décident qu'une fois. La garde de
 * l'établissement (requireAdmin) est faite par l'appelant ; `restaurantId` est
 * re-vérifié ici pour qu'une idée d'un autre établissement soit introuvable.
 */
export async function decideIdea(
  restaurantId: string,
  id: string,
  decision: Decision,
  ctx: { userId: string; nowMs?: number }
): Promise<DecideResult> {
  const nowMs = ctx.nowMs ?? Date.now();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingProposals(error)) return { ok: false, reason: "indisponible" };
    throw new Error(`agent_proposals (décision) : ${error.message}`);
  }
  if (!data) return { ok: false, reason: "introuvable" };
  const row = data as ProposalRow;
  if (row.status !== "proposee") return { ok: false, reason: "deja_decidee" };
  const patch = decisionPatch(row, decision, { userId: ctx.userId, nowMs });
  if (!patch) return { ok: false, reason: "echue" };

  const { data: updated, error: upErr } = await admin
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "proposee")
    .select("*")
    .maybeSingle();
  if (upErr) throw new Error(`agent_proposals (décision) : ${upErr.message}`);
  if (!updated) return { ok: false, reason: "deja_decidee" };
  const done = updated as ProposalRow;
  if (decision.kind !== "non") return { ok: true, row: done, learned: null };

  // Ce que ce refus apprend, dit tout de suite au gérant (ADR 0089 §8).
  const history = await readHistory(restaurantId, nowMs, { assistant: done.assistant, type: done.type });
  const muted = isTypeMuted(buildProfile(history ?? [], nowMs).types.get(typeKey(done)), nowMs);
  return { ok: true, row: done, learned: refusalLearnedText(done.assistant, decision.reason, muted) };
}

/** L'exécuteur a joué le geste : « exécutée », avec ce qui s'est passé (envoi, demande créée…). */
export async function markExecuted(id: string, result: Record<string, unknown>, nowMs = Date.now()): Promise<boolean> {
  const now = new Date(nowMs).toISOString();
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ status: "executee", executed_at: now, execution_error: null, result, updated_at: now })
    .eq("id", id)
    .eq("status", "acceptee")
    .select("id");
  if (error) throw new Error(`agent_proposals (exécutée) : ${error.message}`);
  return (data ?? []).length > 0;
}

/** Le geste a échoué : l'idée reste « acceptée », avec son erreur, visible du gérant et de /platform. */
export async function markExecutionFailed(id: string, message: string, nowMs = Date.now()): Promise<void> {
  const { error } = await createAdminClient()
    .from(TABLE)
    .update({ execution_error: message.slice(0, 500), updated_at: new Date(nowMs).toISOString() })
    .eq("id", id)
    .eq("status", "acceptee");
  if (error) throw new Error(`agent_proposals (échec d'exécution) : ${error.message}`);
}

/** Les idées sans décision à leur date limite expirent (balayage, cron du matin — Brigade 05). Renvoie le nombre. */
export async function expireIdeas(nowMs = Date.now()): Promise<number | Unavailable> {
  const now = new Date(nowMs).toISOString();
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ status: "expiree", updated_at: now })
    .eq("status", "proposee")
    .lte("decide_by", now)
    .select("id");
  if (error) {
    if (isMissingProposals(error)) return UNAVAILABLE;
    throw new Error(`agent_proposals (expiration) : ${error.message}`);
  }
  return (data ?? []).length;
}
