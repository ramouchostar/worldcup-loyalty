import { randomUUID } from "node:crypto";
import { createAdminClient } from "./supabase";
import { listLiveRestaurants } from "./demo";
import { dispatch } from "./email";
import { hasSendSlotColumn, listMessageSettings, listOptOuts } from "./message-log";
import { getRestaurantBranding, logoPublicUrl } from "./restaurant";
import { getStaffMonthStats, getStaffStats, type StaffMonthStats } from "./staff-codes";
import { staffToNudge } from "./staff-status";
import { decideProSequence, PRO_SEQUENCE_KEYS, type ProDecision, type ProRecipientState, type Timing } from "./pro-sequence-rules";
import type { HistoryRow } from "./sequence-rules";
import { APP_URL, appLink, type RenderedEmail, type ShortMessage } from "./email-templates/kit";
import { staffSetupEmail, staffSetupShort } from "./email-templates/pro-staff-setup";
import { staffMonthlyEmail, staffMonthlyShort } from "./email-templates/pro-staff-monthly";

// Moteur des séquences RESTAURATEUR (ADR 0077). Lu toutes les 30 minutes par
// /api/cron/pro-sequences. Il charge les faits d'un établissement, laisse
// `decideProSequence` (pur, testé) choisir la séquence ET l'heure, puis
// envoie. SERVEUR UNIQUEMENT.
//
// Ce qu'il ne fait jamais :
//   - écrire à un établissement où la séquence n'est pas allumée, ni à un
//     compte démo (seuls les établissements réels sont lus) ;
//   - écrire à quelqu'un dont il ne peut pas lire les « stop » (fail-closed) ;
//   - partir sans la colonne `send_slot` : sans journal fiable, la même étape
//     repartirait à chaque passage.

const HISTORY_DAYS = 400; // la rotation des créneaux compte tous les envois de la personne
const RECIPIENT_ROLES = new Set(["gerant", "manager"]); // ADR 0077 §1 : pas le siège « équipe »

export type ProRunReport = {
  restaurants: number;
  evaluated: number;
  sent: number;
  failed: number;
  pushes: number;
  skipped: string | null;
};

type Recipient = { userId: string; email: string };

async function loadRecipients(restaurantId: string, ownerId: string | null): Promise<Recipient[]> {
  const admin = createAdminClient();
  const { data: seats } = await admin.from("restaurant_admins").select("user_id, role").eq("restaurant_id", restaurantId);
  const ids = new Set<string>();
  if (ownerId) ids.add(ownerId);
  for (const s of (seats ?? []) as { user_id: string; role: string }[]) if (RECIPIENT_ROLES.has(s.role)) ids.add(s.user_id);
  if (ids.size === 0) return [];
  const { data: profiles } = await admin.from("profiles").select("id, email, anonymized_at").in("id", [...ids]);
  return ((profiles ?? []) as { id: string; email: string | null; anonymized_at: string | null }[])
    .filter((p) => p.email && !p.anonymized_at)
    .map((p) => ({ userId: p.id, email: p.email! }));
}

async function countActiveCodes(restaurantId: string): Promise<number | null> {
  const { count, error } = await createAdminClient()
    .from("staff_codes")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  return error ? null : count ?? 0;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function monthLabel(yyyymm: number): string {
  return `${MONTHS[(yyyymm % 100) - 1]} ${Math.floor(yyyymm / 100)}`;
}

type Ctx = { restaurantId: string; restaurantName: string; logoUrl: string | null; now: Date; month?: Promise<StaffMonthStats | null>; nudge?: Promise<string[]> };

// Le gabarit d'une décision, rempli avec les vraies données. null quand il
// n'y a rien d'honnête à dire (chiffres du mois illisibles) : on n'envoie pas.
export async function renderProDecision(
  decision: ProDecision,
  ctx: Ctx,
  stopUrl: string
): Promise<{ email: RenderedEmail; short: ShortMessage } | null> {
  const base = {
    restaurantName: ctx.restaurantName,
    restaurantId: ctx.restaurantId,
    logoUrl: ctx.logoUrl,
    link: appLink,
    manageUrl: appLink(`/admin/${ctx.restaurantId}/settings#emails`),
    stopUrl,
  };
  if (decision.key === "staff_setup") {
    const step = Math.min(3, Math.max(1, decision.step)) as 1 | 2 | 3;
    return { email: staffSetupEmail({ ...base, step }), short: staffSetupShort({ restaurantId: ctx.restaurantId, step, link: appLink }) };
  }

  ctx.month ??= getStaffMonthStats(ctx.restaurantId, decision.step);
  ctx.nudge ??= getStaffStats(ctx.restaurantId).then((s) => (s ? staffToNudge(s, ctx.now).map((x) => x.label) : []));
  const [month, nudge] = await Promise.all([ctx.month, ctx.nudge]);
  if (!month) return null;
  const ranked = month.rows.filter((r) => r.signups > 0).sort((a, b) => b.signups - a.signups).slice(0, 3);
  const top = ranked[0]?.signups ?? 1;
  const data = {
    ...base,
    monthLabel: monthLabel(decision.step),
    landings: month.landings,
    signups: month.signups,
    signupsPrev: month.signupsPrev,
    withTicket: month.withTicket,
    activeCodes: month.rows.filter((r) => r.isActive).length,
    podium: ranked.map((r) => ({
      label: r.label,
      hint: r.withTicket > 0 ? `${r.withTicket} ${r.withTicket > 1 ? "ont" : "a"} déjà envoyé un ticket` : undefined,
      value: `${r.signups} inscr.`,
      ratio: r.signups / top,
    })),
    best: ranked[0]?.label ?? null,
    nudge,
  };
  return { email: staffMonthlyEmail(data), short: staffMonthlyShort(data) };
}

export async function runProSequences(now = new Date(), timing: Timing = { lockedSlot: null }): Promise<ProRunReport> {
  const report: ProRunReport = { restaurants: 0, evaluated: 0, sent: 0, failed: 0, pushes: 0, skipped: null };
  if (!process.env.RESEND_API_KEY) return { ...report, skipped: "RESEND_API_KEY absente : aucune séquence ne part." };

  const { settings, available } = await listMessageSettings();
  if (!available) return { ...report, skipped: "Journal des messages absent (migration 20260921-1615)." };

  const proKeys = new Set<string>(PRO_SEQUENCE_KEYS);
  const enabledBy = new Map<string, Set<string>>();
  for (const s of settings) {
    if (!s.enabled || !proKeys.has(s.message_key)) continue;
    const set = enabledBy.get(s.restaurant_id) ?? new Set<string>();
    set.add(s.message_key);
    enabledBy.set(s.restaurant_id, set);
  }
  if (enabledBy.size === 0) return { ...report, skipped: "Aucune séquence restaurateur allumée." };
  if (!(await hasSendSlotColumn())) return { ...report, skipped: "Colonne send_slot absente (migration 20261003-2010)." };

  const admin = createAdminClient();
  const live = await listLiveRestaurants<{ id: string; name: string; owner_id: string | null; activated_at: string | null }>(
    admin,
    "id, name, owner_id, activated_at"
  );
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();

  for (const r of live) {
    const enabled = enabledBy.get(r.id);
    if (!enabled) continue;
    report.restaurants += 1;

    const recipients = await loadRecipients(r.id, r.owner_id);
    if (recipients.length === 0) continue;
    const userIds = recipients.map((x) => x.userId);
    const [optOuts, activeCodes, { data: historyRows, error: historyError }] = await Promise.all([
      listOptOuts(userIds),
      countActiveCodes(r.id),
      admin
        .from("message_sends")
        .select("user_id, message_key, step, status, channel, created_at")
        .eq("restaurant_id", r.id)
        .eq("audience", "restaurant")
        .in("message_key", [...proKeys])
        .in("user_id", userIds)
        .gte("created_at", since),
    ]);
    if (!optOuts.available || historyError) continue; // fail-closed

    const historyBy = new Map<string, HistoryRow[]>();
    for (const h of (historyRows ?? []) as { user_id: string; message_key: string; step: number | null; status: string; channel: string; created_at: string }[]) {
      const row: HistoryRow = { key: h.message_key, step: h.step, status: h.status, channel: h.channel, createdAt: h.created_at };
      historyBy.set(h.user_id, [...(historyBy.get(h.user_id) ?? []), row]);
    }

    let ctx: Ctx | null = null;
    for (const rec of recipients) {
      report.evaluated += 1;
      const state: ProRecipientState = {
        userId: rec.userId,
        activatedAt: r.activated_at,
        activeCodes,
        optedOut: optOuts.byUser.get(rec.userId) ?? new Set<string>(),
        history: historyBy.get(rec.userId) ?? [],
      };
      const decision = decideProSequence(state, enabled, now, timing);
      if (!decision) continue;

      if (!ctx) {
        const branding = await getRestaurantBranding(r.id);
        ctx = { restaurantId: r.id, restaurantName: r.name, logoUrl: logoPublicUrl(branding.logo_url), now };
      }
      const sendId = randomUUID();
      const rendered = await renderProDecision(decision, ctx, `${APP_URL}/e/stop/${sendId}`).catch((err) => {
        console.error(`[pro-sequences] rendu ${decision.key} échoué:`, err);
        return null;
      });
      if (!rendered) continue;

      const ok = await dispatch(rec.email, rendered.email, {
        key: decision.key,
        audience: "restaurant",
        restaurantId: r.id,
        userId: rec.userId,
        step: decision.step,
        sendId,
        slot: decision.slot,
        unsubscribeUrl: `${APP_URL}/api/e/stop/${sendId}`,
      });
      if (ok) report.sent += 1;
      else report.failed += 1;
    }
  }
  return report;
}
