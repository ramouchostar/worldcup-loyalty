import { createAdminClient } from "../supabase";
import { attachCampaign } from "./naming";
import { adAccount, describeMetaError, metaGet, metaGetAll } from "./meta-api";
import { dayStatFromInsight, statusFromMeta, type InsightRow, type RequestStatus } from "./meta-spec";

// ADR 0085 §3-4 — la lecture quotidienne. Lit toutes les campagnes du compte Boosteats,
// rattache par le NOM à la première lecture puis par l'IDENTIFIANT, réécrit les 7 derniers
// jours de statistiques (Meta corrige les chiffres récents), suit l'avis de Meta sur chaque
// publicité et fait avancer les demandes lancées (en diffusion / en pause / terminée).
// Une ligne `ad_sync_runs` par passage : lues, rattachées, non rattachées, erreurs et causes.

export const STATS_DAYS = 7;

export function todayBrussels(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type MetaCampaign = { id: string; name: string; status: string; effective_status: string; spend_cap?: string; objective?: string };
type MetaAd = { id: string; effective_status: string; ad_review_feedback?: Record<string, unknown> };
type CampaignRow = {
  id: string;
  external_id: string;
  name: string;
  restaurant_id: string | null;
  request_id: string | null;
  objective: string | null;
  warnings: string[];
  ad_external_id: string | null;
};

export type SyncSummary = {
  ok: boolean;
  runId: string | null;
  read: number;
  attached: number;
  unattached: number;
  errors: { step: string; message: string }[];
  disapproved: { campaignId: string; name: string; feedback: unknown }[];
  ended: string[];
};

export async function runAdsSync(now: Date = new Date()): Promise<SyncSummary> {
  const summary: SyncSummary = { ok: false, runId: null, read: 0, attached: 0, unattached: 0, errors: [], disapproved: [], ended: [] };
  const account = adAccount();
  const db = createAdminClient();
  const today = todayBrussels(now);

  const started = await db.from("ad_sync_runs").insert({ regie: "META" }).select("id").single();
  if (started.error) {
    summary.errors.push({ step: "journal", message: started.error.message });
    console.error("[ads/sync] ad_sync_runs indisponible:", started.error.message);
    return summary;
  }
  summary.runId = (started.data as { id: string }).id;

  const finish = async () => {
    summary.ok = summary.errors.length === 0;
    const { error } = await db
      .from("ad_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: summary.ok,
        campaigns_read: summary.read,
        attached: summary.attached,
        unattached: summary.unattached,
        errors: summary.errors.length,
        error_detail: summary.errors.length ? summary.errors : null,
      })
      .eq("id", summary.runId);
    if (error) console.error("[ads/sync] fin du passage non écrite:", error.message);
    return summary;
  };

  if (!account) {
    summary.errors.push({ step: "config", message: "META_ADS_SYSTEM_USER_TOKEN ou META_ADS_ACCOUNT_ID_BE absent" });
    return finish();
  }

  // 1. Qui porte quel code client.
  const clientsRes = await db.from("restaurants").select("id, client_code").not("client_code", "is", null);
  if (clientsRes.error) {
    summary.errors.push({ step: "clients", message: clientsRes.error.message });
    return finish();
  }
  const clients = new Map(((clientsRes.data ?? []) as { id: string; client_code: string }[]).map((r) => [r.client_code, r.id]));

  // 2. Les campagnes du compte.
  const list = await metaGetAll<MetaCampaign>(`${account}/campaigns`, { fields: "id,name,status,effective_status,spend_cap,objective" });
  if (!list.ok) {
    summary.errors.push({ step: "campaigns", message: describeMetaError(list.error) });
    return finish();
  }
  summary.read = list.data.length;

  const existingRes = await db.from("ad_campaigns").select("id, external_id, name, restaurant_id, request_id, objective, warnings, ad_external_id").eq("regie", "META");
  if (existingRes.error) {
    summary.errors.push({ step: "ad_campaigns", message: existingRes.error.message });
    return finish();
  }
  const byExternal = new Map(((existingRes.data ?? []) as CampaignRow[]).map((c) => [c.external_id, c]));
  const rows: CampaignRow[] = [];
  const capOf = new Map<string, number | null>();
  const effOf = new Map<string, string>();

  for (const c of list.data) {
    const cap = c.spend_cap && Number(c.spend_cap) > 0 ? Math.round(Number(c.spend_cap)) : null; // centimes chez Meta
    const prev = byExternal.get(c.id);
    const nowIso = new Date().toISOString();
    if (prev) {
      // Le lien enregistré fait foi : un renommage ne déplace rien, il est signalé.
      const warnings = new Set(prev.warnings ?? []);
      if (prev.name !== c.name) warnings.add("renamed");
      const { error } = await db
        .from("ad_campaigns")
        .update({ status: c.status, effective_status: c.effective_status, spend_cap_cents: cap, last_seen_at: nowIso, warnings: [...warnings] })
        .eq("id", prev.id);
      if (error) summary.errors.push({ step: `campagne ${c.id}`, message: error.message });
      rows.push(prev);
    } else {
      const a = attachCampaign(c.name, clients);
      const insert = {
        regie: "META",
        external_id: c.id,
        name: c.name,
        restaurant_id: a.attached ? a.restaurantId : null,
        objective: a.attached ? a.objective : (a.parsed?.objective ?? null),
        version: a.parsed?.version ?? null,
        status: c.status,
        effective_status: c.effective_status,
        spend_cap_cents: cap,
        attach_source: a.attached ? "name" : null,
        attach_problem: a.attached ? null : a.problem,
        warnings: a.attached ? a.warnings : [],
      };
      const { data, error } = await db.from("ad_campaigns").insert(insert).select("id, external_id, name, restaurant_id, request_id, objective, warnings, ad_external_id").single();
      if (error) summary.errors.push({ step: `campagne ${c.id}`, message: error.message });
      else rows.push(data as CampaignRow);
    }
    capOf.set(c.id, cap);
    effOf.set(c.id, c.effective_status);
  }
  for (const r of rows) {
    if (r.restaurant_id) summary.attached++;
    else summary.unattached++;
  }

  // 3. Statistiques des 7 derniers jours, par campagne et par jour.
  const since = daysAgo(today, STATS_DAYS - 1);
  const insights = await metaGetAll<InsightRow & { campaign_id: string }>(`${account}/insights`, {
    level: "campaign",
    time_increment: 1,
    time_range: { since, until: today },
    fields: "campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,video_thruplay_watched_actions",
  });
  const local = new Map(rows.map((r) => [r.external_id, r]));
  if (!insights.ok) {
    summary.errors.push({ step: "insights", message: describeMetaError(insights.error) });
  } else {
    const upserts = insights.data
      .map((row) => {
        const camp = local.get(row.campaign_id);
        if (!camp) return null;
        const s = dayStatFromInsight(row, camp.objective);
        return { campaign_id: camp.id, day: s.day, spend_cents: s.spendCents, impressions: s.impressions, reach: s.reach, clicks: s.clicks, results: s.results, result_kind: s.resultKind, updated_at: new Date().toISOString() };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (upserts.length) {
      const { error } = await db.from("ad_daily_stats").upsert(upserts, { onConflict: "campaign_id,day" });
      if (error) summary.errors.push({ step: "ad_daily_stats", message: error.message });
    }
  }

  // 3 bis. Totaux depuis le début de chaque campagne (portée sans double compte) : la base
  // de comparaison de l'estimation faite avant paiement (ADR 0086 amendé le 2026-10-29).
  const life = await metaGetAll<{ campaign_id: string; reach?: string; impressions?: string; inline_link_clicks?: string; spend?: string; frequency?: string }>(`${account}/insights`, {
    level: "campaign",
    date_preset: "maximum",
    fields: "campaign_id,reach,impressions,inline_link_clicks,spend,frequency",
  });
  if (!life.ok) {
    summary.errors.push({ step: "insights cumulés", message: describeMetaError(life.error) });
  } else {
    for (const row of life.data) {
      const camp = local.get(row.campaign_id);
      if (!camp) continue;
      const lifetime = { reach: Number(row.reach ?? 0), impressions: Number(row.impressions ?? 0), clicks: Number(row.inline_link_clicks ?? 0), spendCents: Math.round(Number(row.spend ?? 0) * 100), frequency: Number(row.frequency ?? 0), at: new Date().toISOString() };
      const { error } = await db.from("ad_campaigns").update({ lifetime }).eq("id", camp.id);
      if (error && !/lifetime/.test(error.message)) summary.errors.push({ step: `cumul ${camp.name}`, message: error.message });
    }
  }

  // 4. L'avis de Meta sur les publicités que Boosteats a créées.
  for (const r of rows.filter((x) => x.ad_external_id)) {
    const ad = await metaGet<MetaAd>(r.ad_external_id as string, { fields: "id,effective_status,ad_review_feedback" }, { actor: "system", campaignId: r.id });
    if (!ad.ok) {
      summary.errors.push({ step: `publicité ${r.ad_external_id}`, message: describeMetaError(ad.error) });
      continue;
    }
    await db.from("ad_campaigns").update({ ad_status: ad.data.effective_status, ad_review_feedback: ad.data.ad_review_feedback ?? null }).eq("id", r.id);
    if (ad.data.effective_status === "DISAPPROVED") summary.disapproved.push({ campaignId: r.id, name: r.name, feedback: ad.data.ad_review_feedback ?? null });
  }

  // 5. Les demandes lancées avancent selon Meta.
  const launched = rows.filter((r) => r.request_id);
  if (launched.length) {
    const reqRes = await db.from("ad_requests").select("id, status, ends_on").in("id", launched.map((r) => r.request_id as string));
    const spentRes = await db.from("ad_daily_stats").select("campaign_id, spend_cents").in("campaign_id", launched.map((r) => r.id));
    if (reqRes.error || spentRes.error) {
      summary.errors.push({ step: "ad_requests", message: (reqRes.error ?? spentRes.error)!.message });
    } else {
      const spent = new Map<string, number>();
      for (const s of (spentRes.data ?? []) as { campaign_id: string; spend_cents: number }[]) spent.set(s.campaign_id, (spent.get(s.campaign_id) ?? 0) + s.spend_cents);
      const reqs = new Map(((reqRes.data ?? []) as { id: string; status: RequestStatus; ends_on: string | null }[]).map((q) => [q.id, q]));
      for (const r of launched) {
        const q = reqs.get(r.request_id as string);
        if (!q) continue;
        const next = statusFromMeta({ current: q.status, effectiveStatus: effOf.get(r.external_id) ?? null, spentCents: spent.get(r.id) ?? 0, capCents: capOf.get(r.external_id) ?? null, endsOn: q.ends_on, today });
        if (next === q.status) continue;
        const { error } = await db
          .from("ad_requests")
          .update({ status: next, ...(next === "terminee" ? { ended_at: new Date().toISOString() } : {}) })
          .eq("id", q.id)
          .eq("status", q.status);
        if (error) summary.errors.push({ step: `demande ${q.id}`, message: error.message });
        else if (next === "terminee") summary.ended.push(q.id);
      }
    }
  }

  return finish();
}
