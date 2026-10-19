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
import { hasShoot } from "./mission-metier";
import { listProofs } from "./missions-bat-state";
import { canDeliverPrint, validatePrintDelivery } from "./mission-print";
import { mailMission } from "./missions-notify";
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
import { judgeRetouchRound, nextDeliveryRound, retouchState, sanitizeNotes, type RetouchIssue, type RetouchNote } from "./mission-retouch";
import type { MissionUpdateInput } from "./email-templates/mission-update";
import { linkFiles } from "./missions-files-link";
import { MAX_UNLINKED, sanitizeIds } from "./mission-files";

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

async function notifyRestaurant(missionId: string, restaurantId: string, kind: MissionUpdateInput["kind"], providerName: string, restaurantName: string, extra: Pick<MissionUpdateInput, "print"> = {}): Promise<void> {
  try {
    const { data } = await createAdminClient().from("missions").select("requested_by").eq("id", missionId).maybeSingle();
    const to = await getRestaurantContactEmail(restaurantId, (data as { requested_by: string | null } | null)?.requested_by ?? null);
    if (!to) throw new Error("aucune adresse de restaurateur");
    const sent = await sendMissionUpdateEmail(to, { kind, audience: "restaurant", restaurantName, providerName, url: restaurantMissionUrl(restaurantId, missionId), ...extra }, restaurantId);
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
  if (!hasShoot(m.metier)) return startWork(m, provider);
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

/**
 * Un métier d'atelier (design, impression) : pas de date ni d'arrivée. Le prestataire touche « Je commence » quand il
 * commence : `accepte → production`. C'est ce geste qui sépare « annulation gratuite » et « l'acompte reste au prestataire ».
 */
async function startWork(m: { id: string; status: string; metier: string }, provider: ProviderRow): Promise<StartResult> {
  if (m.status !== "accepte" || !canTransition("accepte", "production", "provider").ok) return { ok: false, reason: "not_booked" };
  try {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("missions")
      .update({ status: "production", started_at: now, updated_at: now })
      .eq("id", m.id)
      .eq("provider_id", provider.id)
      .eq("status", "accepte") // deux clics : un seul démarrage
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_booked" };
    await logEvent(m.id, { kind: "status", from: "accepte", to: "production", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "work_started" });
    await mailMission(m.id, "restaurant", "work_started");
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] startWork failed:", (e as Error).message);
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

export type DeliverResult = { ok: true; round: number } | { ok: false; reason: "not_found" | "no_report" | "no_bat" | "not_awaiting_delivery" | "invalid" | "unavailable"; issues?: DeliveryIssue[] };

/**
 * Le prestataire livre (liens https) : `production → livre` (version 1, après le compte-rendu : c'est la pièce,
 * jamais « on verra ») ou `retouche → livre` (version 2 ou 3, après un tour de retours). Chaque livraison
 * remet à zéro le délai de validation automatique.
 */
export async function submitDelivery(missionId: string, provider: ProviderRow, raw: unknown): Promise<DeliverResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const next = nextDeliveryRound(m.status, m.retouch_rounds_used);
  if (!next.ok || !canTransition(m.status, "livre", "provider").ok) return { ok: false, reason: "not_awaiting_delivery" };
  // Le compte-rendu du tournage n'existe que pour un métier de tournage ; un visuel se livre directement.
  if (next.round === 1 && hasShoot(m.metier) && !m.report_submitted_at) return { ok: false, reason: "no_report" };

  // Une impression se livre APRÈS la signature du bon à tirer, et c'est un objet : un mot qui dit où et quand suffit.
  const print = m.metier === "impression";
  if (print) {
    const proofs = await listProofs(missionId);
    if (!proofs.ok) return unavailable;
    if (!canDeliverPrint(m.status, proofs.proofs)) return { ok: false, reason: "no_bat" };
  }
  const input = sanitizeDelivery(raw);
  const verdict = print ? validatePrintDelivery(input) : validateDelivery(input);
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "delivery_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid", meta: { round: next.round, issues: verdict.issues.map((i) => `${i.code}${i.index === undefined ? "" : `@${i.index}`}`) } });
    return { ok: false, reason: "invalid", issues: verdict.issues };
  }

  const from = m.status;
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: moved, error } = await admin
      .from("missions")
      .update({ status: "livre", delivered_at: now, reminders_sent: 0, updated_at: now })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", from) // deux clics : une seule livraison
      .eq("retouch_rounds_used", m.retouch_rounds_used)
      .select("id");
    if (error) throw error;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_awaiting_delivery" };

    const { error: e2 } = await admin.from("mission_deliveries").insert({ mission_id: missionId, round: next.round, links: input.links, message: input.message || null });
    if (e2) {
      // La livraison n'a pas pu s'écrire : on remet la mission où elle était, jamais « livré » sans liens.
      await admin.from("missions").update({ status: from, delivered_at: m.delivered_at }).eq("id", missionId).eq("status", "livre");
      throw e2;
    }
    await logEvent(missionId, { kind: "status", from, to: "livre", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { round: next.round, links: input.links.length } });
    await notifyRestaurant(missionId, m.restaurant_id, "delivered", provider.display_name, m.restaurant_name, { print: m.metier === "impression" });
    return { ok: true, round: next.round };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] submitDelivery failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Les deux tours de retours ────────────────────────────────

export type RetouchRow = { round: number; notes: RetouchNote[]; created_at: string };

export async function listRetouches(missionId: string): Promise<RetouchRow[]> {
  try {
    const { data, error } = await createAdminClient().from("mission_retouches").select("round, notes, created_at").eq("mission_id", missionId).order("round", { ascending: true });
    if (error) throw error;
    return (data as RetouchRow[]) ?? [];
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] listRetouches failed:", (e as Error).message);
    return [];
  }
}

export type RetouchResult =
  | { ok: true; round: number; left: number }
  | { ok: false; reason: "not_found" | "not_delivered" | "no_rounds_left" | "invalid" | "unavailable"; problems?: RetouchIssue[]; empty?: boolean };

/**
 * Le restaurateur demande un tour de retours : TOUTES ses remarques en un seul envoi, chacune classée et
 * motivée. `livre → retouche`, le compteur de tours avance dans la même écriture (compare-and-swap sur sa
 * valeur : deux clics ne consomment pas deux tours). Le prestataire en est prévenu.
 */
export async function requestRetouch(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<RetouchResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const state = retouchState(m.status, m.retouch_rounds_used, m.metier);
  if (!state.can) return { ok: false, reason: state.reason === "no_rounds_left" ? "no_rounds_left" : "not_delivered" };
  if (!canTransition("livre", "retouche", "restaurant", { roundsUsed: m.retouch_rounds_used }).ok) return { ok: false, reason: "no_rounds_left" };

  const verdict = judgeRetouchRound(sanitizeNotes(raw), m.metier);
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "retouch_refused", actorKind: "restaurant", actorId: userId, reason: verdict.reason, meta: { round: state.round, problems: verdict.problems.map((p) => `${p.index}:${p.issue}`) } });
    return { ok: false, reason: "invalid", problems: verdict.problems, empty: verdict.reason === "empty" };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: moved, error } = await admin
      .from("missions")
      .update({ status: "retouche", retouch_rounds_used: m.retouch_rounds_used + 1, updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "livre")
      .eq("retouch_rounds_used", m.retouch_rounds_used) // deux clics : un seul tour consommé
      .select("id");
    if (error) throw error;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_delivered" };

    const { error: e2 } = await admin.from("mission_retouches").insert({ mission_id: missionId, round: state.round, notes: verdict.notes, created_by: userId });
    if (e2) {
      // Les remarques n'ont pas pu s'écrire : le tour n'est PAS consommé.
      await admin.from("missions").update({ status: "livre", retouch_rounds_used: m.retouch_rounds_used }).eq("id", missionId).eq("status", "retouche");
      throw e2;
    }
    const attachmentIds = sanitizeIds((raw as { attachmentIds?: unknown } | null)?.attachmentIds, MAX_UNLINKED.retouch);
    const linked = await linkFiles(missionId, "retouch", "restaurant", attachmentIds, `round-${state.round}`);
    await logEvent(missionId, { kind: "status", from: "livre", to: "retouche", actorKind: "restaurant", actorId: userId, meta: { round: state.round, notes: verdict.notes.length, files: linked } });
    await notifyProviderRetouch(missionId, m.provider_id, restaurantId, state.round);
    return { ok: true, round: state.round, left: state.left - 1 };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dayof] requestRetouch failed:", (e as Error).message);
    return unavailable;
  }
}

async function notifyProviderRetouch(missionId: string, providerId: string | null, restaurantId: string, round: 1 | 2): Promise<void> {
  try {
    if (!providerId) throw new Error("mission sans prestataire");
    const admin = createAdminClient();
    const [{ data: p }, { data: r }] = await Promise.all([
      admin.from("providers").select("email, display_name").eq("id", providerId).maybeSingle(),
      admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
    ]);
    const provider = p as { email: string; display_name: string } | null;
    if (!provider) throw new Error("prestataire introuvable");
    const sent = await sendMissionUpdateEmail(provider.email, { kind: "retouch_requested", audience: "provider", round, restaurantName: (r as { name: string } | null)?.name ?? "Un restaurateur", providerName: provider.display_name, url: providerMissionUrl(missionId) }, restaurantId);
    await logEvent(missionId, { kind: sent ? "provider_notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "retouch_requested", round } });
  } catch (e) {
    console.error("[missions-dayof] notifyProviderRetouch failed:", (e as Error).message);
    await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { channel: "email", about: "retouch_requested" } });
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
