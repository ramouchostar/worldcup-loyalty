import { createAdminClient } from "../supabase";
import { isMissingTable } from "../funnel";
import { pubConfig } from "./config";
import { adPreview } from "./campaigns";
import { adAccount, metaGetAll } from "./meta-api";
import { OBJECTIVE_RESULT, type Objective } from "./objectives";

// ADR 0086 « Trace » — ce que /platform/pub montre à Mehdi : les chiffres qui doivent
// rester à zéro en tête, puis ses gestes (virements, lancements, factures, rattachements).

const DAY = 86_400_000;

export type PlatformPub = {
  ok: true;
  missing: string[];
  trace: {
    toConfirm: number;
    paymentsLate: number;
    toLaunch: number;
    invoicesMissing48h: number;
    invoicesToIssue: number;
    unattachedSpend7dCents: number;
    activeWithoutCap: number;
    capOverPaid: number;
    disapproved: number;
    apiFailures24h: number;
    alertMailsFailed7d: number;
    medianPaidToLaunchHours: number | null;
    lastRun: { at: string; ok: boolean | null; read: number; errors: number } | null;
  };
  notices: { id: string; restaurantName: string; clientCode: string | null; kind: string; ref: string; budgetCents: number; feeCents: number; expectedCents: number; createdAt: string; requestStatus: string; objective: string }[];
  toLaunch: { requestId: string; restaurantName: string; campaignName: string | null; objective: string; startsOn: string | null; endsOn: string | null; radiusKm: number | null; dailyCents: number | null; capCents: number | null; paidCents: number; adText: string | null; preview: string | null; status: string; adStatus: string | null }[];
  stuck: { requestId: string; restaurantName: string; status: string; objective: string }[];
  invoices: { id: string; restaurantName: string; clientCode: string | null; legalName: string | null; vat: string | null; address: string | null; budgetCents: number; feeCents: number; vatCents: number; expectedCents: number; receivedCents: number | null; receivedOn: string | null; ref: string; confirmedAt: string }[];
  unattached: { id: string; name: string; problem: string | null; spend7dCents: number }[];
  campaigns: { id: string; name: string; restaurantName: string | null; status: string | null; paidCents: number | null; spentCents: number; capCents: number | null; results: number; resultKind: string | null; warnings: string[]; adStatus: string | null }[];
  restaurants: { id: string; name: string; clientCode: string; pageName: string | null; igUsername: string | null }[];
  failures: { at: string; path: string; error: string | null }[];
};

export async function loadPlatformPub(): Promise<PlatformPub | { ok: false }> {
  const db = createAdminClient();
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY).toISOString().slice(0, 10);

  const [reqs, notices, credits, camps, stats, rests, idents, billing, runs, fails, mails] = await Promise.all([
    db.from("ad_requests").select("*"),
    db.from("ad_payment_notices").select("*").order("created_at"),
    db.from("ad_credit_transactions").select("request_id, amount_cents"),
    db.from("ad_campaigns").select("*").order("last_seen_at", { ascending: false }),
    db.from("ad_daily_stats").select("campaign_id, day, spend_cents, results, result_kind"),
    db.from("restaurants").select("id, name, client_code").not("client_code", "is", null).order("client_code"),
    db.from("restaurant_ad_identities").select("*"),
    db.from("restaurant_billing").select("*"),
    db.from("ad_sync_runs").select("*").order("started_at", { ascending: false }).limit(1),
    db.from("ad_api_calls").select("at, path, error").eq("ok", false).order("at", { ascending: false }).limit(15),
    db.from("message_sends").select("status").eq("message_key", "pub_alert").gte("created_at", new Date(now - 7 * DAY).toISOString()),
  ]);
  if (reqs.error) {
    if (!isMissingTable(reqs.error)) console.error("[ads/platform]", reqs.error.message);
    return { ok: false };
  }

  type Req = { id: string; restaurant_id: string; objective: string; status: string; starts_on: string | null; ends_on: string | null; budget_cents: number; targeting: { radiusKm?: number } | null; ad_text: string | null; paid_at: string | null; launched_at: string | null };
  type Notice = { id: string; request_id: string; restaurant_id: string; kind: string; budget_cents: number; fee_cents: number; vat_cents: number; expected_cents: number; structured_ref: string; received_cents: number | null; received_on: string | null; confirmed_at: string | null; invoice_number: string | null; created_at: string };
  type Camp = { id: string; name: string; restaurant_id: string | null; request_id: string | null; status: string | null; effective_status: string | null; spend_cap_cents: number | null; attach_problem: string | null; warnings: string[]; ad_external_id: string | null; ad_status: string | null };

  const R = (reqs.data ?? []) as Req[];
  const N = (notices.data ?? []) as Notice[];
  const C = (camps.data ?? []) as Camp[];
  const S = (stats.data ?? []) as { campaign_id: string; day: string; spend_cents: number; results: number; result_kind: string | null }[];
  const restName = new Map(((rests.data ?? []) as { id: string; name: string; client_code: string }[]).map((r) => [r.id, r]));
  const bill = new Map(((billing.data ?? []) as { restaurant_id: string; legal_name: string; vat_number: string | null; address: string }[]).map((b) => [b.restaurant_id, b]));
  const ident = new Map(((idents.data ?? []) as { restaurant_id: string; meta_page_name: string | null; instagram_username: string | null }[]).map((i) => [i.restaurant_id, i]));
  const paid = new Map<string, number>();
  for (const t of (credits.data ?? []) as { request_id: string; amount_cents: number }[]) paid.set(t.request_id, (paid.get(t.request_id) ?? 0) + t.amount_cents);
  const spent = (cid: string, since?: string) => S.filter((s) => s.campaign_id === cid && (!since || s.day >= since)).reduce((n, s) => n + s.spend_cents, 0);
  const reqById = new Map(R.map((r) => [r.id, r]));
  const nameOf = (rid: string) => restName.get(rid)?.name ?? rid;
  const label = (o: string) => OBJECTIVE_RESULT[o as Objective]?.label ?? o;

  const open = N.filter((n) => !n.confirmed_at && reqById.get(n.request_id)?.status !== "annulee");
  const confirmed = N.filter((n) => n.confirmed_at);
  const noInvoice = confirmed.filter((n) => !n.invoice_number);
  const unattached = C.filter((c) => !c.restaurant_id).map((c) => ({ id: c.id, name: c.name, problem: c.attach_problem, spend7dCents: spent(c.id, since7) }));
  const active = C.filter((c) => c.effective_status === "ACTIVE");
  const delays = R.filter((r) => r.paid_at && r.launched_at).map((r) => (Date.parse(r.launched_at as string) - Date.parse(r.paid_at as string)) / 3_600_000).sort((a, b) => a - b);
  const run = (runs.data ?? [])[0] as { started_at: string; ok: boolean | null; campaigns_read: number; errors: number } | undefined;

  const prepared = R.filter((r) => r.status === "preparee");
  const toLaunch = await Promise.all(
    prepared.map(async (r) => {
      const c = C.find((x) => x.request_id === r.id) ?? null;
      const days = r.starts_on && r.ends_on ? Math.round((Date.parse(r.ends_on) - Date.parse(r.starts_on)) / DAY) + 1 : null;
      return {
        requestId: r.id,
        restaurantName: nameOf(r.restaurant_id),
        campaignName: c?.name ?? null,
        objective: label(r.objective),
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        radiusKm: r.targeting?.radiusKm ?? null,
        dailyCents: days ? Math.floor(r.budget_cents / days) : null,
        capCents: c?.spend_cap_cents ?? null,
        paidCents: paid.get(r.id) ?? 0,
        adText: r.ad_text,
        preview: c?.ad_external_id ? await adPreview(c.ad_external_id) : null,
        status: r.status,
        adStatus: c?.ad_status ?? null,
      };
    })
  );

  const mailRows = (mails.data ?? []) as { status: string }[];

  return {
    ok: true,
    missing: pubConfig().missing,
    trace: {
      toConfirm: open.length,
      paymentsLate: open.filter((n) => now - Date.parse(n.created_at) > 7 * DAY).length,
      toLaunch: prepared.length,
      invoicesMissing48h: noInvoice.filter((n) => now - Date.parse(n.confirmed_at as string) > 2 * DAY).length,
      invoicesToIssue: noInvoice.length,
      unattachedSpend7dCents: unattached.reduce((n, c) => n + c.spend7dCents, 0),
      activeWithoutCap: active.filter((c) => !c.spend_cap_cents).length,
      capOverPaid: active.filter((c) => c.request_id && (c.spend_cap_cents ?? 0) > (paid.get(c.request_id) ?? 0)).length,
      disapproved: C.filter((c) => c.ad_status === "DISAPPROVED").length,
      apiFailures24h: ((fails.data ?? []) as { at: string }[]).filter((f) => now - Date.parse(f.at) < DAY).length,
      alertMailsFailed7d: mailRows.filter((m) => m.status === "failed").length,
      medianPaidToLaunchHours: delays.length ? Math.round(delays[Math.floor(delays.length / 2)]) : null,
      lastRun: run ? { at: run.started_at, ok: run.ok, read: run.campaigns_read, errors: run.errors } : null,
    },
    notices: open.map((n) => {
      const r = reqById.get(n.request_id);
      return { id: n.id, restaurantName: nameOf(n.restaurant_id), clientCode: restName.get(n.restaurant_id)?.client_code ?? null, kind: n.kind, ref: n.structured_ref, budgetCents: n.budget_cents, feeCents: n.fee_cents, expectedCents: n.expected_cents, createdAt: n.created_at, requestStatus: r?.status ?? "?", objective: label(r?.objective ?? "") };
    }),
    toLaunch,
    stuck: R.filter((r) => r.status === "payee" || r.status === "a_corriger").map((r) => ({ requestId: r.id, restaurantName: nameOf(r.restaurant_id), status: r.status, objective: label(r.objective) })),
    invoices: noInvoice.map((n) => {
      const b = bill.get(n.restaurant_id);
      return { id: n.id, restaurantName: nameOf(n.restaurant_id), clientCode: restName.get(n.restaurant_id)?.client_code ?? null, legalName: b?.legal_name ?? null, vat: b?.vat_number ?? null, address: b?.address ?? null, budgetCents: n.budget_cents, feeCents: n.fee_cents, vatCents: n.vat_cents, expectedCents: n.expected_cents, receivedCents: n.received_cents, receivedOn: n.received_on, ref: n.structured_ref, confirmedAt: n.confirmed_at as string };
    }),
    unattached,
    campaigns: C.map((c) => {
      const s = S.filter((x) => x.campaign_id === c.id);
      return { id: c.id, name: c.name, restaurantName: c.restaurant_id ? nameOf(c.restaurant_id) : null, status: c.effective_status ?? c.status, paidCents: c.request_id ? (paid.get(c.request_id) ?? 0) : null, spentCents: s.reduce((n, x) => n + x.spend_cents, 0), capCents: c.spend_cap_cents, results: s.reduce((n, x) => n + x.results, 0), resultKind: s.find((x) => x.result_kind)?.result_kind ?? null, warnings: c.warnings ?? [], adStatus: c.ad_status };
    }),
    restaurants: ((rests.data ?? []) as { id: string; name: string; client_code: string }[]).map((r) => ({ id: r.id, name: r.name, clientCode: r.client_code, pageName: ident.get(r.id)?.meta_page_name ?? null, igUsername: ident.get(r.id)?.instagram_username ?? null })),
    failures: (fails.data ?? []) as { at: string; path: string; error: string | null }[],
  };
}

/** Pages Facebook et comptes Instagram que le System User peut utiliser pour signer une pub. */
export async function metaIdentities(): Promise<{ pages: { id: string; name: string }[]; instagram: { id: string; username: string }[] }> {
  const account = adAccount();
  if (!account) return { pages: [], instagram: [] };
  const [pages, ig] = await Promise.all([
    metaGetAll<{ id: string; name: string }>(`${account}/promote_pages`, { fields: "id,name" }),
    metaGetAll<{ id: string; username: string }>(`${account}/instagram_accounts`, { fields: "id,username" }),
  ]);
  return { pages: pages.ok ? pages.data : [], instagram: ig.ok ? ig.data : [] };
}
