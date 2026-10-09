import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { loadTemplate, type MissionRow } from "./missions";
import { excludedFor, sanitizeQuote, validateQuote, REFUSAL_REASONS, type QuoteIssue } from "./mission-quote";
import type { BriefTemplate } from "./mission-brief";
import type { ProviderRow } from "./providers";
import type { MissionStatus } from "./mission-states";

// ============================================================
// Réserver un prestataire (ADR 0084, PR D) — ce que le prestataire lit et écrit.
//
// Chaque requête filtre sur `provider_id` : un prestataire ne voit et ne touche
// QUE ses missions, et jamais un brouillon (`brief`) de restaurateur. Les
// transitions sont des compare-and-swap sur l'état (un double clic ne chiffre
// pas deux fois) ; chaque passage et chaque refus laisse une ligne dans
// `mission_events`. FAIL-OPEN : tables absentes → « indisponible ».
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

export type ProviderMissionRow = MissionRow & { restaurant_name: string };

export type QuoteRow = {
  id: string;
  mission_id: string;
  price_cents: number;
  hours: number | null;
  delivery_days: number | null;
  included: string[];
  excluded: string[];
  hypotheses: string | null;
  status: "proposed" | "accepted" | "declined" | "superseded";
  created_at: string;
};

const QUOTE_COLUMNS = "id, mission_id, price_cents, hours, delivery_days, included, excluded, hypotheses, status, created_at";
const MISSION_COLUMNS =
  "id, restaurant_id, provider_id, metier, status, brief, brief_locked_at, shoot_date, quote_cents, cancelled_by, cancellation_note, created_at, updated_at, restaurants(name)";

function withName(row: unknown): ProviderMissionRow {
  const r = row as MissionRow & { restaurants: { name: string } | null };
  const { restaurants, ...mission } = r;
  return { ...mission, restaurant_name: restaurants?.name ?? "Un restaurateur" };
}

async function logEvent(
  missionId: string,
  e: { kind: string; from?: MissionStatus; to?: MissionStatus; actorKind: "restaurant" | "provider" | "platform" | "system"; actorId?: string; reason?: string; meta?: Record<string, unknown> }
): Promise<void> {
  try {
    const { error } = await createAdminClient().from("mission_events").insert({
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
    console.error("[provider-missions] logEvent failed:", (err as Error).message);
  }
}

// ── Lecture ──────────────────────────────────────────────────

export async function listForProvider(providerId: string): Promise<{ ok: true; missions: ProviderMissionRow[] } | typeof unavailable> {
  try {
    const { data, error } = await createAdminClient()
      .from("missions")
      .select(MISSION_COLUMNS)
      .eq("provider_id", providerId)
      .neq("status", "brief") // un brouillon appartient encore au restaurateur
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { ok: true, missions: (data ?? []).map(withName) };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[provider-missions] listForProvider failed:", (e as Error).message);
    return unavailable;
  }
}

export async function getForProvider(
  missionId: string,
  providerId: string
): Promise<{ ok: true; mission: ProviderMissionRow | null; template: BriefTemplate | null; quote: QuoteRow | null } | typeof unavailable> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("missions").select(MISSION_COLUMNS).eq("id", missionId).eq("provider_id", providerId).neq("status", "brief").maybeSingle();
    if (error) throw error;
    if (!data) return { ok: true, mission: null, template: null, quote: null };
    const mission = withName(data);
    const [tpl, { data: quote }] = await Promise.all([
      loadTemplate(mission.metier),
      admin.from("mission_quotes").select(QUOTE_COLUMNS).eq("mission_id", missionId).in("status", ["proposed", "accepted"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { ok: true, mission, template: tpl?.template ?? null, quote: (quote as QuoteRow | null) ?? null };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[provider-missions] getForProvider failed:", (e as Error).message);
    return unavailable;
  }
}

/** Le devis en cours d'une mission, pour le restaurateur (proposé ou accepté). */
export async function getCurrentQuote(missionId: string): Promise<QuoteRow | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("mission_quotes")
      .select(QUOTE_COLUMNS)
      .eq("mission_id", missionId)
      .in("status", ["proposed", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as QuoteRow | null) ?? null;
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[provider-missions] getCurrentQuote failed:", (e as Error).message);
    return null;
  }
}

// ── Écriture : le devis ──────────────────────────────────────

export type QuoteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_awaiting_quote" | "invalid_quote" | "unavailable"; issues?: QuoteIssue[] };

/** Le prestataire chiffre : devis ferme, `envoye → devis`, ou refus nommé. */
export async function submitQuote(missionId: string, provider: ProviderRow, rawQuote: unknown): Promise<QuoteResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return { ok: false, reason: "unavailable" };
  const mission = found.mission;
  if (!mission) return { ok: false, reason: "not_found" };
  if (mission.status !== "envoye") return { ok: false, reason: "not_awaiting_quote" };

  const quote = sanitizeQuote(rawQuote);
  const verdict = validateQuote(quote, mission.metier);
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "quote_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid_quote", meta: { issues: verdict.issues.map((i) => `${i.field}:${i.code}`) } });
    return { ok: false, reason: "invalid_quote", issues: verdict.issues };
  }

  try {
    const admin = createAdminClient();
    const { data: inserted, error } = await admin
      .from("mission_quotes")
      .insert({
        mission_id: missionId,
        price_cents: quote.priceCents,
        hours: quote.hours,
        delivery_days: quote.deliveryDays,
        included: quote.included,
        excluded: excludedFor(mission.metier, quote.included),
        hypotheses: quote.hypotheses || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    const quoteId = (inserted as { id: string }).id;

    const now = new Date().toISOString();
    const { data: moved, error: e2 } = await admin
      .from("missions")
      .update({ status: "devis", updated_at: now })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", "envoye") // deux clics : un seul devis
      .select("id");
    if (e2 || !moved || moved.length === 0) {
      // La mission a bougé entre la lecture et l'écriture : le devis orphelin n'existe pas.
      await admin.from("mission_quotes").delete().eq("id", quoteId);
      if (e2) throw e2;
      return { ok: false, reason: "not_awaiting_quote" };
    }
    await logEvent(missionId, {
      kind: "status",
      from: "envoye",
      to: "devis",
      actorKind: "provider",
      actorId: provider.user_id ?? undefined,
      meta: { quoteId, priceCents: quote.priceCents, hours: quote.hours, deliveryDays: quote.deliveryDays },
    });
    return { ok: true };
  } catch (e) {
    console.error("[provider-missions] submitQuote failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

// ── Écriture : le refus ──────────────────────────────────────

export type RefuseResult = { ok: true } | { ok: false; reason: "not_found" | "not_awaiting_quote" | "reason_missing" | "unavailable" };

/** Le prestataire refuse un brief : toujours avec une raison (jamais « sans raison » : le restaurateur la lit). */
export async function refuseBrief(missionId: string, provider: ProviderRow, rawReason: unknown, rawNote: unknown): Promise<RefuseResult> {
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!(REFUSAL_REASONS as readonly string[]).includes(reason)) return { ok: false, reason: "reason_missing" };
  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, 500) : "";

  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return { ok: false, reason: "unavailable" };
  if (!found.mission) return { ok: false, reason: "not_found" };
  if (found.mission.status !== "envoye") return { ok: false, reason: "not_awaiting_quote" };

  try {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("missions")
      .update({ status: "annule", cancelled_at: now, cancelled_by: "provider", cancellation_note: note ? `${reason} — ${note}` : reason, updated_at: now })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", "envoye")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_awaiting_quote" };
    await logEvent(missionId, { kind: "provider_refused", from: "envoye", to: "annule", actorKind: "provider", actorId: provider.user_id ?? undefined, reason, meta: note ? { note } : {} });
    return { ok: true };
  } catch (e) {
    console.error("[provider-missions] refuseBrief failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

// ── Écriture : le restaurateur décline le devis ──────────────

export type DeclineResult = { ok: true } | { ok: false; reason: "not_found" | "not_a_quote" | "unavailable" };

/** Le restaurateur décline le devis reçu : `devis → annule`, le devis passe « declined ». Rien n'a été payé. */
export async function declineQuote(missionId: string, restaurantId: string, userId: string): Promise<DeclineResult> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("missions")
      .update({ status: "annule", cancelled_at: now, cancelled_by: "restaurant", cancellation_note: "Devis décliné", updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "devis")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { data: exists } = await admin.from("missions").select("id").eq("id", missionId).eq("restaurant_id", restaurantId).maybeSingle();
      return { ok: false, reason: exists ? "not_a_quote" : "not_found" };
    }
    await admin.from("mission_quotes").update({ status: "declined" }).eq("mission_id", missionId).eq("status", "proposed");
    await logEvent(missionId, { kind: "quote_declined", from: "devis", to: "annule", actorKind: "restaurant", actorId: userId });
    return { ok: true };
  } catch (e) {
    console.error("[provider-missions] declineQuote failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}
