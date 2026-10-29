import { createAdminClient } from "../supabase";
import { getPlan } from "../entitlements";
import { isMissingTable } from "../funnel";
import { pubConfig, pubEnabledFor } from "./config";
import { alertPlatform, notifyRestaurant } from "./alerts";
import { CREATIVES_BUCKET, prepareCampaign, raiseCap, resetCreative, setDelivery } from "./campaigns";
import { adAccount, metaGet } from "./meta-api";
import { DEFAULT_BENCHMARKS, calibrate, estimateResults, type Estimate, type Observed } from "./estimate";
import { OBJECTIVE_RESULT, type Objective } from "./objectives";
import { META_SPEC, buildTargeting, isOpenObjective, judgeContent, judgeRequest, rankInstagramPosts, REQUEST_ISSUE_TEXT, type IgMedia, type OpenObjective, type RequestStatus } from "./meta-spec";
import { formatEur, isLowCredit, MIN_BUDGET_CENTS, quote, daysLeft } from "./money";
import { structuredRef } from "./structured-ref";
import { todayBrussels } from "./sync";

// ADR 0086 §1-5 — le parcours d'une demande de pub, côté restaurateur et côté plateforme.
// Tout passe par le serveur (service-role) ; les gardes d'accès sont dans les Server Actions.
// Chaque étape prévient la bonne personne (lib/ads/alerts.ts) et chaque échec se dit.

const OBJECTIVE_LABEL = (o: string) => OBJECTIVE_RESULT[o as Objective]?.label ?? o;
const dateFr = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");

export type Availability =
  | { open: true; identity: { pageName: string | null; igUsername: string | null; igUserId: string | null }; missing: string[] }
  | { open: false; reason: "tables" | "config" | "not_enabled"; missing: string[] };

/** La Pub est-elle ouverte pour cet établissement ? `PUB_RESTAURANTS` = liste d'identifiants ou « * ». */
export async function pubAvailability(restaurantId: string, isSuperAdmin: boolean): Promise<Availability> {
  const cfg = pubConfig();
  if (!pubEnabledFor(restaurantId, isSuperAdmin)) return { open: false, reason: "not_enabled", missing: [] };
  const { data, error } = await createAdminClient().from("restaurant_ad_identities").select("meta_page_name, instagram_username, instagram_user_id").eq("restaurant_id", restaurantId).maybeSingle();
  if (error) return { open: false, reason: "tables", missing: [] };
  const needed = cfg.missing.filter((m) => m !== "PUB_ALERT_EMAIL");
  if (needed.length) return { open: false, reason: "config", missing: needed };
  const d = data as { meta_page_name: string | null; instagram_username: string | null; instagram_user_id: string | null } | null;
  return { open: true, identity: { pageName: d?.meta_page_name ?? null, igUsername: d?.instagram_username ?? null, igUserId: d?.instagram_user_id ?? null }, missing: cfg.missing };
}

// ── Lecture : la page Pub d'un établissement ─────────────────

export type NoticeView = { id: string; kind: "initial" | "recharge"; budgetCents: number; feeCents: number; vatCents: number; expectedCents: number; ref: string; confirmedAt: string | null; createdAt: string };
export type RequestView = {
  id: string;
  seq: number;
  objective: string;
  objectiveLabel: string;
  resultLabel: string;
  version: number;
  status: RequestStatus;
  budgetCents: number;
  startsOn: string | null;
  endsOn: string | null;
  radiusKm: number | null;
  adText: string | null;
  creative: { kind: string; thumbnail?: string | null; permalink?: string | null; mediaType?: string } | null;
  correctionReason: string | null;
  createdAt: string;
  paidCents: number;
  spentCents: number;
  results: number;
  reach: number;
  clicks: number;
  daysLeft: number | null;
  lowCredit: boolean;
  campaignName: string | null;
  adStatus: string | null;
  notices: NoticeView[];
};

type Notice = { id: string; request_id: string; kind: "initial" | "recharge"; budget_cents: number; fee_cents: number; vat_cents: number; expected_cents: number; structured_ref: string; confirmed_at: string | null; created_at: string };

export async function listRequests(restaurantId: string): Promise<{ ok: true; requests: RequestView[]; billing: Billing | null } | { ok: false }> {
  const db = createAdminClient();
  const reqRes = await db.from("ad_requests").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
  if (reqRes.error) {
    if (!isMissingTable(reqRes.error)) console.error("[ads/requests] listRequests:", reqRes.error.message);
    return { ok: false };
  }
  const reqs = (reqRes.data ?? []) as Record<string, unknown>[];
  const ids = reqs.map((r) => r.id as string);
  const [notices, credits, camps, billing] = await Promise.all([
    ids.length ? db.from("ad_payment_notices").select("*").in("request_id", ids).order("created_at") : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("ad_credit_transactions").select("request_id, amount_cents").in("request_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("ad_campaigns").select("id, request_id, name, ad_status").in("request_id", ids) : Promise.resolve({ data: [], error: null }),
    getBilling(restaurantId),
  ]);
  const campRows = (camps.data ?? []) as { id: string; request_id: string; name: string; ad_status: string | null }[];
  const stats = campRows.length
    ? await db.from("ad_daily_stats").select("campaign_id, day, spend_cents, results, reach, clicks").in("campaign_id", campRows.map((c) => c.id)).order("day")
    : { data: [] };
  const statRows = (stats.data ?? []) as { campaign_id: string; day: string; spend_cents: number; results: number; reach: number; clicks: number }[];

  const views = reqs.map((r): RequestView => {
    const id = r.id as string;
    const camp = campRows.find((c) => c.request_id === id) ?? null;
    const s = camp ? statRows.filter((x) => x.campaign_id === camp.id) : [];
    const paid = ((credits.data ?? []) as { request_id: string; amount_cents: number }[]).filter((c) => c.request_id === id).reduce((n, c) => n + c.amount_cents, 0);
    const spent = s.reduce((n, x) => n + x.spend_cents, 0);
    const recent = s.slice(-3).map((x) => x.spend_cents);
    const status = r.status as RequestStatus;
    const objective = r.objective as string;
    const creative = r.creative as RequestView["creative"];
    return {
      id,
      seq: r.seq as number,
      objective,
      objectiveLabel: OBJECTIVE_LABEL(objective),
      resultLabel: OBJECTIVE_RESULT[objective as Objective]?.result ?? "résultats",
      version: r.version as number,
      status,
      budgetCents: r.budget_cents as number,
      startsOn: (r.starts_on as string | null) ?? null,
      endsOn: (r.ends_on as string | null) ?? null,
      radiusKm: ((r.targeting as { radiusKm?: number } | null)?.radiusKm as number | undefined) ?? null,
      adText: (r.ad_text as string | null) ?? null,
      creative,
      correctionReason: (r.correction_reason as string | null) ?? null,
      createdAt: r.created_at as string,
      paidCents: paid,
      spentCents: spent,
      results: s.reduce((n, x) => n + x.results, 0),
      reach: s.reduce((n, x) => n + x.reach, 0),
      clicks: s.reduce((n, x) => n + x.clicks, 0),
      daysLeft: status === "en_diffusion" ? daysLeft(paid - spent, recent) : null,
      lowCredit: status === "en_diffusion" && isLowCredit(paid - spent, recent),
      campaignName: camp?.name ?? null,
      adStatus: camp?.ad_status ?? null,
      notices: ((notices.data ?? []) as Notice[]).filter((n) => n.request_id === id).map((n) => ({ id: n.id, kind: n.kind, budgetCents: n.budget_cents, feeCents: n.fee_cents, vatCents: n.vat_cents, expectedCents: n.expected_cents, ref: n.structured_ref, confirmedAt: n.confirmed_at, createdAt: n.created_at })),
    };
  });
  return { ok: true, requests: views, billing };
}

export type Billing = { legalName: string; vatNumber: string | null; address: string };

export async function getBilling(restaurantId: string): Promise<Billing | null> {
  const { data } = await createAdminClient().from("restaurant_billing").select("legal_name, vat_number, address").eq("restaurant_id", restaurantId).maybeSingle();
  const b = data as { legal_name: string; vat_number: string | null; address: string } | null;
  return b ? { legalName: b.legal_name, vatNumber: b.vat_number, address: b.address } : null;
}

/** Les publications Instagram du restaurateur au meilleur potentiel (ADR 0086 §6). */
export async function instagramPosts(restaurantId: string): Promise<{ ok: true; posts: IgMedia[] } | { ok: false; error: string }> {
  const { data } = await createAdminClient().from("restaurant_ad_identities").select("instagram_user_id").eq("restaurant_id", restaurantId).maybeSingle();
  const ig = (data as { instagram_user_id: string | null } | null)?.instagram_user_id;
  if (!ig) return { ok: false, error: "no_instagram" };
  const r = await metaGet<{ data: IgMedia[] }>(`${ig}/media`, { fields: "id,media_type,like_count,comments_count,timestamp,permalink,thumbnail_url,media_url,caption", limit: 50 }, { actor: "system" });
  if (!r.ok) return { ok: false, error: r.error.message };
  return { ok: true, posts: rankInstagramPosts(r.data.data ?? [], new Date()) };
}

// ── Ce que la pub peut donner (avant de payer) ───────────────

/** Personnes qui vivent ou passent dans la zone, selon Meta (lecture seule, aucune création). */
async function zoneAudience(restaurantId: string, objective: OpenObjective, radiusKm: number): Promise<{ lo: number; hi: number } | null> {
  const account = adAccount();
  if (!account) return null;
  const { data } = await createAdminClient().from("restaurants").select("lat, lng").eq("id", restaurantId).single();
  const geo = data as { lat: number | null; lng: number | null } | null;
  if (!geo || geo.lat === null || geo.lng === null) return null;
  const r = await metaGet<{ data: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number }[] }>(
    `${account}/delivery_estimate`,
    { targeting_spec: buildTargeting({ lat: geo.lat, lng: geo.lng, radiusKm }), optimization_goal: META_SPEC[objective].optimizationGoal },
    { actor: "system" },
  );
  const d = r.ok ? r.data.data?.[0] : undefined;
  return d?.estimate_mau_lower_bound && d.estimate_mau_upper_bound ? { lo: d.estimate_mau_lower_bound, hi: d.estimate_mau_upper_bound } : null;
}

/** Ce que nos propres campagnes de cet objectif ont coûté sur 90 jours (pour recaler les coûts de départ). */
async function observedCosts(objective: OpenObjective): Promise<Observed | null> {
  const db = createAdminClient();
  const camps = await db.from("ad_campaigns").select("id").eq("objective", objective).not("restaurant_id", "is", null);
  const ids = ((camps.data ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return null;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const st = await db.from("ad_daily_stats").select("spend_cents, impressions, clicks").in("campaign_id", ids).gte("day", since);
  const rows = (st.data ?? []) as { spend_cents: number; impressions: number; clicks: number }[];
  return rows.reduce((o, r) => ({ spendCents: o.spendCents + r.spend_cents, impressions: o.impressions + r.impressions, clicks: o.clicks + r.clicks }), { spendCents: 0, impressions: 0, clicks: 0 });
}

export async function estimateFor(restaurantId: string, objective: string, radiusKm: number, budgetCents: number): Promise<{ ok: true; estimate: Estimate } | { ok: false }> {
  if (!isOpenObjective(objective) || !(budgetCents > 0)) return { ok: false };
  const [audience, observed] = await Promise.all([zoneAudience(restaurantId, objective, radiusKm).catch(() => null), observedCosts(objective).catch(() => null)]);
  const { benchmark, calibrated } = calibrate(DEFAULT_BENCHMARKS[objective], observed);
  return { ok: true, estimate: estimateResults({ objective, budgetCents, audience, benchmark, calibrated }) };
}

// ── Le restaurateur demande ──────────────────────────────────

const UPLOAD_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };
/** La limite globale de Supabase Storage du projet (50 Mo, constatée le 2026-10-29) passe avant celle du bucket. */
export const MAX_CREATIVE_BYTES = 50 * 1024 * 1024;

export async function requestCreativeUpload(restaurantId: string, type: string, size: number): Promise<{ ok: true; path: string; uploadUrl: string } | { ok: false; error: string }> {
  const ext = UPLOAD_TYPES[type];
  if (!ext) return { ok: false, error: "Envoie une photo (JPG, PNG, WebP) ou une vidéo (MP4, MOV)." };
  if (!(size > 0 && size <= MAX_CREATIVE_BYTES)) return { ok: false, error: "Le fichier dépasse 50 Mo : envoie une version plus légère (une vidéo envoyée par WhatsApp est déjà compressée)." };
  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const signed = await createAdminClient().storage.from(CREATIVES_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { ok: false, error: "Envoi indisponible pour le moment." };
  return { ok: true, path, uploadUrl: signed.data.signedUrl };
}

/** Le fichier envoyé par le navigateur est-il bien là, dans le dossier de CET établissement ? */
async function uploadExists(restaurantId: string, path: string): Promise<boolean> {
  const [dir, file, extra] = path.split("/");
  if (dir !== restaurantId || !file || extra !== undefined) return false;
  const { data, error } = await createAdminClient().storage.from(CREATIVES_BUCKET).list(dir, { search: file, limit: 1 });
  return !error && (data ?? []).some((o) => o.name === file);
}

export type CreateResult = { ok: true; requestId: string } | { ok: false; error: string };

export async function createRequest(restaurantId: string, userId: string, raw: Record<string, unknown>): Promise<CreateResult> {
  const cfg = pubConfig();
  if (!cfg.payment) return { ok: false, error: "La Pub n'est pas encore ouverte (coordonnées de paiement absentes)." };
  const judged = judgeRequest(raw, todayBrussels());
  if (!judged.ok) return { ok: false, error: REQUEST_ISSUE_TEXT[judged.issue] };
  const input = judged.input;
  if (input.creative.kind === "upload" && !(await uploadExists(restaurantId, input.creative.path))) return { ok: false, error: "Ton fichier n'est pas arrivé : renvoie-le." };

  const db = createAdminClient();
  const { data: rest, error: e0 } = await db.from("restaurants").select("id, name, client_code").eq("id", restaurantId).single();
  if (e0 || !rest) return { ok: false, error: "Établissement introuvable." };
  const r = rest as { id: string; name: string; client_code: string | null };
  if (!r.client_code) return { ok: false, error: "Ton établissement n'a pas encore de code client : contacte-nous." };

  const { error: eb } = await db.from("restaurant_billing").upsert({ restaurant_id: restaurantId, legal_name: input.billing.legalName, vat_number: input.billing.vatNumber, address: input.billing.address, updated_by: userId, updated_at: new Date().toISOString() });
  if (eb) return { ok: false, error: "Coordonnées de facturation non enregistrées." };

  const plan = await getPlan(restaurantId);
  const q = quote({ budgetCents: input.budgetCents, plan, vatRate: cfg.vatRate });
  const prev = await db.from("ad_requests").select("seq, objective").eq("restaurant_id", restaurantId);
  if (prev.error) return { ok: false, error: "La Pub n'est pas encore disponible." };
  const rows = (prev.data ?? []) as { seq: number; objective: string }[];
  const seq = rows.reduce((m, x) => Math.max(m, x.seq), 0) + 1;
  const version = rows.filter((x) => x.objective === input.objective).length + 1;
  const ref = structuredRef(r.client_code, seq);

  const ins = await db
    .from("ad_requests")
    .insert({
      restaurant_id: restaurantId,
      seq,
      regie: "META",
      objective: input.objective,
      version,
      budget_cents: q.budgetCents,
      daily_budget_cents: null,
      fee_pct: q.feePct,
      vat_rate: q.vatRate,
      total_cents: q.totalCents,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      targeting: { radiusKm: input.radiusKm },
      creative: input.creative,
      ad_text: input.adText,
      offer_text: input.offer?.text ?? null,
      offer_keyword: input.offer?.keyword ?? null,
      offer_from: input.offer?.from ?? null,
      offer_to: input.offer?.to ?? null,
      estimate: await estimateFor(restaurantId, input.objective, input.radiusKm, input.budgetCents).then((e) => (e.ok ? e.estimate : null)),
      structured_ref: ref,
      terms_accepted_at: new Date().toISOString(),
      requested_by: userId,
    })
    .select("id")
    .single();
  if (ins.error) return { ok: false, error: "Demande non enregistrée, réessaie." };
  const requestId = (ins.data as { id: string }).id;
  const n = await db.from("ad_payment_notices").insert({ request_id: requestId, restaurant_id: restaurantId, kind: "initial", budget_cents: q.budgetCents, fee_cents: q.feeCents, vat_cents: q.vatCents, expected_cents: q.totalCents, structured_ref: ref, method: "transfer" });
  if (n.error) {
    await db.from("ad_requests").delete().eq("id", requestId);
    return { ok: false, error: "Demande non enregistrée, réessaie." };
  }

  const pay = cfg.payment;
  await notifyRestaurant("request_received", requestId, { restaurantId, restaurantName: r.name, requestedBy: userId }, {
    subject: `${r.name} — ta pub est demandée : virement de ${formatEur(q.totalCents)}`,
    title: "Plus qu'un virement",
    intro: "Dès qu'il arrive, on prépare ta pub, on la vérifie et on la met en ligne. On te prévient à chaque étape.",
    rows: [
      ["Montant", formatEur(q.totalCents)],
      ["Communication structurée", ref],
      ["Bénéficiaire", pay.holder],
      ["IBAN", pay.iban.replace(/(.{4})/g, "$1 ").trim()],
      ["BIC", pay.bic],
    ],
    note: input.offer
      ? `Recopie la communication telle quelle : c'est elle qui relie ton virement à ta pub. Ton offre : « ${input.offer.text} », mot clé ${input.offer.keyword}, du ${dateFr(input.offer.from)} au ${dateFr(input.offer.to)} — préviens tes équipes.`
      : "Recopie la communication telle quelle : c'est elle qui relie ton virement à ta pub.",
  });
  await alertPlatform("payment_expected", requestId, {
    subject: `Pub — ${r.client_code} ${r.name} : virement attendu ${formatEur(q.totalCents)}`,
    title: "Nouvelle demande de pub",
    lines: [`${r.name} demande une pub « ${OBJECTIVE_LABEL(input.objective)} ». Virement attendu.`],
    rows: [
      ["Communication", ref],
      ["Montant", formatEur(q.totalCents)],
      ["Budget", formatEur(q.budgetCents)],
      ["Frais", `${formatEur(q.feeCents)} (${q.feePct} %)`],
      ["Dates", `${dateFr(input.startsOn)} → ${dateFr(input.endsOn)}`],
      ...(input.offer ? ([["Offre", `${input.offer.text} — mot clé ${input.offer.keyword} (${dateFr(input.offer.from)} → ${dateFr(input.offer.to)})`]] as [string, string][]) : []),
    ],
  });
  return { ok: true, requestId };
}

async function requestOf(restaurantId: string, requestId: string) {
  const { data } = await createAdminClient().from("ad_requests").select("*").eq("id", requestId).eq("restaurant_id", restaurantId).maybeSingle();
  return data as (Record<string, unknown> & { status: RequestStatus; requested_by: string | null }) | null;
}

export async function cancelRequest(restaurantId: string, requestId: string): Promise<{ ok: boolean; error?: string }> {
  const q = await requestOf(restaurantId, requestId);
  if (!q) return { ok: false, error: "Demande introuvable." };
  if (q.status !== "paiement_attendu") return { ok: false, error: "Une pub payée ne s'annule plus : mets-la en pause." };
  const { error } = await createAdminClient().from("ad_requests").update({ status: "annulee", cancelled_at: new Date().toISOString() }).eq("id", requestId).eq("status", "paiement_attendu");
  return error ? { ok: false, error: "Annulation impossible, réessaie." } : { ok: true };
}

/** Pause et reprise par le restaurateur, sans validation (ADR 0086 §1). */
export async function setPaused(restaurantId: string, requestId: string, paused: boolean, userId: string): Promise<{ ok: boolean; error?: string }> {
  const q = await requestOf(restaurantId, requestId);
  if (!q) return { ok: false, error: "Demande introuvable." };
  if (q.status !== (paused ? "en_diffusion" : "en_pause")) return { ok: false, error: paused ? "Cette pub n'est pas en diffusion." : "Cette pub n'est pas en pause." };
  const r = await setDelivery(requestId, !paused, userId);
  if (!r.ok) {
    await alertPlatform("api_failed", requestId, { subject: "Pub — pause/reprise en échec", title: "Appel Meta en échec", lines: [r.error] }, false);
    return { ok: false, error: "Meta n'a pas répondu, réessaie dans un instant." };
  }
  await createAdminClient().from("ad_requests").update({ status: paused ? "en_pause" : "en_diffusion" }).eq("id", requestId);
  return { ok: true };
}

/** Un complément de budget : un nouveau virement attendu, même communication que la demande. */
export async function requestRecharge(restaurantId: string, requestId: string, budgetEuros: number): Promise<{ ok: boolean; error?: string }> {
  const cfg = pubConfig();
  const q = await requestOf(restaurantId, requestId);
  if (!q) return { ok: false, error: "Demande introuvable." };
  if (!["preparee", "en_diffusion", "en_pause", "terminee"].includes(q.status)) return { ok: false, error: "Ajoute du budget une fois la première pub payée." };
  if (!Number.isInteger(budgetEuros) || budgetEuros * 100 < MIN_BUDGET_CENTS / 2) return { ok: false, error: "Un complément est de 50 € au moins, en euros ronds." };
  const db = createAdminClient();
  const open = await db.from("ad_payment_notices").select("id").eq("request_id", requestId).is("confirmed_at", null).limit(1);
  if ((open.data ?? []).length) return { ok: false, error: "Un virement est déjà attendu pour cette pub." };
  // Le plancher de 100 € vaut pour une campagne ; un complément relève un plafond déjà au-dessus.
  const budgetCents = budgetEuros * 100;
  const feeCents = Math.round((budgetCents * Number(q.fee_pct)) / 100);
  const vatCents = Math.round(((budgetCents + feeCents) * cfg.vatRate) / 100);
  const { error } = await db.from("ad_payment_notices").insert({ request_id: requestId, restaurant_id: restaurantId, kind: "recharge", budget_cents: budgetCents, fee_cents: feeCents, vat_cents: vatCents, expected_cents: budgetCents + feeCents + vatCents, structured_ref: q.structured_ref, method: "transfer" });
  if (error) return { ok: false, error: "Complément non enregistré, réessaie." };
  const { data: rest } = await db.from("restaurants").select("name, client_code").eq("id", restaurantId).single();
  const rr = rest as { name: string; client_code: string };
  await alertPlatform("payment_expected", `${requestId}-r${Date.now()}`, {
    subject: `Pub — ${rr.client_code} ${rr.name} : complément attendu ${formatEur(budgetCents + feeCents + vatCents)}`,
    title: "Complément de budget demandé",
    lines: [`${rr.name} ajoute ${formatEur(budgetCents)} de budget. Virement attendu.`],
    rows: [["Communication", q.structured_ref as string], ["Montant", formatEur(budgetCents + feeCents + vatCents)]],
  });
  return { ok: true };
}

/** Après « Renvoyer » : le restaurateur corrige le texte et/ou la création, la pub repart en préparation. */
export async function resubmit(restaurantId: string, requestId: string, raw: { adText?: unknown; creative?: unknown }, userId: string): Promise<{ ok: boolean; error?: string }> {
  const q = await requestOf(restaurantId, requestId);
  if (!q || q.status !== "a_corriger") return { ok: false, error: "Rien à corriger sur cette pub." };
  if (!isOpenObjective(q.objective as string)) return { ok: false, error: REQUEST_ISSUE_TEXT.objective };
  const judged = judgeContent(q.objective as OpenObjective, raw.adText ?? q.ad_text, raw.creative ?? q.creative);
  if (!judged.ok) return { ok: false, error: REQUEST_ISSUE_TEXT[judged.issue] };
  if (judged.creative.kind === "upload" && !(await uploadExists(restaurantId, judged.creative.path))) return { ok: false, error: "Ton fichier n'est pas arrivé : renvoie-le." };
  const db = createAdminClient();
  const reset = await resetCreative(requestId, userId);
  if (!reset.ok) return { ok: false, error: "Préparation impossible pour le moment, réessaie." };
  await db.from("ad_requests").update({ ad_text: judged.adText, creative: judged.creative }).eq("id", requestId);
  const prep = await prepareCampaign(requestId, userId);
  if (!prep.ok) {
    await alertPlatform("prepare_failed", requestId, { subject: "Pub — préparation en échec après correction", title: "Préparation en échec", lines: [prep.error] }, false);
    return { ok: true };
  }
  await alertPlatform("to_launch", requestId, { subject: "Pub — corrigée, à relancer", title: "Une pub corrigée attend ta validation", lines: [`Demande ${requestId} corrigée par le restaurateur.`] }, false);
  return { ok: true };
}

// ── La plateforme : les deux gestes de Mehdi (ADR 0086 §2) ───

async function restaurantOf(id: string) {
  const { data } = await createAdminClient().from("restaurants").select("id, name, client_code").eq("id", id).single();
  return data as { id: string; name: string; client_code: string | null };
}

/**
 * Geste 1 : un virement est arrivé. Crédite le registre (budget seul), prépare la facture
 * à émettre, puis crée la campagne en pause (demande initiale) ou relève le plafond (complément).
 */
export async function confirmPayment(noticeId: string, receivedCents: number, receivedOn: string, userId: string): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const db = createAdminClient();
  const { data: n0, error } = await db.from("ad_payment_notices").select("*").eq("id", noticeId).single();
  if (error || !n0) return { ok: false, error: "Paiement introuvable." };
  const n = n0 as Notice & { restaurant_id: string; request_id: string };
  if (n.confirmed_at) return { ok: false, error: "Déjà confirmé." };
  if (!(receivedCents > 0)) return { ok: false, error: "Montant reçu invalide." };

  const upd = await db.from("ad_payment_notices").update({ received_cents: receivedCents, received_on: receivedOn, confirm_source: "manual", confirmed_by: userId, confirmed_at: new Date().toISOString() }).eq("id", noticeId).is("confirmed_at", null).select("id");
  if (upd.error || !(upd.data ?? []).length) return { ok: false, error: "Confirmation non enregistrée." };
  const credit = await db.from("ad_credit_transactions").insert({ restaurant_id: n.restaurant_id, request_id: n.request_id, kind: "versement", amount_cents: n.budget_cents, payment_notice_id: noticeId, created_by: userId });
  if (credit.error && credit.error.code !== "23505") return { ok: false, error: `Crédit non enregistré : ${credit.error.message}` };

  const rest = await restaurantOf(n.restaurant_id);
  const { data: reqData } = await db.from("ad_requests").select("id, status, requested_by, objective").eq("id", n.request_id).single();
  const req = reqData as { id: string; status: RequestStatus; requested_by: string | null; objective: string };
  const billing = await getBilling(n.restaurant_id);
  const gap = receivedCents - n.expected_cents;

  await alertPlatform("invoice_to_issue", noticeId, {
    subject: `Pub — facture à émettre dans Accountable : ${rest.name} ${formatEur(n.expected_cents)}`,
    title: "Facture à émettre",
    lines: ["Émets la facture dans Accountable (Peppol), puis reporte son numéro sur /platform/pub.", ...(gap !== 0 ? [`Attention : reçu ${formatEur(receivedCents)} pour ${formatEur(n.expected_cents)} attendus.`] : [])],
    rows: [
      ["Client", billing?.legalName ?? rest.name],
      ["TVA client", billing?.vatNumber ?? "—"],
      ["Adresse", billing?.address ?? "—"],
      [`Campagne publicitaire ${rest.client_code} — budget de diffusion`, formatEur(n.budget_cents)],
      ["Frais de service", formatEur(n.fee_cents)],
      ...(n.vat_cents ? ([["TVA", formatEur(n.vat_cents)]] as [string, string][]) : ([["Mention", "Régime particulier de la franchise de taxe"]] as [string, string][])),
      ["Total", formatEur(n.expected_cents)],
      ["Payé le", receivedOn],
      ["Communication", n.structured_ref],
    ],
  }, false);

  await notifyRestaurant("payment_received", noticeId, { restaurantId: rest.id, restaurantName: rest.name, requestedBy: req.requested_by }, {
    subject: `${rest.name} — virement reçu, on prépare ta pub`,
    title: "Virement reçu",
    intro: n.kind === "recharge" ? `${formatEur(n.budget_cents)} ajoutés au budget de ta pub.` : "On prépare ta pub et on la vérifie avant de la mettre en ligne.",
    rows: [["Reçu", formatEur(receivedCents)], ["Budget de diffusion", formatEur(n.budget_cents)]],
  });

  if (n.kind === "recharge") {
    const r = await raiseCap(req.id, n.budget_cents, userId, todayBrussels());
    if (!r.ok) {
      await alertPlatform("api_failed", noticeId, { subject: "Pub — plafond non relevé", title: "Appel Meta en échec", lines: [r.error] }, false);
      return { ok: true, warning: `Crédité, mais le plafond n'a pas été relevé chez Meta : ${r.error}` };
    }
    if (req.status === "terminee" || req.status === "en_pause") {
      const d = await setDelivery(req.id, true, userId);
      if (d.ok) await db.from("ad_requests").update({ status: "en_diffusion", ended_at: null }).eq("id", req.id);
      else return { ok: true, warning: `Plafond relevé, relance impossible : ${d.error}` };
    }
    return { ok: true };
  }

  await db.from("ad_requests").update({ status: "payee", paid_at: new Date().toISOString() }).eq("id", req.id).eq("status", "paiement_attendu");
  const prep = await prepareCampaign(req.id, userId);
  if (!prep.ok) {
    await alertPlatform("prepare_failed", req.id, { subject: `Pub — ${rest.name} : préparation chez Meta en échec`, title: "Préparation en échec", lines: [prep.error, "Corrige la cause puis « Préparer » sur /platform/pub."] }, false);
    return { ok: true, warning: `Payée, mais la campagne n'a pas pu être créée : ${prep.error}` };
  }
  await alertPlatform("to_launch", req.id, { subject: `Pub — ${rest.name} : campagne prête à lancer`, title: "Une campagne attend ta validation", lines: [`${OBJECTIVE_LABEL(req.objective)} — vérifie l'aperçu, puis « Lancer ».`] }, false);
  return { ok: true };
}

export async function retryPrepare(requestId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await prepareCampaign(requestId, userId);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Geste 2a : « Lancer » — les trois niveaux passent en diffusion. */
export async function launchRequest(requestId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const { data } = await db.from("ad_requests").select("id, status, restaurant_id, requested_by, objective, starts_on, offer_text, offer_keyword, offer_from, offer_to").eq("id", requestId).single();
  const q = data as { id: string; status: RequestStatus; restaurant_id: string; requested_by: string | null; objective: string; starts_on: string; offer_text: string | null; offer_keyword: string | null; offer_from: string | null; offer_to: string | null } | null;
  if (!q || q.status !== "preparee") return { ok: false, error: "Cette demande n'est pas prête à lancer." };
  const r = await setDelivery(requestId, true, userId);
  if (!r.ok) return { ok: false, error: r.error };
  await db.from("ad_requests").update({ status: "en_diffusion", launched_at: new Date().toISOString(), launched_by: userId }).eq("id", requestId);
  const rest = await restaurantOf(q.restaurant_id);
  await notifyRestaurant("launched", requestId, { restaurantId: rest.id, restaurantName: rest.name, requestedBy: q.requested_by }, {
    subject: `${rest.name} — ta pub est validée`,
    title: "Ta pub est validée",
    intro: `Elle part en diffusion le ${dateFr(q.starts_on)}, après le dernier contrôle de Meta. Tes chiffres arrivent dans ta console chaque matin.`,
    ...(q.offer_text && q.offer_keyword
      ? {
          rows: [["Offre", q.offer_text], ["Mot clé à dire au comptoir", q.offer_keyword], ["Valable", `du ${dateFr(q.offer_from)} au ${dateFr(q.offer_to)}`]] as [string, string][],
          note: "Préviens tes équipes en salle : des clients vont venir avec ce mot clé.",
        }
      : {}),
  });
  return { ok: true };
}

/** Geste 2b : « Renvoyer » avec un motif — le restaurateur corrige texte ou création. */
export async function sendBack(requestId: string, reason: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const motive = reason.trim();
  if (motive.length < 5) return { ok: false, error: "Écris le motif (5 caractères au moins)." };
  const db = createAdminClient();
  const { data } = await db.from("ad_requests").select("id, status, restaurant_id, requested_by").eq("id", requestId).single();
  const q = data as { id: string; status: RequestStatus; restaurant_id: string; requested_by: string | null } | null;
  if (!q || !["preparee", "payee"].includes(q.status)) return { ok: false, error: "Cette demande ne peut pas être renvoyée." };
  await db.from("ad_requests").update({ status: "a_corriger", correction_reason: motive }).eq("id", requestId);
  const rest = await restaurantOf(q.restaurant_id);
  await notifyRestaurant("send_back", `${requestId}-${Date.now()}`, { restaurantId: rest.id, restaurantName: rest.name, requestedBy: q.requested_by }, {
    subject: `${rest.name} — ta pub est à retoucher`,
    title: "Une retouche avant la mise en ligne",
    intro: motive,
    note: "Corrige-la depuis ta console : elle repart en vérification aussitôt.",
  }, false);
  return { ok: true };
}

export async function setInvoiceNumber(noticeId: string, invoiceNumber: string): Promise<{ ok: boolean; error?: string }> {
  const num = invoiceNumber.trim();
  if (num.length < 2 || num.length > 40) return { ok: false, error: "Numéro de facture invalide." };
  const { error } = await createAdminClient().from("ad_payment_notices").update({ invoice_number: num, invoice_issued_at: new Date().toISOString() }).eq("id", noticeId).not("confirmed_at", "is", null);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function attachManually(campaignId: string, restaurantId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createAdminClient().from("ad_campaigns").update({ restaurant_id: restaurantId, attach_source: "manual", attached_by: userId, attach_problem: null }).eq("id", campaignId).is("restaurant_id", null);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setIdentity(restaurantId: string, page: { id: string; name: string }, ig: { id: string; username: string } | null, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createAdminClient().from("restaurant_ad_identities").upsert({ restaurant_id: restaurantId, meta_page_id: page.id, meta_page_name: page.name, instagram_user_id: ig?.id ?? null, instagram_username: ig?.username ?? null, updated_by: userId, updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}
