import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { logEvent, getMission, restaurantMissionUrl } from "./missions";
import { getForProvider } from "./provider-missions";
import { getRestaurantContactEmail } from "./missions-contact";
import { providerMissionUrl, type ProviderRow } from "./providers";
import { sendMissionUpdateEmail } from "./email";
import { DEFAULT_RESTAURANT_COPY_TO } from "./email-sender";
import { canTransition } from "./mission-states";
import {
  judgeStart,
  overrun,
  sanitizeDelivery,
  sanitizeReport,
  validateContest,
  validateDelivery,
  validateReport,
  type DeliveryIssue,
  type ReportIssue,
} from "./mission-dayof";
import type { MissionUpdateInput } from "./email-templates/mission-update";

// ============================================================
// Réserver un prestataire (ADR 0084 §5, PR G) — le jour J : démarrer, compte-rendu, livraison, validation.
//
// Les règles vivent dans lib/mission-dayof.ts (pures, testées) et dans la table des états ; ce
// fichier les applique à Supabase. Chaque passage est un compare-and-swap sur l'état (un double
// clic ne livre pas deux fois) et laisse sa ligne dans `mission_events` ; chaque e-mail a son issue
// tracée. FAIL-OPEN : migration 20261012-1200 absente → « unavailable », rien n'est écrit à moitié.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

async function quotedHours(missionId: string): Promise<number | null> {
  const { data } = await createAdminClient().from("mission_quotes").select("hours").eq("mission_id", missionId).eq("status", "accepted").maybeSingle();
  const h = (data as { hours: number | null } | null)?.hours;
  return typeof h === "number" ? h : null;
}

async function notifyRestaurant(missionId: string, restaurantId: string, kind: MissionUpdateInput["kind"], providerName: string, restaurantName: string): Promise<void> {
  try {
    const { data } = await createAdminClient().from("missions").select("requested_by").eq("id", missionId).maybeSingle();
    const to = await getRestaurantContactEmail(restaurantId, (data as { requested_by: string | null } | null)?.requested_by ?? null);
    if (!to) throw new Error("aucune adresse de restaurateur");
    const sent = await sendMissionUpdateEmail(to, { kind, audience: "restaurant", restaurantName, providerName, url: restaurantMissionUrl(restaurantId, missionId) }, restaurantId);
    await logEvent(missionId, { kind: sent ? "restaurant_notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: kind } });
  } catch (e) {
    console.error("[missions-dayof] notifyRestaurant failed:", (e as Error).message);
    await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { channel: "email", about: kind } });
  }
}

// ── Démarrer ─────────────────────────────────────────────────

export type StartResult = { ok: true } | { ok: false; reason: "not_found" | "too_early" | "not_booked" | "unavailable" };

/** « Je suis arrivé » : `date_bloquee → production`, à partir du jour du tournage. */
export async function startShoot(missionId: string, provider: ProviderRow): Promise<StartResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const verdict = judgeStart(m.status, m.shoot_date, todayInBrussels());
  if (verdict !== "ok" || !canTransition(m.status, "production", "provider").ok) return { ok: false, reason: verdict === "too_early" ? "too_early" : "not_booked" };

  try {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("missions")
      .update({ status: "production", started_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", "date_bloquee") // deux clics : un seul démarrage
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_booked" };
    await logEvent(missionId, { kind: "status", from: "date_bloquee", to: "production", actorKind: "provider", actorId: provider.user_id ?? undefined });
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] startShoot failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Compte-rendu ─────────────────────────────────────────────

export type ReportResult = { ok: true } | { ok: false; reason: "not_found" | "not_started" | "locked" | "invalid" | "unavailable"; issues?: ReportIssue[] };

/** Le compte-rendu du prestataire : modifiable tant que le restaurateur ne l'a ni confirmé ni contesté. */
export async function submitReport(missionId: string, provider: ProviderRow, raw: unknown): Promise<ReportResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.status !== "production") return { ok: false, reason: "not_started" };
  if (m.report_confirmed_at || m.report_contested_at) return { ok: false, reason: "locked" };

  const input = sanitizeReport(raw);
  const verdict = validateReport(input);
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "report_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid", meta: { issues: verdict.issues.map((i) => `${i.field}:${i.code}`) } });
    return { ok: false, reason: "invalid", issues: verdict.issues };
  }

  try {
    const hours = await quotedHours(missionId);
    const over = overrun(verdict.durationMinutes, hours);
    const now = new Date().toISOString();
    const report = { arrival: input.arrival, end: input.end, missing: input.missing, note: input.note, durationMinutes: verdict.durationMinutes, quotedHours: hours, overrunMinutes: over.extraMinutes };
    const { data, error } = await createAdminClient()
      .from("missions")
      .update({ report, report_submitted_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", "production")
      .is("report_confirmed_at", null)
      .is("report_contested_at", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "locked" };
    await logEvent(missionId, { kind: "report_submitted", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { durationMinutes: verdict.durationMinutes, missing: input.missing, overrunMinutes: over.extraMinutes } });
    if (!m.report_submitted_at) await notifyRestaurant(missionId, m.restaurant_id, "report_submitted", provider.display_name, m.restaurant_name);
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] submitReport failed:", (e as Error).message);
    return unavailable;
  }
}

export type RespondResult = { ok: true; contested: boolean } | { ok: false; reason: "not_found" | "no_report" | "already_answered" | "invalid_contest" | "unavailable" };

/** Le restaurateur confirme le compte-rendu (la pièce de référence) ou le conteste, avec une raison. */
export async function respondToReport(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<RespondResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (!m.report_submitted_at) return { ok: false, reason: "no_report" };
  if (m.report_confirmed_at || m.report_contested_at) return { ok: false, reason: "already_answered" };

  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const contest = o.contest === true;
  const note = typeof o.note === "string" ? o.note.trim().slice(0, 1_001) : "";
  const verdict = validateContest({ contest, note });
  if (!verdict.ok) return { ok: false, reason: "invalid_contest" };

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const patch = contest ? { report_contested_at: now, report_contest_note: note, updated_at: now } : { report_confirmed_at: now, updated_at: now };
    const { data, error } = await admin
      .from("missions")
      .update(patch)
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .not("report_submitted_at", "is", null)
      .is("report_confirmed_at", null)
      .is("report_contested_at", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "already_answered" };
    await logEvent(missionId, { kind: contest ? "report_contested" : "report_confirmed", actorKind: "restaurant", actorId: userId, meta: contest ? { note } : {} });
    if (contest) await alertPlatformContested(missionId, restaurantId);
    return { ok: true, contested: contest };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] respondToReport failed:", (e as Error).message);
    return unavailable;
  }
}

/** Un compte-rendu contesté est un litige qui commence : la plateforme est prévenue tout de suite. */
async function alertPlatformContested(missionId: string, restaurantId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: r }, { data: m }] = await Promise.all([
      admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
      admin.from("missions").select("providers(display_name)").eq("id", missionId).maybeSingle(),
    ]);
    const to = (process.env.EMAIL_REPLY_TO || process.env.RESTAURANT_EMAIL_COPY_TO || DEFAULT_RESTAURANT_COPY_TO).trim();
    const sent = await sendMissionUpdateEmail(
      to,
      { kind: "report_contested", audience: "platform", restaurantName: (r as { name: string } | null)?.name ?? restaurantId, providerName: (m as { providers?: { display_name?: string } | null } | null)?.providers?.display_name ?? "le prestataire", url: restaurantMissionUrl(restaurantId, missionId) },
      restaurantId
    );
    await logEvent(missionId, { kind: sent ? "platform_alerted" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "report_contested" } });
  } catch (e) {
    console.error("[missions-dayof] alertPlatformContested failed:", (e as Error).message);
    await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { channel: "email", about: "report_contested" } });
  }
}

// ── Livraison ────────────────────────────────────────────────

export type DeliveryRow = { id: string; round: number; links: string[]; message: string | null; created_at: string };

export async function listDeliveries(missionId: string): Promise<DeliveryRow[]> {
  try {
    const { data, error } = await createAdminClient().from("mission_deliveries").select("id, round, links, message, created_at").eq("mission_id", missionId).order("round", { ascending: true });
    if (error) throw error;
    return (data as DeliveryRow[]) ?? [];
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] listDeliveries failed:", (e as Error).message);
    return [];
  }
}

export type DeliverResult = { ok: true } | { ok: false; reason: "not_found" | "no_report" | "not_in_production" | "invalid" | "unavailable"; issues?: DeliveryIssue[] };

/** Le prestataire livre (liens https) : `production → livre`. Il faut un compte-rendu : c'est la pièce, jamais « on verra ». */
export async function submitDelivery(missionId: string, provider: ProviderRow, raw: unknown): Promise<DeliverResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.status !== "production" || !canTransition("production", "livre", "provider").ok) return { ok: false, reason: "not_in_production" };
  if (!m.report_submitted_at) return { ok: false, reason: "no_report" };

  const input = sanitizeDelivery(raw);
  const verdict = validateDelivery(input);
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "delivery_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid", meta: { issues: verdict.issues.map((i) => `${i.code}${i.index === undefined ? "" : `@${i.index}`}`) } });
    return { ok: false, reason: "invalid", issues: verdict.issues };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: moved, error } = await admin
      .from("missions")
      .update({ status: "livre", delivered_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", "production") // deux clics : une seule livraison
      .select("id");
    if (error) throw error;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_in_production" };

    const { error: e2 } = await admin.from("mission_deliveries").insert({ mission_id: missionId, round: 1, links: input.links, message: input.message || null });
    if (e2) {
      // La livraison n'a pas pu s'écrire : on remet la mission en production, jamais « livré » sans liens.
      await admin.from("missions").update({ status: "production", delivered_at: null }).eq("id", missionId).eq("status", "livre");
      throw e2;
    }
    await logEvent(missionId, { kind: "status", from: "production", to: "livre", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { links: input.links.length } });
    await notifyRestaurant(missionId, m.restaurant_id, "delivered", provider.display_name, m.restaurant_name);
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] submitDelivery failed:", (e as Error).message);
    return unavailable;
  }
}

export type ValidateResult = { ok: true } | { ok: false; reason: "not_found" | "not_delivered" | "unavailable" };

/** Le restaurateur valide la livraison : `livre → valide`. */
export async function validateDeliveryByRestaurant(missionId: string, restaurantId: string, userId: string): Promise<ValidateResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.status !== "livre" || !canTransition("livre", "valide", "restaurant").ok) return { ok: false, reason: "not_delivered" };

  try {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("missions")
      .update({ status: "valide", validated_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "livre") // deux clics : une seule validation
      .select("id, provider_id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_delivered" };
    await logEvent(missionId, { kind: "status", from: "livre", to: "valide", actorKind: "restaurant", actorId: userId });
    await notifyProviderValidated(missionId, m.provider_id, restaurantId);
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] validateDelivery failed:", (e as Error).message);
    return unavailable;
  }
}

async function notifyProviderValidated(missionId: string, providerId: string | null, restaurantId: string): Promise<void> {
  try {
    if (!providerId) throw new Error("mission sans prestataire");
    const admin = createAdminClient();
    const [{ data: p }, { data: r }] = await Promise.all([
      admin.from("providers").select("email, display_name").eq("id", providerId).maybeSingle(),
      admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
    ]);
    const provider = p as { email: string; display_name: string } | null;
    if (!provider) throw new Error("prestataire introuvable");
    const sent = await sendMissionUpdateEmail(provider.email, { kind: "validated", audience: "provider", restaurantName: (r as { name: string } | null)?.name ?? "Un restaurateur", providerName: provider.display_name, url: providerMissionUrl(missionId) }, restaurantId);
    await logEvent(missionId, { kind: sent ? "provider_notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "validated" } });
  } catch (e) {
    console.error("[missions-dayof] notifyProviderValidated failed:", (e as Error).message);
    await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { channel: "email", about: "validated" } });
  }
}
