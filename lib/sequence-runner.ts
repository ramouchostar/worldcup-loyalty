import { randomUUID } from "node:crypto";
import { createAdminClient } from "./supabase";
import { listLiveRestaurants } from "./demo";
import { fetchAllRows } from "./paged-select";
import { dispatch, getMemberTheme } from "./email";
import { sendPush } from "./notifications";
import { listMessageSettings, listOptOuts, recordSend } from "./message-log";
import { decideMemberSequence, MEMBER_SEQUENCE_KEYS, type HistoryRow, type MemberDecision, type MemberState } from "./sequence-rules";
import { APP_URL, appLink, firstNameOf, type MemberTheme, type RenderedEmail, type ShortMessage } from "./email-templates/kit";
import { firstTicketEmail, firstTicketShort } from "./email-templates/member-first-ticket";
import { teamInviteEmail, teamInviteShort } from "./email-templates/member-team-invite";
import { referralNudgeEmail, referralNudgeShort } from "./email-templates/member-referral-nudge";
import { installAppEmail } from "./email-templates/member-install-app";
import { getLandingOffer, type LandingOffer } from "./landing-offer";
import { loadRewardGrid } from "./rewards";
import { menuImageUrl } from "./menu-images";
import { foodIconUrl } from "./food-icon";
import { getTeamPrompt } from "./teams";
import { teamTypeEmoji } from "./team-suggestions";
import { getJetonsGift } from "./jetons-gift";
import { buildJoinUrl, buildWhatsappShareUrl } from "./referral-links";
import { getOrCreateReferralLink } from "./referral-code";
import { getPointsSummary, listCatalogue } from "./points";
import { catalogueView } from "./catalogue";
import { TOKENS_PER_PORTION } from "./social-actions";

// Moteur des séquences MEMBRES (ADR 0063, PR 3). Lu une fois par jour par
// /api/cron/sequences. Il charge les faits d'un établissement, laisse
// `decideMemberSequence` (pur, testé) choisir, puis envoie — ou note le
// tirage témoin. SERVEUR UNIQUEMENT.
//
// Ce qu'il ne fait jamais :
//   - écrire à un établissement où la séquence n'est pas allumée (ni à un
//     compte démo : seuls les établissements réels sont lus) ;
//   - écrire à quelqu'un dont il ne peut pas lire les « stop »
//     (table absente → établissement sauté) ;
//   - tirer un témoin quand l'envoi est impossible (clé Resend absente) :
//     un témoin sans groupe traité ne mesure rien.

const HISTORY_DAYS = 200;
const PUSH_SPACING_HOURS = 48; // même respiration que les notifications (ADR 0009)
const REDEEMED_LOOKBACK_HOURS = 48;

export type RunReport = {
  restaurants: number;
  evaluated: number;
  sent: number;
  failed: number;
  holdouts: number;
  pushes: number;
  skipped: string | null;
};

type MembershipRow = {
  user_id: string;
  team_id: string | null;
  joined_at: string;
  profiles: { email: string | null; display_name: string | null; last_notified_at: string | null; anonymized_at: string | null } | null;
};

type Context = {
  restaurantId: string;
  theme: MemberTheme;
  offer: LandingOffer;
  firstTeamGift: { name: string; imageUrl: string | null } | null;
  jetonsGift: string;
};

function imageFor(name: string, path: string | null | undefined): string | null {
  return menuImageUrl(path) ?? foodIconUrl(name);
}

async function loadContext(restaurantId: string): Promise<Context> {
  const [theme, offer, grid, jetons] = await Promise.all([
    getMemberTheme(restaurantId),
    getLandingOffer(restaurantId),
    loadRewardGrid(restaurantId),
    getJetonsGift(restaurantId),
  ]);
  const firstTier = grid.community[0]?.item ?? null;
  return {
    restaurantId,
    theme,
    offer,
    firstTeamGift: firstTier ? { name: firstTier, imageUrl: foodIconUrl(firstTier) } : null,
    jetonsGift: jetons.name,
  };
}

type Rendered = { email: RenderedEmail; short: ShortMessage | null } | null;

// Le gabarit d'une décision, rempli avec les vraies données du membre. null
// quand il n'y a finalement rien d'honnête à dire (plus de communauté à
// proposer, pas de lien de parrainage) : on n'envoie pas, on ne note rien.
async function render(
  decision: MemberDecision,
  member: { userId: string; firstName: string | null; redeemedGift: string | null },
  ctx: Context,
  stopUrl: string
): Promise<Rendered> {
  const admin = createAdminClient();
  const base = { theme: ctx.theme, restaurantId: ctx.restaurantId, firstName: member.firstName, link: appLink, manageUrl: appLink("/compte") };

  switch (decision.key) {
    case "first_ticket": {
      const welcomeGift = ctx.offer.welcome ? { name: ctx.offer.welcome.name, imageUrl: imageFor(ctx.offer.welcome.name, ctx.offer.welcome.imagePath) } : null;
      const showcase = ctx.offer.showcase.map((i) => ({ name: i.name, points: i.pricePoints, imageUrl: imageFor(i.name, i.imagePath) }));
      const step = (decision.step ?? 1) as 1 | 2 | 3;
      return {
        email: firstTicketEmail({ ...base, step, welcomeGift, showcase, stopUrl }),
        // Le push n'accompagne que la première étape : trois pushs en trois
        // semaines à quelqu'un qui n'est pas revenu, c'est du bruit.
        short: step === 1 ? firstTicketShort({ theme: ctx.theme, restaurantId: ctx.restaurantId, welcomeGift, link: appLink }) : null,
      };
    }
    case "install_app": {
      const [summary, catalogue] = await Promise.all([getPointsSummary(member.userId, ctx.restaurantId), listCatalogue(ctx.restaurantId)]);
      const points = summary.available + summary.pending;
      const view = catalogueView(points, catalogue);
      const target = view.reachable
        ? { name: view.reachable.name, imageUrl: imageFor(view.reachable.name, view.reachable.imagePath), reachable: true }
        : view.next
          ? { name: view.next.name, imageUrl: imageFor(view.next.name, view.next.imagePath), reachable: false, missing: view.missing }
          : null;
      return { email: installAppEmail({ ...base, points, target, doneUrl: stopUrl }), short: null };
    }
    case "referral_nudge": {
      if (!member.redeemedGift) return null;
      const link = await getOrCreateReferralLink(admin, member.userId, ctx.restaurantId);
      if (!link) return null;
      const [{ count: referralCount }, { data: claims }] = await Promise.all([
        admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", member.userId).eq("restaurant_id", ctx.restaurantId),
        admin.from("micro_reward_claims").select("status").eq("user_id", member.userId).eq("restaurant_id", ctx.restaurantId),
      ]);
      const refs = referralCount ?? 0;
      const claimRows = (claims ?? []) as { status: string }[];
      const jetons = claimRows.filter((c) => c.status === "validated").length + Math.floor(refs / 5);
      const whatsappUrl = buildWhatsappShareUrl(buildJoinUrl(APP_URL, link.code), ctx.theme.restaurantName);
      return {
        email: referralNudgeEmail({
          ...base,
          redeemedGift: member.redeemedGift,
          jetons,
          friendsTowardNext: refs % 5,
          jetonsGift: ctx.jetonsGift,
          whatsappUrl,
          socialActionsLeft: Math.max(0, TOKENS_PER_PORTION - claimRows.length),
          stopUrl,
        }),
        short: referralNudgeShort({ theme: ctx.theme, restaurantId: ctx.restaurantId, redeemedGift: member.redeemedGift, jetonsGift: ctx.jetonsGift, link: appLink }),
      };
    }
    case "team_invite": {
      const prompt = await getTeamPrompt(member.userId, ctx.restaurantId);
      if (!prompt || prompt.suggestions.length === 0) return null;
      const choices = prompt.suggestions.slice(0, 3).map((s) => ({ id: s.id, label: s.name, emoji: teamTypeEmoji(s.type), hasCaptain: !!s.team_id }));
      return {
        email: teamInviteEmail({ ...base, choices, firstTeamGift: ctx.firstTeamGift, stopUrl }),
        short: teamInviteShort({ theme: ctx.theme, restaurantId: ctx.restaurantId, choices, link: appLink }),
      };
    }
  }
}

// Les faits d'un établissement, prêts pour `decideMemberSequence`. Partagé
// par le passage réel et par l'aperçu de la console (« qui recevrait quoi
// aujourd'hui »), pour que les deux ne divergent jamais.
type LoadedMember = {
  state: MemberState;
  email: string;
  displayName: string | null;
  lastNotifiedAt: string | null;
  pushSubscribed: boolean;
  redeemedItem: string | null;
};

async function loadMembers(restaurantId: string, now: Date): Promise<{ members: LoadedMember[]; optOutsAvailable: boolean }> {
  const admin = createAdminClient();
  const memberKeys = [...MEMBER_SEQUENCE_KEYS] as string[];
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const redeemedSince = new Date(now.getTime() - REDEEMED_LOOKBACK_HOURS * 3_600_000).toISOString();

  const [{ rows: memberships }, { rows: orders }, { rows: history }, { data: pushRows }, { data: redeemedRows }, { count: suggestionCount }] = await Promise.all([
    fetchAllRows<MembershipRow>((from, to) =>
      admin
        .from("memberships")
        .select("user_id, team_id, joined_at, profiles!inner(email, display_name, last_notified_at, anonymized_at)")
        .eq("restaurant_id", restaurantId)
        .range(from, to) as unknown as PromiseLike<{ data: MembershipRow[] | null; error: { message: string } | null }>
    ),
    fetchAllRows<{ user_id: string; submitted_at: string }>((from, to) =>
      admin.from("orders").select("user_id, submitted_at").eq("restaurant_id", restaurantId).eq("status", "validated").range(from, to)
    ),
    fetchAllRows<{ user_id: string; message_key: string; step: number | null; status: string; channel: string; created_at: string }>((from, to) =>
      admin
        .from("message_sends")
        .select("user_id, message_key, step, status, channel, created_at")
        .eq("restaurant_id", restaurantId)
        .in("message_key", memberKeys)
        .gte("created_at", since)
        .range(from, to)
    ),
    admin.from("push_subscriptions").select("user_id").eq("restaurant_id", restaurantId),
    admin
      .from("pending_rewards")
      .select("user_id, redeemed_at, solo_item, community_item")
      .eq("restaurant_id", restaurantId)
      .eq("status", "redeemed")
      .gte("redeemed_at", redeemedSince),
    admin.from("team_suggestions").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("is_active", true),
  ]);

  const reachable = memberships.filter((m) => m.profiles?.email && !m.profiles.anonymized_at);
  const userIds = reachable.map((m) => m.user_id);
  const optOuts = await listOptOuts(userIds);

  const installed = new Set<string>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data } = await admin.from("member_app_installs").select("user_id").in("user_id", userIds.slice(i, i + 500));
    for (const r of (data ?? []) as { user_id: string }[]) installed.add(r.user_id);
  }

  const ordersBy = new Map<string, string[]>();
  for (const o of orders) ordersBy.set(o.user_id, [...(ordersBy.get(o.user_id) ?? []), o.submitted_at]);
  const historyBy = new Map<string, HistoryRow[]>();
  for (const h of history) {
    const row: HistoryRow = { key: h.message_key, step: h.step, status: h.status, channel: h.channel, createdAt: h.created_at };
    historyBy.set(h.user_id, [...(historyBy.get(h.user_id) ?? []), row]);
  }
  const pushUsers = new Set(((pushRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const redeemedBy = new Map<string, { at: string; item: string | null }>();
  for (const r of (redeemedRows ?? []) as { user_id: string; redeemed_at: string; solo_item: string | null; community_item: string | null }[]) {
    const prev = redeemedBy.get(r.user_id);
    if (!prev || prev.at < r.redeemed_at) redeemedBy.set(r.user_id, { at: r.redeemed_at, item: r.solo_item ?? r.community_item });
  }

  const members = reachable.map((m) => {
    const dates = (ordersBy.get(m.user_id) ?? []).sort();
    return {
      state: {
        userId: m.user_id,
        joinedAt: m.joined_at,
        hasTeam: !!m.team_id,
        validatedCount: dates.length,
        firstValidatedAt: dates[0] ?? null,
        installed: installed.has(m.user_id),
        lastRedeemedAt: redeemedBy.get(m.user_id)?.at ?? null,
        hasTeamChoices: (suggestionCount ?? 0) > 0,
        optedOut: optOuts.byUser.get(m.user_id) ?? new Set<string>(),
        history: historyBy.get(m.user_id) ?? [],
      },
      email: m.profiles!.email!,
      displayName: m.profiles?.display_name ?? null,
      lastNotifiedAt: m.profiles?.last_notified_at ?? null,
      pushSubscribed: pushUsers.has(m.user_id),
      redeemedItem: redeemedBy.get(m.user_id)?.item ?? null,
    };
  });
  return { members, optOutsAvailable: optOuts.available };
}

export async function runMemberSequences(now = new Date()): Promise<RunReport> {
  const report: RunReport = { restaurants: 0, evaluated: 0, sent: 0, failed: 0, holdouts: 0, pushes: 0, skipped: null };
  if (!process.env.RESEND_API_KEY) return { ...report, skipped: "RESEND_API_KEY absente : aucune séquence ne part." };

  const { settings, available } = await listMessageSettings();
  if (!available) return { ...report, skipped: "Journal des messages absent (migration 20260921-1615)." };

  const memberKeys = new Set<string>(MEMBER_SEQUENCE_KEYS);
  const enabledBy = new Map<string, Set<string>>();
  for (const s of settings) {
    if (!s.enabled || !memberKeys.has(s.message_key)) continue;
    const set = enabledBy.get(s.restaurant_id) ?? new Set<string>();
    set.add(s.message_key);
    enabledBy.set(s.restaurant_id, set);
  }
  if (enabledBy.size === 0) return { ...report, skipped: "Aucune séquence membre allumée." };

  const live = await listLiveRestaurants<{ id: string }>(createAdminClient(), "id");

  for (const { id: restaurantId } of live) {
    const enabled = enabledBy.get(restaurantId);
    if (!enabled) continue;
    report.restaurants += 1;

    const { members, optOutsAvailable } = await loadMembers(restaurantId, now);
    if (!optOutsAvailable) continue; // fail-closed : on ne relance pas quelqu'un dont on ne lit pas le « stop »

    let ctx: Context | null = null;

    for (const m of members) {
      report.evaluated += 1;
      const decision = decideMemberSequence(m.state, enabled, now);
      if (!decision) continue;

      if (decision.holdout) {
        await recordSend({ restaurantId, audience: "member", userId: m.state.userId, messageKey: decision.key, step: decision.step, channel: "none", status: "holdout" });
        report.holdouts += 1;
        continue;
      }

      ctx ??= await loadContext(restaurantId);
      const sendId = randomUUID();
      const rendered = await render(
        decision,
        { userId: m.state.userId, firstName: firstNameOf(m.displayName), redeemedGift: m.redeemedItem },
        ctx,
        `${APP_URL}/e/stop/${sendId}`
      ).catch((err) => {
        console.error(`[sequences] rendu ${decision.key} échoué:`, err);
        return null;
      });
      if (!rendered) continue;

      const ok = await dispatch(m.email, rendered.email, {
        key: decision.key,
        audience: "member",
        restaurantName: ctx.theme.restaurantName,
        restaurantId,
        userId: m.state.userId,
        step: decision.step,
        sendId,
        unsubscribeUrl: `${APP_URL}/api/e/stop/${sendId}`,
      });
      if (ok) report.sent += 1;
      else report.failed += 1;

      // Le push accompagne l'e-mail quand le membre a un appareil abonné et
      // n'a rien reçu depuis 48 h (même respiration que l'ADR 0009).
      const lastNotified = m.lastNotifiedAt ? new Date(m.lastNotifiedAt).getTime() : 0;
      if (ok && rendered.short && m.pushSubscribed && now.getTime() - lastNotified > PUSH_SPACING_HOURS * 3_600_000) {
        const pushed = await sendPush(m.state.userId, restaurantId, rendered.short.body).catch(() => false);
        await recordSend({
          restaurantId,
          audience: "member",
          userId: m.state.userId,
          messageKey: decision.key,
          step: decision.step,
          channel: "push",
          status: pushed ? "sent" : "failed",
          error: pushed ? null : "Push refusé par le service de notifications",
          subject: rendered.short.body,
        });
        if (pushed) report.pushes += 1;
      }
    }
  }

  return report;
}

// Aperçu pour /platform/messages : combien de membres recevraient chaque
// séquence AUJOURD'HUI si elle était allumée seule dans cet établissement
// (témoin compris). Rien n'est envoyé, rien n'est écrit.
export type SequencePreview = Record<string, Record<string, { send: number; holdout: number }>>;

export async function previewMemberSequences(restaurantIds: string[], now = new Date()): Promise<SequencePreview> {
  const out: SequencePreview = {};
  for (const restaurantId of restaurantIds) {
    const { members } = await loadMembers(restaurantId, now);
    const byKey: Record<string, { send: number; holdout: number }> = {};
    for (const key of MEMBER_SEQUENCE_KEYS) {
      const counts = { send: 0, holdout: 0 };
      for (const m of members) {
        const d = decideMemberSequence(m.state, new Set([key]), now);
        if (!d) continue;
        if (d.holdout) counts.holdout += 1;
        else counts.send += 1;
      }
      byKey[key] = counts;
    }
    out[restaurantId] = byKey;
  }
  return out;
}
