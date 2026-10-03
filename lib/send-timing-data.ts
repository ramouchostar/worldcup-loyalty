import { createAdminClient } from "./supabase";
import { listLiveRestaurants } from "./demo";
import { brusselsClock, SEND_SLOTS, type Timing } from "./pro-sequence-rules";
import { MEMBER_SEQUENCE_KEYS } from "./sequence-rules";
import { clicksByHour, visitsByHour, type TimedSend } from "./send-timing";

// Données des heures d'envoi (ADR 0077 §4). SERVEUR UNIQUEMENT, fail-open :
// sans les tables, les envois tournent entre les créneaux et la page le dit.

/** Heure fixée pour les restaurateurs, ou null (rotation). */
export async function getTiming(): Promise<Timing> {
  try {
    const { data, error } = await createAdminClient().from("message_timing").select("slot").eq("audience", "restaurant").maybeSingle();
    if (error) return { lockedSlot: null };
    const slot = (data as { slot: number | null } | null)?.slot ?? null;
    return { lockedSlot: SEND_SLOTS.some((s) => s === slot) ? slot : null };
  } catch {
    return { lockedSlot: null };
  }
}

export async function setTiming(slot: number | null, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (slot !== null && !SEND_SLOTS.some((s) => s === slot)) return { ok: false, error: "Créneau inconnu." };
  const { error } = await createAdminClient()
    .from("message_timing")
    .upsert({ audience: "restaurant", slot, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "audience" });
  return error ? { ok: false, error: "Migration 20261003-2230 à appliquer." } : { ok: true };
}

/** Une ouverture de la console, comptée dans l'heure de Bruxelles. Best-effort. */
export async function recordConsoleVisit(restaurantId: string, now = new Date()): Promise<void> {
  try {
    const c = brusselsClock(now);
    const { error } = await createAdminClient().rpc("record_console_visit", {
      p_restaurant_id: restaurantId,
      p_day: c.day,
      p_hour: Math.floor(c.hhmm / 100),
    });
    if (error && !/record_console_visit|PGRST202|42883/.test(`${error.code} ${error.message}`)) {
      console.error("[console-visit]", error.message);
    }
  } catch {}
}

export type TimingOverview = {
  available: boolean; // tables de la PR C présentes
  slotColumn: boolean; // colonne send_slot présente (PR A)
  proSends: TimedSend[];
  memberClicksByHour: number[];
  memberClicks: number;
  visitsByHour: number[];
  visits: number;
  pushDevices: number | null;
  timing: Timing;
};

export async function loadTimingOverview(now = new Date()): Promise<TimingOverview> {
  const admin = createAdminClient();
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const ninety = new Date(now.getTime() - 90 * 86_400_000);
  const live = await listLiveRestaurants<{ id: string }>(admin, "id").catch(() => [] as { id: string }[]);
  const liveIds = live.map((r) => r.id);

  const [pro, member, visits, push, timing] = await Promise.all([
    admin
      .from("message_sends")
      .select("send_slot, channel, status, created_at, clicked_at")
      .eq("audience", "restaurant")
      .not("send_slot", "is", null)
      .gte("created_at", yearAgo)
      .limit(5000),
    admin
      .from("message_sends")
      .select("channel, status, created_at, clicked_at")
      .eq("audience", "member")
      .in("message_key", [...MEMBER_SEQUENCE_KEYS])
      .not("clicked_at", "is", null)
      .gte("created_at", ninety.toISOString())
      .limit(5000),
    liveIds.length
      ? admin.from("console_visits_hourly").select("hour, visits").in("restaurant_id", liveIds).gte("day", ninety.toISOString().slice(0, 10))
      : Promise.resolve({ data: [], error: null }),
    admin.from("console_push_subscriptions").select("id", { count: "exact", head: true }),
    getTiming(),
  ]);

  const proSends = ((pro.data ?? []) as { send_slot: number; channel: string; status: string; created_at: string; clicked_at: string | null }[]).map((r) => ({
    slot: r.send_slot,
    channel: r.channel,
    status: r.status,
    createdAt: r.created_at,
    clickedAt: r.clicked_at,
  }));
  const memberRows = ((member.data ?? []) as { channel: string; status: string; created_at: string; clicked_at: string | null }[]).map((r) => ({
    slot: null,
    channel: r.channel,
    status: r.status,
    createdAt: r.created_at,
    clickedAt: r.clicked_at,
  }));
  const byHour = visitsByHour((visits.data ?? []) as { hour: number; visits: number }[]);
  const memberByHour = clicksByHour(memberRows);

  return {
    available: !visits.error,
    slotColumn: !pro.error,
    proSends,
    memberClicksByHour: memberByHour,
    memberClicks: memberByHour.reduce((a, b) => a + b, 0),
    visitsByHour: byHour,
    visits: byHour.reduce((a, b) => a + b, 0),
    pushDevices: push.error ? null : push.count ?? 0,
    timing,
  };
}
