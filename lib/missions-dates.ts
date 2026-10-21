import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { addDays } from "./console-journey";
import { getPlan } from "./entitlements";
import { logEvent, loadTemplate, getMission, getProviderName, restaurantMissionUrl, type MissionRow } from "./missions";
import { providerMissionUrl } from "./providers";
import { sendProviderDateBookedEmail } from "./email";
import { priceBreakdown, splitPayment } from "./mission-money";
import { getTerms } from "./marketplace-settings";
import { mergeAnswers, sanitizeAnswers } from "./mission-draft";
import { validateBrief, type BriefAnswers, type BriefIssue } from "./mission-brief";
import { canTransition } from "./mission-states";
import { CALENDAR_HORIZON_DAYS, blockableDays, judgeDayEdit, judgeShootChoice, type Blocked, type ShootChoiceIssue } from "./mission-dates";
import { dateLabelFr } from "./mission-team-message";

// ============================================================
// Réserver un prestataire (ADR 0084, PR E) — calendrier, choix de la date, acceptation.
//
// Les décisions vivent dans lib/mission-dates.ts et lib/mission-draft.ts (pures, testées) ;
// ce fichier les applique à Supabase. Deux garanties tiennent en BASE (migration
// 20261012-1000) : un prestataire n'a qu'un tournage par jour (index unique partiel), donc deux
// restaurateurs qui cliquent le même jour au même instant n'en réservent qu'un. FAIL-OPEN :
// tables absentes → « indisponible », jamais une date sans contrôle.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

/** Les états où le jour est PRIS pour ce prestataire (même liste que l'index unique de la migration). */
const BOOKED_STATUSES = ["date_bloquee", "production", "livre", "retouche", "valide", "suspendu", "litige"];

// ── Le calendrier d'un prestataire ───────────────────────────

export async function loadBlocked(providerId: string, today: string, exceptMissionId?: string): Promise<{ ok: true; blocked: Blocked } | typeof unavailable> {
  try {
    const admin = createAdminClient();
    const until = addDays(today, CALENDAR_HORIZON_DAYS);
    const [{ data: off, error: e1 }, { data: taken, error: e2 }] = await Promise.all([
      admin.from("provider_unavailability").select("day").eq("provider_id", providerId).gte("day", today).lte("day", until),
      admin.from("missions").select("id, shoot_date").eq("provider_id", providerId).in("status", BOOKED_STATUSES).not("shoot_date", "is", null).gte("shoot_date", today).lte("shoot_date", until),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const booked = new Set(((taken ?? []) as { id: string; shoot_date: string }[]).filter((m) => m.id !== exceptMissionId).map((m) => m.shoot_date));
    return { ok: true, blocked: { unavailable: new Set(((off ?? []) as { day: string }[]).map((r) => r.day)), booked } };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dates] loadBlocked failed:", (e as Error).message);
    return unavailable;
  }
}

export type DayEditResult = { ok: true; changed: number; refused: string[] } | { ok: false; reason: "invalid" | "unavailable" };

/** Le prestataire bloque ou libère des jours. Un jour déjà réservé par une mission ne se bloque pas. */
export async function editUnavailability(providerId: string, rawDays: unknown, action: "block" | "free"): Promise<DayEditResult> {
  const days = Array.isArray(rawDays) ? rawDays.filter((d): d is string => typeof d === "string") : [];
  const today = todayInBrussels();
  const verdict = judgeDayEdit(days, today);
  if (!verdict.ok) return { ok: false, reason: "invalid" };

  const loaded = await loadBlocked(providerId, today);
  if (!loaded.ok) return unavailable;
  const admin = createAdminClient();
  try {
    if (action === "free") {
      const { error } = await admin.from("provider_unavailability").delete().eq("provider_id", providerId).in("day", verdict.days);
      if (error) throw error;
      return { ok: true, changed: verdict.days.length, refused: [] };
    }
    const { blockable, refused } = blockableDays(verdict.days, loaded.blocked.booked);
    if (blockable.length > 0) {
      const { error } = await admin.from("provider_unavailability").upsert(blockable.map((day) => ({ provider_id: providerId, day })), { onConflict: "provider_id,day", ignoreDuplicates: true });
      if (error) throw error;
    }
    return { ok: true, changed: blockable.length, refused };
  } catch (e) {
    console.error("[missions-dates] editUnavailability failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Acceptation (pilote, avant Stripe) ───────────────────────

export type AcceptResult = { ok: true } | { ok: false; reason: "not_found" | "not_a_quote" | "unavailable" };

/**
 * `devis → accepte`, par la PLATEFORME, quand le restaurateur a dit oui et que l'acompte est
 * convenu hors plateforme (pilote : trois prestataires, pas encore de Stripe). Les montants sont
 * FIGÉS ici avec le plan du restaurateur à cet instant, exactement comme le fera le paiement ;
 * chaque acceptation manuelle laisse sa ligne dans la trace. Quand Stripe arrive, c'est le
 * paiement de l'acompte qui appelle la même fonction.
 */
export async function acceptQuoteByPlatform(missionId: string, platformUserId: string): Promise<AcceptResult> {
  try {
    const admin = createAdminClient();
    const { data: m, error } = await admin.from("missions").select("id, restaurant_id, status").eq("id", missionId).maybeSingle();
    if (error) throw error;
    const mission = m as { id: string; restaurant_id: string; status: string } | null;
    if (!mission) return { ok: false, reason: "not_found" };
    if (mission.status !== "devis" || !canTransition("devis", "accepte", "platform").ok) return { ok: false, reason: "not_a_quote" };

    const { data: q } = await admin.from("mission_quotes").select("id, price_cents").eq("mission_id", missionId).eq("status", "proposed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const quote = q as { id: string; price_cents: number } | null;
    if (!quote) return { ok: false, reason: "not_a_quote" };

    // Les conditions EN VIGUEUR à cet instant, figées sur la mission : un réglage changé plus tard ne touche jamais une mission déjà acceptée.
    const { terms } = await getTerms();
    const plan = await getPlan(mission.restaurant_id);
    const b = priceBreakdown(quote.price_cents, plan, terms);
    const split = splitPayment(b.paidCents, terms.depositBps);

    const now = new Date().toISOString();
    const { data: moved, error: e2 } = await admin
      .from("missions")
      .update({
        status: "accepte",
        accepted_quote_id: quote.id,
        quote_cents: b.quoteCents,
        plan_at_payment: plan,
        paid_cents: b.paidCents,
        provider_cents: b.providerCents,
        platform_cents: b.platformCents,
        deposit_cents: split.depositCents,
        updated_at: now,
      })
      .eq("id", missionId)
      .eq("status", "devis") // deux clics : une seule acceptation
      .select("id");
    if (e2) throw e2;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_a_quote" };
    await admin.from("mission_quotes").update({ status: "accepted" }).eq("id", quote.id);
    await logEvent(missionId, {
      kind: "status",
      from: "devis",
      to: "accepte",
      actorKind: "platform",
      actorId: platformUserId,
      reason: "accepted_manually",
      meta: { plan, quoteCents: b.quoteCents, paidCents: b.paidCents, depositCents: split.depositCents, how: "acompte convenu hors plateforme (pilote)" },
    });
    return { ok: true };
  } catch (e) {
    console.error("[missions-dates] acceptQuoteByPlatform failed:", (e as Error).message);
    return unavailable;
  }
}

export type QuotedMission = { id: string; restaurant_name: string; provider_name: string; metier: string; price_cents: number; paid_cents: number; deposit_cents: number; plan: string; since: string };

/** Les devis qui attendent un oui du restaurateur : ce que la plateforme voit pour enregistrer l'acceptation. */
export async function listQuotedMissions(): Promise<QuotedMission[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("missions")
      .select("id, restaurant_id, metier, updated_at, restaurants(name), providers(display_name), mission_quotes(price_cents, status, created_at)")
      .eq("status", "devis")
      .order("updated_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    const out: QuotedMission[] = [];
    const { terms } = await getTerms();
    for (const row of (data ?? []) as unknown as { id: string; restaurant_id: string; metier: string; updated_at: string; restaurants: { name: string } | null; providers: { display_name: string } | null; mission_quotes: { price_cents: number; status: string; created_at: string }[] }[]) {
      const q = [...row.mission_quotes].filter((x) => x.status === "proposed").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!q) continue;
      const plan = await getPlan(row.restaurant_id);
      const b = priceBreakdown(q.price_cents, plan, terms);
      out.push({ id: row.id, restaurant_name: row.restaurants?.name ?? row.restaurant_id, provider_name: row.providers?.display_name ?? "", metier: row.metier, price_cents: q.price_cents, paid_cents: b.paidCents, deposit_cents: splitPayment(b.paidCents, terms.depositBps).depositCents, plan, since: row.updated_at });
    }
    return out;
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-dates] listQuotedMissions failed:", (e as Error).message);
    return [];
  }
}

// ── Le choix de la date ──────────────────────────────────────

export type ChooseResult =
  | { ok: true; date: string }
  | { ok: false; reason: "not_found" | "not_accepted" | "invalid_choice" | "invalid_answers" | "unavailable"; issue?: ShootChoiceIssue; issues?: BriefIssue[] };

/**
 * Le restaurateur choisit sa date, son créneau, qui est présent et son contact : `accepte → date_bloquee`.
 * La date est jugée contre les jours bloqués ET les jours déjà pris, puis l'index unique de la base
 * tranche si deux restaurateurs arrivent en même temps. Chaque refus laisse sa ligne dans la trace.
 */
export async function chooseShootDate(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<ChooseResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const mission = found.mission;
  if (!mission) return { ok: false, reason: "not_found" };
  if (!mission.provider_id || !canTransition(mission.status, "date_bloquee", "restaurant").ok) return { ok: false, reason: "not_accepted" };

  const tpl = await loadTemplate(mission.metier);
  if (!tpl) return unavailable;
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers = sanitizeAnswers(input, tpl.template, "tournage");
  const today = todayInBrussels();

  const verdict = validateBrief(answers, tpl.template, today, "tournage");
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "date_refused", actorKind: "restaurant", actorId: userId, reason: "invalid_answers", meta: { issues: verdict.issues.map((i) => `${i.key}:${i.code}`) } });
    return { ok: false, reason: "invalid_answers", issues: verdict.issues };
  }

  const date = String(answers.shoot_date);
  const slotStart = String(answers.shoot_slot);
  const loaded = await loadBlocked(mission.provider_id, today, missionId);
  if (!loaded.ok) return unavailable;
  const choice = judgeShootChoice({ date, slotStart, today, blocked: loaded.blocked });
  if (!choice.ok) {
    await logEvent(missionId, { kind: "date_refused", actorKind: "restaurant", actorId: userId, reason: choice.issue, meta: { date, slotStart } });
    return { ok: false, reason: "invalid_choice", issue: choice.issue };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: moved, error } = await admin
      .from("missions")
      .update({ status: "date_bloquee", shoot_date: date, shoot_start: slotStart, brief: mergeAnswers(mission.brief ?? {}, answers), updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "accepte") // deux clics : une seule date
      .select("id");
    if (error) {
      // L'index unique : un autre restaurateur a pris ce jour entre la lecture et l'écriture.
      if (error.code === "23505") {
        await logEvent(missionId, { kind: "date_refused", actorKind: "restaurant", actorId: userId, reason: "booked", meta: { date, race: true } });
        return { ok: false, reason: "invalid_choice", issue: "booked" };
      }
      throw error;
    }
    if (!moved || moved.length === 0) return { ok: false, reason: "not_accepted" };
    await logEvent(missionId, { kind: "status", from: "accepte", to: "date_bloquee", actorKind: "restaurant", actorId: userId, meta: { date, slotStart } });
    await notifyDateBooked(mission, answers, date, slotStart);
    return { ok: true, date };
  } catch (e) {
    console.error("[missions-dates] chooseShootDate failed:", (e as Error).message);
    return unavailable;
  }
}

/** Le prestataire apprend que sa date est prise. Best-effort, jamais silencieux : l'issue est une ligne de la trace. */
async function notifyDateBooked(mission: MissionRow, answers: BriefAnswers, date: string, slotStart: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: provider }, { data: restaurant }] = await Promise.all([
      admin.from("providers").select("email").eq("id", mission.provider_id).maybeSingle(),
      admin.from("restaurants").select("name").eq("id", mission.restaurant_id).maybeSingle(),
    ]);
    const email = (provider as { email: string } | null)?.email;
    if (!email) throw new Error("prestataire sans adresse");
    const providerName = (await getProviderName(mission.provider_id)) ?? "";
    const c = answers.contact as { name?: string; phone?: string } | undefined;
    const sent = await sendProviderDateBookedEmail(email, {
      providerName,
      restaurantName: (restaurant as { name: string } | null)?.name ?? "Un restaurateur",
      dateLabel: dateLabelFr(date),
      dateISO: date,
      startTime: slotStart,
      contact: [c?.name, c?.phone].filter(Boolean).join(" · ") || "à confirmer",
      missionUrl: providerMissionUrl(mission.id),
    });
    await logEvent(mission.id, { kind: sent ? "provider_notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "date_booked" } });
  } catch (e) {
    console.error("[missions-dates] notifyDateBooked failed:", (e as Error).message);
    await logEvent(mission.id, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { channel: "email", about: "date_booked" } });
  }
}

// ── L'équipe est prévenue ────────────────────────────────────

/** Le restaurateur confirme avoir prévenu son équipe : l'heure est gardée (preuve en cas de litige). */
export async function markTeamNotified(missionId: string, restaurantId: string, userId: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "no_date" | "unavailable" }> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("missions")
      .update({ team_notified_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .not("shoot_date", "is", null)
      .is("team_notified_at", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { data: exists } = await admin.from("missions").select("id, shoot_date, team_notified_at").eq("id", missionId).eq("restaurant_id", restaurantId).maybeSingle();
      const e = exists as { shoot_date: string | null; team_notified_at: string | null } | null;
      if (!e) return { ok: false, reason: "not_found" };
      return e.team_notified_at ? { ok: true } : { ok: false, reason: "no_date" }; // déjà confirmé : idempotent
    }
    await logEvent(missionId, { kind: "team_notified", actorKind: "restaurant", actorId: userId });
    return { ok: true };
  } catch (e) {
    console.error("[missions-dates] markTeamNotified failed:", (e as Error).message);
    return unavailable;
  }
}

export { restaurantMissionUrl };
