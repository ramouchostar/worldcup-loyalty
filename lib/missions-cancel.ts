import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { logEvent, getMission, restaurantMissionUrl, type MissionRow } from "./missions";
import { getForProvider } from "./provider-missions";
import { getRestaurantContactEmail } from "./missions-contact";
import { providerMissionUrl, type ProviderRow } from "./providers";
import { sendMissionUpdateEmail } from "./email";
import { DEFAULT_RESTAURANT_COPY_TO } from "./email-sender";
import { canTransition } from "./mission-states";
import { hasShoot } from "./mission-metier";
import { applySanction, canCancel, isMissedShoot, quoteCancellation, quotePlatformCancellation, sanitizeCancel, settlementOf, validateCancel, type CancelIssue, type CancelQuote, type Canceller, type Fault, type Settlement } from "./mission-cancel-rules";
import type { ProviderSanction } from "./mission-cancellation";
import type { MissionUpdateInput } from "./email-templates/mission-update";

// ============================================================
// Réserver un prestataire (ADR 0084 §4, PR I) — annuler une mission.
//
// Les règles (qui peut annuler, quelle bande du barème, quel montant, quelle sanction) vivent dans
// lib/mission-cancel-rules.ts et lib/mission-cancellation.ts (pures, testées) ; ce fichier les applique.
// `annule` est une écriture en compare-and-swap sur l'état : deux clics, ou deux parties qui annulent en même
// temps, n'écrivent qu'UNE annulation. Le résultat chiffré est gardé sur la mission (`cancellation`) : tant que
// Stripe n'est pas branché, c'est lui qui dit à la plateforme quoi rembourser, réclamer ou verser à la main.
// Chaque annulation, chaque sanction et chaque e-mail laisse sa ligne dans `mission_events` (ADR 0065).
// FAIL-OPEN : migration 20261013-1000 absente → « unavailable », jamais une annulation à moitié écrite.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

export type CancelRecord = {
  band: "free" | "half" | "full" | "deposit";
  by: "restaurant" | "provider" | "platform";
  fault: Fault | null;
  reason: string;
  note: string;
  hoursBefore: number | null;
  paidCents: number;
  depositCents: number;
  refundCents: number;
  retainedCents: number;
  providerPayoutCents: number;
  platformKeepsCents: number;
  sanction: ProviderSanction;
  settlement: Settlement;
  /** Une annulation qui est la décision d'un litige (remboursement ou partage) : l'écran de règlement le dit. */
  dispute?: { decision: "refund" | "split"; providerPct: number | null };
};

export type CancelResult =
  | { ok: true; band: "free" | "half" | "full" | "deposit"; sanction: ProviderSanction }
  | { ok: false; reason: "not_found" | "not_cancellable" | "invalid" | "already_cancelled" | "unavailable"; issue?: CancelIssue };

export type Actor = { kind: "restaurant"; userId: string } | { kind: "provider"; userId: string | undefined } | { kind: "platform"; userId: string };

/** L'écriture commune : jamais deux annulations, jamais une annulation sans sa trace chiffrée. */
export async function writeCancellation(mission: MissionRow, quote: CancelQuote & { sanction?: ProviderSanction }, actor: Actor, reason: string, note: string, fault: Fault | null, extra?: { record?: Partial<CancelRecord>; columns?: Record<string, unknown> }): Promise<"done" | "raced" | "unavailable"> {
  const admin = createAdminClient();
  const sanction = quote.sanction ?? (actor.kind === "provider" ? quote.outcome.providerSanction : "none");
  const deposit = mission.deposit_cents ?? 0;
  const settlement = settlementOf(quote.outcome.retainedCents, deposit);
  const record: CancelRecord = {
    band: quote.band,
    by: actor.kind,
    fault,
    reason,
    note,
    hoursBefore: quote.hoursBefore === null || !Number.isFinite(quote.hoursBefore) ? null : Math.round(quote.hoursBefore * 10) / 10,
    paidCents: mission.paid_cents ?? 0,
    depositCents: deposit,
    refundCents: quote.outcome.refundCents,
    retainedCents: quote.outcome.retainedCents,
    providerPayoutCents: quote.outcome.providerPayoutCents,
    platformKeepsCents: quote.outcome.platformKeepsCents,
    sanction,
    settlement,
    ...(extra?.record ?? {}),
  };
  const now = new Date().toISOString();
  try {
    const { data, error } = await admin
      .from("missions")
      .update({
        status: "annule",
        cancelled_at: now,
        cancelled_by: actor.kind,
        cancellation_note: note ? `${reason} — ${note}` : reason,
        cancellation: record,
        // Rien à régler (rien n'a été payé, rien n'est dû) : la ligne n'attend personne.
        cancellation_settled_at: settlement.direction === "none" ? now : null,
        updated_at: now,
        ...(extra?.columns ?? {}),
      })
      .eq("id", mission.id)
      .eq("status", mission.status) // deux clics, ou les deux parties en même temps : une seule annulation
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return "raced";
    await logEvent(mission.id, { kind: "status", from: mission.status, to: "annule", actorKind: actor.kind, actorId: actor.userId, reason, meta: { band: record.band, by: actor.kind, fault, sanction, retainedCents: record.retainedCents, refundCents: record.refundCents } });
    if (record.band !== "free") await logEvent(mission.id, { kind: "late_cancel", actorKind: actor.kind, actorId: actor.userId, reason: record.band, meta: { hoursBefore: record.hoursBefore, by: actor.kind, fault } });
    return "done";
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-cancel] writeCancellation failed:", (e as Error).message);
    return "unavailable";
  }
}

/** La sanction du prestataire, en compare-and-swap sur son état : deux annulations en même temps ne s'écrasent pas. */
export async function sanctionProvider(providerId: string | null, missionId: string, sanction: ProviderSanction, actor: Actor): Promise<void> {
  if (!providerId || sanction === "none") return;
  try {
    const admin = createAdminClient();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: cur } = await admin.from("providers").select("warnings, visibility_reduced, status").eq("id", providerId).maybeSingle();
      const c = cur as { warnings: number; visibility_reduced: boolean; status: string } | null;
      if (!c) throw new Error("prestataire introuvable");
      const next = applySanction(c, sanction);
      const { data: moved, error } = await admin
        .from("providers")
        .update({ warnings: next.warnings, visibility_reduced: next.visibility_reduced, status: next.status })
        .eq("id", providerId)
        .eq("warnings", c.warnings)
        .eq("visibility_reduced", c.visibility_reduced)
        .eq("status", c.status)
        .select("id");
      if (error) throw error;
      if (moved && moved.length > 0) {
        await logEvent(missionId, { kind: "provider_sanctioned", actorKind: actor.kind === "provider" ? "system" : actor.kind, actorId: actor.userId, reason: sanction, meta: { warnings: next.warnings, visibilityReduced: next.visibility_reduced, status: next.status } });
        return;
      }
    }
    throw new Error("sanction non écrite après trois essais");
  } catch (e) {
    // La sanction manquante est visible : la plateforme la voit dans la trace et la rejoue à la main.
    console.error("[missions-cancel] sanctionProvider failed:", (e as Error).message);
    await logEvent(missionId, { kind: "sanction_failed", actorKind: "system", reason: (e as Error).message, meta: { sanction } });
  }
}

/** L'autre partie apprend l'annulation ; la plateforme, quand elle n'est pas gratuite ou qu'il y a de l'argent en jeu. */
async function notifyCancelled(mission: MissionRow, record: { band: CancelRecord["band"]; settlement: Settlement }, cancelledBy: CancelRecord["by"], names: { restaurant: string; provider: string }): Promise<void> {
  const admin = createAdminClient();
  const base = { kind: "cancelled" as const, restaurantName: names.restaurant, providerName: names.provider, cancelledBy, band: record.band, studio: !hasShoot(mission.metier) };
  const jobs: { who: MissionUpdateInput["audience"]; skip: boolean; to: () => Promise<string | null>; url: string }[] = [
    { who: "restaurant", skip: cancelledBy === "restaurant", to: async () => getRestaurantContactEmail(mission.restaurant_id, (await admin.from("missions").select("requested_by").eq("id", mission.id).maybeSingle()).data?.requested_by ?? null), url: restaurantMissionUrl(mission.restaurant_id, mission.id) },
    { who: "provider", skip: cancelledBy === "provider" || !mission.provider_id, to: async () => ((await admin.from("providers").select("email").eq("id", mission.provider_id).maybeSingle()).data as { email: string } | null)?.email ?? null, url: providerMissionUrl(mission.id) },
    { who: "platform", skip: record.band === "free" && record.settlement.direction === "none", to: async () => (process.env.EMAIL_REPLY_TO || process.env.RESTAURANT_EMAIL_COPY_TO || DEFAULT_RESTAURANT_COPY_TO).trim(), url: restaurantMissionUrl(mission.restaurant_id, mission.id) },
  ];
  for (const j of jobs) {
    if (j.skip) continue;
    try {
      const to = await j.to();
      if (!to) throw new Error(`aucune adresse pour ${j.who}`);
      const sent = await sendMissionUpdateEmail(to, { ...base, audience: j.who, url: j.url }, mission.restaurant_id);
      await logEvent(mission.id, { kind: sent ? "notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "cancelled", who: j.who } });
    } catch (e) {
      console.error("[missions-cancel] notification échouée:", j.who, (e as Error).message);
      await logEvent(mission.id, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { about: "cancelled", who: j.who } });
    }
  }
}

async function names(mission: MissionRow): Promise<{ restaurant: string; provider: string }> {
  try {
    const admin = createAdminClient();
    const [{ data: r }, { data: p }] = await Promise.all([
      admin.from("restaurants").select("name").eq("id", mission.restaurant_id).maybeSingle(),
      mission.provider_id ? admin.from("providers").select("display_name").eq("id", mission.provider_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { restaurant: (r as { name: string } | null)?.name ?? "Un restaurateur", provider: (p as { display_name: string } | null)?.display_name ?? "Le prestataire" };
  } catch {
    return { restaurant: "Un restaurateur", provider: "Le prestataire" };
  }
}

// ── Annuler soi-même ─────────────────────────────────────────

/** Ce que coûterait l'annulation maintenant, pour l'écran (jamais une surprise après le clic). */
export function costNow(mission: MissionRow, by: Canceller, now: Date = new Date()): CancelQuote {
  return quoteCancellation({
    by,
    metier: mission.metier,
    depositCents: mission.deposit_cents ?? 0,
    status: mission.status,
    shootDate: mission.shoot_date,
    shootStart: mission.shoot_start,
    paidCents: mission.paid_cents ?? 0,
    providerCents: mission.provider_cents ?? 0,
    now,
  });
}

export async function cancelByRestaurant(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<CancelResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.status === "annule") return { ok: false, reason: "already_cancelled" };
  if (!canCancel("restaurant", m.status, m.metier)) return { ok: false, reason: "not_cancellable" };
  const input = sanitizeCancel(raw);
  const v = validateCancel("restaurant", input);
  if (!v.ok) return { ok: false, reason: "invalid", issue: v.issue };

  const quote = costNow(m, "restaurant");
  const written = await writeCancellation(m, quote, { kind: "restaurant", userId }, input.reason, input.note, null);
  if (written === "unavailable") return unavailable;
  if (written === "raced") return { ok: false, reason: "already_cancelled" };
  await notifyCancelled(m, { band: quote.band, settlement: settlementOf(quote.outcome.retainedCents, m.deposit_cents ?? 0) }, "restaurant", await names(m));
  return { ok: true, band: quote.band, sanction: "none" };
}

export async function cancelByProvider(missionId: string, provider: ProviderRow, raw: unknown): Promise<CancelResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.status === "annule") return { ok: false, reason: "already_cancelled" };
  if (!canCancel("provider", m.status, m.metier)) return { ok: false, reason: "not_cancellable" };
  const input = sanitizeCancel(raw);
  const v = validateCancel("provider", input);
  if (!v.ok) return { ok: false, reason: "invalid", issue: v.issue };

  const quote = costNow(m, "provider");
  const actor: Actor = { kind: "provider", userId: provider.user_id ?? undefined };
  const written = await writeCancellation(m, quote, actor, input.reason, input.note, null);
  if (written === "unavailable") return unavailable;
  if (written === "raced") return { ok: false, reason: "already_cancelled" };
  const sanction = quote.outcome.providerSanction;
  await sanctionProvider(m.provider_id, m.id, sanction, actor);
  await notifyCancelled(m, { band: quote.band, settlement: settlementOf(quote.outcome.retainedCents, m.deposit_cents ?? 0) }, "provider", await names(m));
  return { ok: true, band: quote.band, sanction };
}

// ── La plateforme arbitre ────────────────────────────────────

export async function cancelByPlatform(missionId: string, platformUserId: string, fault: Fault, rawReason: unknown, noShow: boolean): Promise<CancelResult> {
  if (!["restaurant", "provider", "none"].includes(fault)) return { ok: false, reason: "invalid" };
  const reason = typeof rawReason === "string" ? rawReason.trim().slice(0, 500) : "";
  if (reason.length < 5) return { ok: false, reason: "invalid", issue: "note_required" };
  try {
    const { data, error } = await createAdminClient().from("missions").select("*").eq("id", missionId).maybeSingle();
    if (error) throw error;
    const m = data as MissionRow | null;
    if (!m) return { ok: false, reason: "not_found" };
    if (m.status === "annule") return { ok: false, reason: "already_cancelled" };
    if (!canTransition(m.status, "annule", "platform").ok) return { ok: false, reason: "not_cancellable" };

    const quote = quotePlatformCancellation({
      fault,
      metier: m.metier,
      depositCents: m.deposit_cents ?? 0,
      status: m.status,
      shootDate: m.shoot_date,
      shootStart: m.shoot_start,
      paidCents: m.paid_cents ?? 0,
      providerCents: m.provider_cents ?? 0,
      now: new Date(),
      noShow: noShow && fault !== "none",
    });
    const actor: Actor = { kind: "platform", userId: platformUserId };
    const written = await writeCancellation(m, quote, actor, "Décidé par la plateforme", reason, fault);
    if (written === "unavailable") return unavailable;
    if (written === "raced") return { ok: false, reason: "already_cancelled" };
    await sanctionProvider(m.provider_id, m.id, quote.sanction, actor);
    await notifyCancelled(m, { band: quote.band, settlement: settlementOf(quote.outcome.retainedCents, m.deposit_cents ?? 0) }, "platform", await names(m));
    return { ok: true, band: quote.band, sanction: quote.sanction };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-cancel] cancelByPlatform failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Ce que la plateforme règle à la main ─────────────────────

export type ToSettle = { id: string; restaurant_name: string; provider_name: string; cancelled_at: string; record: CancelRecord };

export async function listToSettle(): Promise<ToSettle[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, cancelled_at, cancellation, restaurants(name), providers(display_name)")
      .eq("status", "annule")
      .not("cancellation", "is", null)
      .is("cancellation_settled_at", null)
      .order("cancelled_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as unknown as { id: string; cancelled_at: string; cancellation: CancelRecord; restaurants: { name: string } | null; providers: { display_name: string } | null }[]).map((r) => ({
      id: r.id,
      restaurant_name: r.restaurants?.name ?? "Restaurant",
      provider_name: r.providers?.display_name ?? "Prestataire",
      cancelled_at: r.cancelled_at,
      record: r.cancellation,
    }));
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-cancel] listToSettle failed:", (e as Error).message);
    return [];
  }
}

export async function settleCancellation(missionId: string, platformUserId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient().from("missions").update({ cancellation_settled_at: now }).eq("id", missionId).eq("status", "annule").is("cancellation_settled_at", null).select("id");
    if (error) throw error;
    if (!data || data.length === 0) return false;
    await logEvent(missionId, { kind: "cancellation_settled", actorKind: "platform", actorId: platformUserId });
    return true;
  } catch (e) {
    console.error("[missions-cancel] settleCancellation failed:", (e as Error).message);
    return false;
  }
}

export type MissedShoot = { id: string; restaurant_name: string; provider_name: string; shoot_date: string; shoot_start: string | null };

/** Les tournages dont le jour est passé sans que le prestataire ait démarré : la plateforme tranche (absence ou force majeure). */
export async function listMissedShoots(): Promise<MissedShoot[]> {
  try {
    const today = todayInBrussels();
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, status, shoot_date, shoot_start, restaurants(name), providers(display_name)")
      .eq("status", "date_bloquee")
      .lt("shoot_date", today)
      .order("shoot_date", { ascending: true })
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as unknown as { id: string; status: string; shoot_date: string; shoot_start: string | null; restaurants: { name: string } | null; providers: { display_name: string } | null }[])
      .filter((r) => isMissedShoot(r.status, r.shoot_date, today))
      .map((r) => ({ id: r.id, restaurant_name: r.restaurants?.name ?? "Restaurant", provider_name: r.providers?.display_name ?? "Prestataire", shoot_date: r.shoot_date, shoot_start: r.shoot_start }));
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-cancel] listMissedShoots failed:", (e as Error).message);
    return [];
  }
}
