import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { logEvent, restaurantMissionUrl, type MissionRow, type EventRow } from "./missions";
import { providerMissionUrl } from "./providers";
import { getRestaurantContactEmail } from "./missions-contact";
import { sendMissionUpdateEmail } from "./email";
import { listDeliveries, listRetouches, type DeliveryRow, type RetouchRow } from "./missions-dayof";
import { sanctionProvider, writeCancellation, type CancelRecord } from "./missions-cancel";
import { canTransition, type MissionStatus } from "./mission-states";
import { canOpenDispute, needsAttention, sanitizeResolve, splitMoney, validateDisputeText, validateResolve, type Decision, type DisputeRecord, type ResolveIssue } from "./mission-dispute";
import type { CancelQuote } from "./mission-cancel-rules";
import type { MissionUpdateInput } from "./email-templates/mission-update";

// ============================================================
// Réserver un prestataire (ADR 0084 §4, PR J) — ce que la plateforme voit et décide.
//
// Les règles (qui peut ouvrir un litige, ce que chaque décision rend) vivent dans lib/mission-dispute.ts et la
// table des états (pures, testées) ; ce fichier les applique. Chaque écriture est un compare-and-swap sur l'état :
// deux clics, ou deux membres de l'équipe, n'écrivent qu'UNE décision. Tout est tracé dans `mission_events`.
// FAIL-OPEN : migration 20261013-1100 absente → « unavailable », jamais un litige ni un versement à moitié écrit.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;
const warn = (where: string, e: unknown) => {
  if (!isMissingTable(e as DbError)) console.error(`[missions-superadmin] ${where}:`, (e as Error).message);
};

// ── Toutes les missions ──────────────────────────────────────

export type MissionLine = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  provider_name: string;
  metier: string;
  status: MissionStatus;
  shoot_date: string | null;
  paid_cents: number | null;
  provider_cents: number | null;
  platform_cents: number | null;
  created_at: string;
  updated_at: string;
  report_contested_at: string | null;
  report_confirmed_at: string | null;
};

export async function listAllMissions(filter: { status?: string; metier?: string } = {}, limit = 200): Promise<{ ok: true; missions: MissionLine[] } | typeof unavailable> {
  try {
    let q = createAdminClient()
      .from("missions")
      .select("id, restaurant_id, metier, status, shoot_date, paid_cents, provider_cents, platform_cents, created_at, updated_at, report_contested_at, report_confirmed_at, restaurants(name), providers(display_name)")
      .neq("status", "brief") // un brouillon appartient encore au restaurateur
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.metier) q = q.eq("metier", filter.metier);
    const { data, error } = await q;
    if (error) throw error;
    return {
      ok: true,
      missions: ((data ?? []) as unknown as (Omit<MissionLine, "restaurant_name" | "provider_name"> & { restaurants: { name: string } | null; providers: { display_name: string } | null })[]).map(({ restaurants, providers, ...m }) => ({
        ...m,
        restaurant_name: restaurants?.name ?? m.restaurant_id,
        provider_name: providers?.display_name ?? "—",
      })),
    };
  } catch (e) {
    warn("listAllMissions", e);
    return unavailable;
  }
}

/** Les comptes-rendus contestés qui n'ont pas (encore) de litige : la plateforme décide d'ouvrir ou non. */
export async function listNeedingAttention(): Promise<MissionLine[]> {
  const r = await listAllMissions({}, 200);
  return r.ok ? r.missions.filter((m) => needsAttention(m)) : [];
}

// ── Les litiges ──────────────────────────────────────────────

export type DisputeLine = MissionLine & { dispute: DisputeRecord | null; dispute_opened_at: string | null };

export async function listOpenDisputes(): Promise<DisputeLine[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, restaurant_id, metier, status, shoot_date, paid_cents, provider_cents, platform_cents, created_at, updated_at, report_contested_at, report_confirmed_at, dispute, dispute_opened_at, restaurants(name), providers(display_name)")
      .eq("status", "litige")
      .order("dispute_opened_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as (Omit<DisputeLine, "restaurant_name" | "provider_name"> & { restaurants: { name: string } | null; providers: { display_name: string } | null })[]).map(({ restaurants, providers, ...m }) => ({
      ...m,
      restaurant_name: restaurants?.name ?? m.restaurant_id,
      provider_name: providers?.display_name ?? "—",
    }));
  } catch (e) {
    warn("listOpenDisputes", e);
    return [];
  }
}

export type DisputeFile = {
  mission: MissionRow & { dispute: DisputeRecord | null; dispute_opened_at: string | null; dispute_resolved_at: string | null; requested_by: string | null };
  restaurantName: string;
  providerName: string;
  providerWarnings: number;
  quote: { price_cents: number; hours: number | null; delivery_days: number | null; included: string[]; excluded: string[]; hypotheses: string | null } | null;
  deliveries: DeliveryRow[];
  retouches: RetouchRow[];
  events: EventRow[];
};

/** Le dossier complet que lit l'arbitre : le brief verrouillé, le devis, les deux versions du compte-rendu, les livraisons, les retouches, la trace. */
export async function loadDisputeFile(missionId: string): Promise<{ ok: true; file: DisputeFile | null } | typeof unavailable> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("missions").select("*, restaurants(name), providers(display_name, warnings)").eq("id", missionId).maybeSingle();
    if (error) throw error;
    if (!data) return { ok: true, file: null };
    const { restaurants, providers, ...mission } = data as unknown as DisputeFile["mission"] & { restaurants: { name: string } | null; providers: { display_name: string; warnings: number } | null };
    const [{ data: quote }, deliveries, retouches, { data: events }] = await Promise.all([
      admin.from("mission_quotes").select("price_cents, hours, delivery_days, included, excluded, hypotheses").eq("mission_id", missionId).in("status", ["accepted", "proposed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      listDeliveries(missionId),
      listRetouches(missionId),
      admin.from("mission_events").select("id, kind, from_status, to_status, actor_kind, reason, created_at").eq("mission_id", missionId).order("created_at", { ascending: true }).limit(200),
    ]);
    return {
      ok: true,
      file: {
        mission,
        restaurantName: restaurants?.name ?? mission.restaurant_id,
        providerName: providers?.display_name ?? "—",
        providerWarnings: providers?.warnings ?? 0,
        quote: (quote as DisputeFile["quote"]) ?? null,
        deliveries,
        retouches,
        events: (events as EventRow[]) ?? [],
      },
    };
  } catch (e) {
    warn("loadDisputeFile", e);
    return unavailable;
  }
}

async function notifyBoth(missionId: string, restaurantId: string, requestedBy: string | null, providerId: string | null, base: Omit<MissionUpdateInput, "audience" | "url">): Promise<void> {
  const admin = createAdminClient();
  const jobs: { who: "restaurant" | "provider"; to: () => Promise<string | null>; url: string }[] = [
    { who: "restaurant", to: () => getRestaurantContactEmail(restaurantId, requestedBy), url: restaurantMissionUrl(restaurantId, missionId) },
    { who: "provider", to: async () => (providerId ? ((await admin.from("providers").select("email").eq("id", providerId).maybeSingle()).data as { email: string } | null)?.email ?? null : null), url: providerMissionUrl(missionId) },
  ];
  for (const j of jobs) {
    try {
      const to = await j.to();
      if (!to) throw new Error(`aucune adresse pour ${j.who}`);
      const sent = await sendMissionUpdateEmail(to, { ...base, audience: j.who, url: j.url }, restaurantId);
      await logEvent(missionId, { kind: sent ? "notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: base.kind, who: j.who } });
    } catch (e) {
      console.error("[missions-superadmin] notification échouée:", j.who, (e as Error).message);
      await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { about: base.kind, who: j.who } });
    }
  }
}

export type OpenResult = { ok: true } | { ok: false; reason: "not_found" | "not_openable" | "invalid" | "unavailable" };

/** Ouvre un litige : `→ litige`. À partir de là, plus aucun rappel ni validation automatique (les crons ne lisent que leurs états). */
export async function openDispute(missionId: string, platformUserId: string, rawReason: unknown): Promise<OpenResult> {
  const text = validateDisputeText(rawReason);
  if (!text.ok) return { ok: false, reason: "invalid" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("missions").select("id, restaurant_id, provider_id, requested_by, status, restaurants(name), providers(display_name)").eq("id", missionId).maybeSingle();
    if (error) throw error;
    const m = data as unknown as { id: string; restaurant_id: string; provider_id: string | null; requested_by: string | null; status: MissionStatus; restaurants: { name: string } | null; providers: { display_name: string } | null } | null;
    if (!m) return { ok: false, reason: "not_found" };
    if (!canOpenDispute(m.status)) return { ok: false, reason: "not_openable" };

    const now = new Date().toISOString();
    const dispute: DisputeRecord = { openedBy: platformUserId, reason: text.text, previousStatus: m.status };
    const { data: moved, error: e2 } = await admin.from("missions").update({ status: "litige", dispute, dispute_opened_at: now, updated_at: now }).eq("id", missionId).eq("status", m.status).select("id");
    if (e2) throw e2;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_openable" };
    await logEvent(missionId, { kind: "status", from: m.status, to: "litige", actorKind: "platform", actorId: platformUserId, reason: text.text });
    await notifyBoth(missionId, m.restaurant_id, m.requested_by, m.provider_id, { kind: "dispute_opened", restaurantName: m.restaurants?.name ?? m.restaurant_id, providerName: m.providers?.display_name ?? "Le prestataire" });
    return { ok: true };
  } catch (e) {
    warn("openDispute", e);
    return unavailable;
  }
}

export type ResolveResult = { ok: true; decision: Decision } | { ok: false; reason: "not_found" | "not_in_dispute" | "invalid" | "unavailable"; issue?: ResolveIssue };

/**
 * Tranche un litige. `pay` : `litige → valide` (le prestataire sera payé, voir « À verser »). `refund` et `split` :
 * `litige → annule` avec le même chiffrage que toute annulation (rendu, retenu, versé, net compte tenu de l'ACOMPTE),
 * donc la même liste « à régler » ; la sanction du prestataire est choisie par la plateforme.
 */
export async function resolveDispute(missionId: string, platformUserId: string, raw: unknown): Promise<ResolveResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("missions").select("*, restaurants(name), providers(display_name)").eq("id", missionId).maybeSingle();
    if (error) throw error;
    const m = data as unknown as (MissionRow & { dispute: DisputeRecord | null; requested_by: string | null; restaurants: { name: string } | null; providers: { display_name: string } | null }) | null;
    if (!m) return { ok: false, reason: "not_found" };
    if (m.status !== "litige") return { ok: false, reason: "not_in_dispute" };

    const deliveries = await listDeliveries(missionId);
    const v = validateResolve(sanitizeResolve(raw), { hasDelivery: deliveries.length > 0 });
    if (!v.ok) return { ok: false, reason: "invalid", issue: v.issue };
    const input = v.input;
    const now = new Date().toISOString();
    const resolved: DisputeRecord = { ...(m.dispute ?? { openedBy: "", reason: "", previousStatus: "" }), decision: input.decision, providerPct: input.providerPct, sanction: input.sanction, note: input.note, resolvedBy: platformUserId };
    const names = { restaurantName: m.restaurants?.name ?? m.restaurant_id, providerName: m.providers?.display_name ?? "Le prestataire" };

    if (input.decision === "pay") {
      if (!canTransition("litige", "valide", "platform").ok) return { ok: false, reason: "invalid" };
      const { data: moved, error: e2 } = await admin
        .from("missions")
        .update({ status: "valide", validated_at: now, dispute: resolved, dispute_resolved_at: now, updated_at: now })
        .eq("id", missionId)
        .eq("status", "litige") // deux membres de l'équipe : une seule décision
        .select("id");
      if (e2) throw e2;
      if (!moved || moved.length === 0) return { ok: false, reason: "not_in_dispute" };
      await logEvent(missionId, { kind: "dispute_resolved", from: "litige", to: "valide", actorKind: "platform", actorId: platformUserId, reason: "pay", meta: { note: input.note } });
    } else {
      const paid = m.paid_cents ?? 0;
      const money = splitMoney(input.decision, paid, m.provider_cents ?? 0, input.providerPct);
      const quote: CancelQuote & { sanction: typeof input.sanction } = {
        band: input.decision === "refund" ? "free" : "half",
        hoursBefore: null,
        beforeDate: false,
        outcome: { band: input.decision === "refund" ? "free" : "half", ...money, providerSanction: input.sanction },
        sanction: input.sanction,
      };
      const actor = { kind: "platform" as const, userId: platformUserId };
      const written = await writeCancellation(m, quote, actor, "Décision d'un litige", input.note, input.decision === "refund" ? "provider" : null, {
        record: { dispute: { decision: input.decision, providerPct: input.providerPct } } as Partial<CancelRecord>,
        columns: { dispute: resolved, dispute_resolved_at: now },
      });
      if (written === "unavailable") return unavailable;
      if (written === "raced") return { ok: false, reason: "not_in_dispute" };
      await sanctionProvider(m.provider_id, m.id, input.sanction, actor);
      await logEvent(missionId, { kind: "dispute_resolved", from: "litige", to: "annule", actorKind: "platform", actorId: platformUserId, reason: input.decision, meta: { note: input.note, providerPct: input.providerPct, sanction: input.sanction } });
    }
    await notifyBoth(missionId, m.restaurant_id, m.requested_by, m.provider_id, { kind: "dispute_resolved", decision: input.decision, providerPct: input.providerPct ?? undefined, ...names });
    return { ok: true, decision: input.decision };
  } catch (e) {
    warn("resolveDispute", e);
    return unavailable;
  }
}

// ── Les versements, à la main avant Stripe ───────────────────

export type ToPay = { id: string; restaurant_name: string; provider_name: string; provider_email: string | null; provider_cents: number; validated_at: string | null };

/** Les livraisons validées dont le prestataire n'est pas encore payé : le versement se fait à la main tant que Stripe n'est pas branché. */
export async function listToPay(): Promise<ToPay[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, provider_cents, validated_at, restaurants(name), providers(display_name, email)")
      .eq("status", "valide")
      .is("paid_out_at", null)
      .order("validated_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as { id: string; provider_cents: number | null; validated_at: string | null; restaurants: { name: string } | null; providers: { display_name: string; email: string } | null }[]).map((r) => ({
      id: r.id,
      restaurant_name: r.restaurants?.name ?? "Restaurant",
      provider_name: r.providers?.display_name ?? "Prestataire",
      provider_email: r.providers?.email ?? null,
      provider_cents: r.provider_cents ?? 0,
      validated_at: r.validated_at,
    }));
  } catch (e) {
    warn("listToPay", e);
    return [];
  }
}

export type PaidResult = { ok: true } | { ok: false; reason: "not_found" | "not_validated" | "unavailable" };

/** `valide → verse` : le prestataire a été payé à la main. Un seul clic compte ; le prestataire est prévenu. */
export async function markPaidOut(missionId: string, platformUserId: string): Promise<PaidResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("missions").select("id, restaurant_id, provider_id, requested_by, status, restaurants(name), providers(display_name)").eq("id", missionId).maybeSingle();
    if (error) throw error;
    const m = data as unknown as { id: string; restaurant_id: string; provider_id: string | null; requested_by: string | null; status: MissionStatus; restaurants: { name: string } | null; providers: { display_name: string } | null } | null;
    if (!m) return { ok: false, reason: "not_found" };
    if (m.status !== "valide" || !canTransition("valide", "verse", "platform").ok) return { ok: false, reason: "not_validated" };

    const now = new Date().toISOString();
    const { data: moved, error: e2 } = await admin.from("missions").update({ status: "verse", paid_out_at: now, updated_at: now }).eq("id", missionId).eq("status", "valide").is("paid_out_at", null).select("id");
    if (e2) throw e2;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_validated" };
    await logEvent(missionId, { kind: "status", from: "valide", to: "verse", actorKind: "platform", actorId: platformUserId, reason: "paid_out_manually" });

    try {
      const to = m.provider_id ? ((await admin.from("providers").select("email").eq("id", m.provider_id).maybeSingle()).data as { email: string } | null)?.email : null;
      if (!to) throw new Error("aucune adresse pour le prestataire");
      const sent = await sendMissionUpdateEmail(to, { kind: "paid_out", audience: "provider", restaurantName: m.restaurants?.name ?? m.restaurant_id, providerName: m.providers?.display_name ?? "", url: providerMissionUrl(missionId) }, m.restaurant_id);
      await logEvent(missionId, { kind: sent ? "provider_notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "paid_out" } });
    } catch (e) {
      console.error("[missions-superadmin] paid_out notification failed:", (e as Error).message);
      await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { about: "paid_out" } });
    }
    return { ok: true };
  } catch (e) {
    warn("markPaidOut", e);
    return unavailable;
  }
}
