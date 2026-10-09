import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { VIDEO_TEMPLATE, type BriefAnswers, type BriefIssue, type BriefTemplate } from "./mission-brief";
import { mergeAnswers, planSend, sanitizeAnswers, type ProviderCandidate } from "./mission-draft";
import type { Metier } from "./mission-money";
import type { MissionStatus } from "./mission-states";

// ============================================================
// Réserver un prestataire (ADR 0084, PR C) — lecture et écriture des missions.
//
// Les décisions vivent dans lib/mission-*.ts (pures, testées) ; ce fichier ne
// fait que les appliquer à Supabase (service-role : les tables n'ont aucune
// policy). Les contrôles d'accès (restaurateur de l'établissement) sont faits
// par la route ou la page appelante ; chaque requête filtre aussi sur
// `restaurant_id` — une mission n'est jamais lue ni écrite hors de son resto.
//
// FAIL-OPEN : migration 20261009-1030 pas appliquée → `unavailable`, jamais un
// crash ; l'écran dit que le module n'est pas encore ouvert.
// Aucun échec silencieux (ADR 0065) : tout refus d'envoi laisse une ligne
// dans `mission_events` (kind, code, acteur).
// ============================================================

/** Le module est caché tant que MARKETPLACE_ENABLED n'est pas « true » (le super-admin le voit toujours). */
export function marketplaceEnabled(isSuperAdmin: boolean): boolean {
  return isSuperAdmin || process.env.MARKETPLACE_ENABLED === "true";
}

export type MissionRow = {
  id: string;
  restaurant_id: string;
  provider_id: string | null;
  metier: Metier;
  status: MissionStatus;
  brief: BriefAnswers;
  brief_locked_at: string | null;
  shoot_date: string | null;
  quote_cents: number | null;
  created_at: string;
  updated_at: string;
};

const MISSION_COLUMNS =
  "id, restaurant_id, provider_id, metier, status, brief, brief_locked_at, shoot_date, quote_cents, created_at, updated_at";

export type EventRow = {
  id: number;
  kind: string;
  from_status: MissionStatus | null;
  to_status: MissionStatus | null;
  actor_kind: string;
  reason: string | null;
  created_at: string;
};

type DbError = { code?: string; message?: string } | null;

/** Le modèle de questions actif du métier (base), sinon celui du code. `null` = métier pas encore ouvert. */
export async function loadTemplate(metier: Metier): Promise<{ template: BriefTemplate; id: string | null } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("brief_templates")
      .select("id, metier, questions, budget_floor_cents, ambition_budget_cents")
      .eq("metier", metier)
      .eq("active", true)
      .maybeSingle();
    if (error && !isMissingTable(error)) throw error;
    const row = data as { id: string; questions: BriefTemplate["questions"]; budget_floor_cents: number | null; ambition_budget_cents: Record<string, number> } | null;
    if (row && Array.isArray(row.questions) && row.questions.length > 0) {
      return {
        id: row.id,
        template: {
          metier,
          questions: row.questions,
          budgetFloorCents: row.budget_floor_cents ?? undefined,
          ambitionBudgetCents: row.ambition_budget_cents ?? undefined,
        },
      };
    }
  } catch (e) {
    console.error("[missions] loadTemplate failed:", (e as Error).message);
  }
  return metier === "video" ? { template: VIDEO_TEMPLATE, id: null } : null;
}

async function logEvent(
  missionId: string,
  e: { kind: string; from?: MissionStatus; to?: MissionStatus; actorKind: "restaurant" | "provider" | "platform" | "system"; actorId?: string; reason?: string; meta?: Record<string, unknown> }
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("mission_events").insert({
      mission_id: missionId,
      kind: e.kind,
      from_status: e.from ?? null,
      to_status: e.to ?? null,
      actor_kind: e.actorKind,
      actor_id: e.actorId ?? null,
      reason: e.reason ?? null,
      meta: e.meta ?? {},
    });
    if (error) throw error;
  } catch (err) {
    // La trace ne doit jamais faire échouer l'action — mais elle crie dans les logs.
    console.error("[missions] logEvent failed:", (err as Error).message);
  }
}

// ── Lecture ──────────────────────────────────────────────────

export async function listMissions(restaurantId: string): Promise<{ ok: true; missions: MissionRow[] } | { ok: false; reason: "unavailable" }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("missions")
      .select(MISSION_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { ok: true, missions: (data as MissionRow[]) ?? [] };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions] listMissions failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

export async function getMission(missionId: string, restaurantId: string): Promise<{ ok: true; mission: MissionRow | null } | { ok: false; reason: "unavailable" }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("missions")
      .select(MISSION_COLUMNS)
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, mission: (data as MissionRow | null) ?? null };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions] getMission failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

export async function getProviderName(providerId: string | null): Promise<string | null> {
  if (!providerId) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("providers").select("display_name").eq("id", providerId).maybeSingle();
    return (data as { display_name: string } | null)?.display_name ?? null;
  } catch {
    return null;
  }
}

export async function listEvents(missionId: string): Promise<EventRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("mission_events")
      .select("id, kind, from_status, to_status, actor_kind, reason, created_at")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return (data as EventRow[]) ?? [];
  } catch {
    return [];
  }
}

// ── Écriture ─────────────────────────────────────────────────

/** Un brouillon par établissement et par métier : on rouvre celui qui existe plutôt que d'en empiler. */
export async function createDraft(
  restaurantId: string,
  userId: string,
  metier: Metier
): Promise<{ ok: true; missionId: string } | { ok: false; reason: "unavailable" | "metier_not_open" }> {
  const tpl = await loadTemplate(metier);
  if (!tpl) return { ok: false, reason: "metier_not_open" };
  try {
    const admin = createAdminClient();
    const { data: existing, error: e1 } = await admin
      .from("missions")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("metier", metier)
      .eq("status", "brief")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;
    if (existing) return { ok: true, missionId: (existing as { id: string }).id };

    const { data, error } = await admin
      .from("missions")
      .insert({ restaurant_id: restaurantId, metier, template_id: tpl.id, requested_by: userId })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, missionId: (data as { id: string }).id };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions] createDraft failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

/** Sauvegarde automatique du brouillon : seulement tant que le brief n'est pas envoyé. */
export async function saveDraft(
  missionId: string,
  restaurantId: string,
  rawAnswers: unknown
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_a_draft" | "unavailable" }> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return found;
  const mission = found.mission;
  if (!mission) return { ok: false, reason: "not_found" };
  if (mission.status !== "brief") return { ok: false, reason: "not_a_draft" };
  const tpl = await loadTemplate(mission.metier);
  if (!tpl) return { ok: false, reason: "unavailable" };

  const merged = mergeAnswers(mission.brief ?? {}, sanitizeAnswers(rawAnswers, tpl.template));
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("missions")
      .update({ brief: merged, updated_at: new Date().toISOString() })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "brief") // un brief envoyé ne bouge plus
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0 ? { ok: true } : { ok: false, reason: "not_a_draft" };
  } catch (e) {
    console.error("[missions] saveDraft failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

export type SendResult =
  | { ok: true; providerId: string }
  | { ok: false; reason: "not_found" | "not_a_draft" | "invalid_brief" | "no_provider" | "unavailable"; issues?: BriefIssue[] };

/** Verrouille le brief et l'envoie au prestataire — ou refuse, en le disant et en le traçant. */
export async function sendBrief(missionId: string, restaurantId: string, userId: string, answersFromScreen?: unknown): Promise<SendResult> {
  // Les dernières réponses de l'écran passent avant la vérification : ce que le restaurateur voit est ce qui est jugé.
  if (answersFromScreen !== undefined) {
    const saved = await saveDraft(missionId, restaurantId, answersFromScreen);
    if (!saved.ok) return { ok: false, reason: saved.reason };
  }
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return { ok: false, reason: "unavailable" };
  const mission = found.mission;
  if (!mission) return { ok: false, reason: "not_found" };
  const tpl = await loadTemplate(mission.metier);
  if (!tpl) return { ok: false, reason: "unavailable" };

  let providers: ProviderCandidate[] = [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("providers").select("id, status, metiers, visibility_reduced, created_at").eq("status", "active");
    if (error) throw error;
    providers = (data as ProviderCandidate[]) ?? [];
  } catch (e) {
    console.error("[missions] sendBrief providers failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }

  const plan = planSend({ status: mission.status, metier: mission.metier, answers: mission.brief ?? {}, template: tpl.template, today: todayInBrussels(), providers });

  if (!plan.ok) {
    if (plan.reason !== "not_a_draft") {
      await logEvent(missionId, {
        kind: plan.reason === "invalid_brief" ? "brief_refused" : "no_provider",
        actorKind: "restaurant",
        actorId: userId,
        reason: plan.reason,
        meta: { issues: plan.issues.map((i) => `${i.key}:${i.code}`), metier: mission.metier },
      });
    }
    return { ok: false, reason: plan.reason, issues: plan.issues };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("missions")
      .update({ status: "envoye", provider_id: plan.providerId, brief_locked_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "brief") // deux clics : un seul envoi
      .select("id");
    if (error) throw error;
    if ((data?.length ?? 0) === 0) return { ok: false, reason: "not_a_draft" };
  } catch (e) {
    console.error("[missions] sendBrief update failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }

  await logEvent(missionId, { kind: "status", from: "brief", to: "envoye", actorKind: "restaurant", actorId: userId, meta: { providerId: plan.providerId } });
  return { ok: true, providerId: plan.providerId };
}
