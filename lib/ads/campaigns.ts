import { createAdminClient } from "../supabase";
import { campaignName, freeSegment } from "./naming";
import { adAccount, describeMetaError, metaDelete, metaGet, metaPost, type CallContext } from "./meta-api";
import { META_SPEC, buildTargeting, dailyBudgetCents, isOpenObjective, metaTimes, type Creative } from "./meta-spec";
import { spendCapCents } from "./money";

// ADR 0086 §2, §4, §6 — les écritures chez Meta. Tout est créé EN PAUSE : seul le geste
// « Lancer » de Mehdi met une campagne en diffusion. Plafond de campagne = total payé
// (Meta arrête la diffusion pile au budget, pas de reliquat). Chaque appel est journalisé
// par lib/ads/meta-api.ts ; une étape qui échoue s'arrête là et le dit, rien n'est deviné.

export const CREATIVES_BUCKET = "ad-creatives";
export const PAYOR = "Boosteats";

export type RequestRow = {
  id: string;
  restaurant_id: string;
  seq: number;
  objective: string;
  version: number;
  status: string;
  budget_cents: number;
  starts_on: string | null;
  ends_on: string | null;
  targeting: { radiusKm?: number };
  creative: Creative | null;
  ad_text: string | null;
  requested_by: string | null;
};

type Restaurant = { id: string; name: string; client_code: string | null; lat: number | null; lng: number | null; google_place_id: string | null };
type Identity = { meta_page_id: string; instagram_user_id: string | null };

export type StepResult = { ok: true } | { ok: false; error: string };

/** Le lien de la publicité : l'itinéraire vers le restaurant sur Google Maps. */
export function restaurantLink(r: Pick<Restaurant, "lat" | "lng" | "google_place_id" | "name">): string {
  const q = new URLSearchParams({ api: "1", query: `${r.lat},${r.lng}` });
  if (r.google_place_id) q.set("query_place_id", r.google_place_id);
  return `https://www.google.com/maps/search/?${q.toString()}`;
}

async function paidFor(requestId: string): Promise<number> {
  const { data, error } = await createAdminClient().from("ad_credit_transactions").select("amount_cents").eq("request_id", requestId);
  if (error) throw error;
  return ((data ?? []) as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0);
}

async function loadContext(requestId: string) {
  const db = createAdminClient();
  const { data: req, error } = await db.from("ad_requests").select("*").eq("id", requestId).single();
  if (error) throw error;
  const r = req as RequestRow;
  const [{ data: rest, error: e1 }, { data: ident, error: e2 }] = await Promise.all([
    db.from("restaurants").select("id, name, client_code, lat, lng, google_place_id").eq("id", r.restaurant_id).single(),
    db.from("restaurant_ad_identities").select("meta_page_id, instagram_user_id").eq("restaurant_id", r.restaurant_id).maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { req: r, rest: rest as Restaurant, ident: ident as Identity | null };
}

async function uploadCreativeFile(account: string, creative: Extract<Creative, { kind: "upload" }>, ctx: CallContext): Promise<{ ok: true; imageHash?: string; videoId?: string; thumbnail?: string } | { ok: false; error: string }> {
  const db = createAdminClient();
  if (creative.mime.startsWith("image/")) {
    const file = await db.storage.from(CREATIVES_BUCKET).download(creative.path);
    if (file.error || !file.data) return { ok: false, error: `photo introuvable dans le stockage : ${file.error?.message ?? creative.path}` };
    const bytes = Buffer.from(await file.data.arrayBuffer()).toString("base64");
    const r = await metaPost<{ images: Record<string, { hash: string }> }>(`${account}/adimages`, { bytes }, ctx);
    if (!r.ok) return { ok: false, error: `envoi de la photo à Meta : ${describeMetaError(r.error)}` };
    const hash = Object.values(r.data.images ?? {})[0]?.hash;
    return hash ? { ok: true, imageHash: hash } : { ok: false, error: "Meta n'a pas renvoyé d'empreinte d'image" };
  }
  const signed = await db.storage.from(CREATIVES_BUCKET).createSignedUrl(creative.path, 3600);
  if (signed.error || !signed.data) return { ok: false, error: `vidéo introuvable dans le stockage : ${signed.error?.message ?? creative.path}` };
  const r = await metaPost<{ id: string }>(`${account}/advideos`, { file_url: signed.data.signedUrl, name: creative.path.split("/").pop() }, ctx);
  if (!r.ok) return { ok: false, error: `envoi de la vidéo à Meta : ${describeMetaError(r.error)}` };
  // Meta traite la vidéo avant de donner une vignette : on attend jusqu'à ~90 s.
  for (let i = 0; i < 18; i++) {
    await new Promise((res) => setTimeout(res, 5000));
    const v = await metaGet<{ status?: { video_status?: string }; thumbnails?: { data: { uri: string; is_preferred: boolean }[] } }>(r.data.id, { fields: "status,thumbnails{uri,is_preferred}" }, ctx);
    if (!v.ok) continue;
    if (v.data.status?.video_status === "error") return { ok: false, error: "Meta n'a pas pu traiter la vidéo (format ?)" };
    const thumbs = v.data.thumbnails?.data ?? [];
    const thumb = thumbs.find((t) => t.is_preferred) ?? thumbs[0];
    if (v.data.status?.video_status === "ready" && thumb) return { ok: true, videoId: r.data.id, thumbnail: thumb.uri };
  }
  return { ok: false, error: "la vidéo est encore en traitement chez Meta : réessaie « Préparer » dans quelques minutes" };
}

/**
 * Crée chez Meta, EN PAUSE, la campagne d'une demande payée : campagne (plafond = payé),
 * ensemble (zone, dates, budget par jour, bénéficiaire et payeur DSA), création et publicité.
 * Reprend là où un essai précédent s'est arrêté (les identifiants déjà créés sont gardés).
 * Succès → la demande passe `preparee`.
 */
export async function prepareCampaign(requestId: string, actor: string): Promise<StepResult> {
  const account = adAccount();
  if (!account) return { ok: false, error: "Configuration Meta absente (META_ADS_SYSTEM_USER_TOKEN, META_ADS_ACCOUNT_ID_BE)" };
  const db = createAdminClient();
  let c;
  try {
    c = await loadContext(requestId);
  } catch (e) {
    return { ok: false, error: `lecture de la demande : ${(e as Error).message}` };
  }
  const { req, rest, ident } = c;
  if (!["payee", "a_corriger", "preparee"].includes(req.status)) return { ok: false, error: `demande en état « ${req.status} » : rien à préparer` };
  if (!isOpenObjective(req.objective)) return { ok: false, error: `objectif ${req.objective} non pris en charge par la création automatique` };
  if (!rest.client_code) return { ok: false, error: `${rest.name} n'a pas de code client` };
  if (rest.lat === null || rest.lng === null) return { ok: false, error: `${rest.name} n'a pas de coordonnées (lat/lng) : zone impossible` };
  if (!ident) return { ok: false, error: `Page Facebook de ${rest.name} non choisie : renseigne-la sur /platform/pub` };
  if (!req.creative || !req.starts_on || !req.ends_on) return { ok: false, error: "création ou dates manquantes dans la demande" };

  let cap: number;
  try {
    cap = spendCapCents(await paidFor(req.id));
  } catch (e) {
    return { ok: false, error: `crédit : ${(e as Error).message}` };
  }

  const spec = META_SPEC[req.objective];
  const name = campaignName({ clientCode: rest.client_code, establishment: rest.id, regie: "META", objective: req.objective, version: req.version });
  const link = restaurantLink(rest);

  const existing = await db.from("ad_campaigns").select("id, external_id, adset_external_id, creative_external_id, ad_external_id").eq("request_id", req.id).maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  let row = existing.data as { id: string; external_id: string; adset_external_id: string | null; creative_external_id: string | null; ad_external_id: string | null } | null;

  const ctx = (): CallContext => ({ actor, requestId: req.id, campaignId: row?.id ?? null });

  // 1. Campagne
  if (!row) {
    const r = await metaPost<{ id: string }>(`${account}/campaigns`, {
      name,
      objective: spec.campaignObjective,
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      spend_cap: cap,
      is_adset_budget_sharing_enabled: false,
    }, ctx());
    if (!r.ok) return { ok: false, error: `campagne : ${describeMetaError(r.error)}` };
    const ins = await db
      .from("ad_campaigns")
      .insert({ regie: "META", external_id: r.data.id, name, restaurant_id: rest.id, request_id: req.id, objective: req.objective, version: req.version, status: "PAUSED", effective_status: "PAUSED", spend_cap_cents: cap, attach_source: "name" })
      .select("id, external_id, adset_external_id, creative_external_id, ad_external_id")
      .single();
    if (ins.error) return { ok: false, error: `campagne ${r.data.id} créée chez Meta mais non enregistrée : ${ins.error.message}` };
    row = ins.data as NonNullable<typeof row>;
  }

  // 2. Ensemble de publicités
  if (!row.adset_external_id) {
    const radiusKm = req.targeting?.radiusKm ?? 3;
    const r = await metaPost<{ id: string }>(`${account}/adsets`, {
      name: `${name}_r${radiusKm}km`,
      campaign_id: row.external_id,
      status: "PAUSED",
      daily_budget: dailyBudgetCents(req.budget_cents, req.starts_on, req.ends_on),
      billing_event: spec.billingEvent,
      optimization_goal: spec.optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      ...(spec.destinationType ? { destination_type: spec.destinationType } : {}),
      promoted_object: { page_id: ident.meta_page_id },
      targeting: buildTargeting({ lat: rest.lat, lng: rest.lng, radiusKm }),
      ...metaTimes(req.starts_on, req.ends_on),
      dsa_beneficiary: rest.name,
      dsa_payor: PAYOR,
    }, ctx());
    if (!r.ok) return { ok: false, error: `ensemble : ${describeMetaError(r.error)}` };
    await db.from("ad_campaigns").update({ adset_external_id: r.data.id }).eq("id", row.id);
    row.adset_external_id = r.data.id;
  }

  // 3. Création
  if (!row.creative_external_id) {
    const cta = spec.needsLink ? { type: "LEARN_MORE", value: { link } } : undefined;
    let params: Record<string, unknown>;
    if (req.creative.kind === "instagram_post") {
      if (!ident.instagram_user_id) return { ok: false, error: `compte Instagram de ${rest.name} non choisi : renseigne-le sur /platform/pub` };
      params = { name: `${name}_ig-${req.creative.mediaId}`, object_id: ident.meta_page_id, instagram_user_id: ident.instagram_user_id, source_instagram_media_id: req.creative.mediaId, ...(cta ? { call_to_action: cta } : {}) };
    } else {
      const up = await uploadCreativeFile(account, req.creative, ctx());
      if (!up.ok) return { ok: false, error: up.error };
      const message = req.ad_text ?? "";
      const story = up.videoId
        ? { page_id: ident.meta_page_id, ...(ident.instagram_user_id ? { instagram_user_id: ident.instagram_user_id } : {}), video_data: { video_id: up.videoId, image_url: up.thumbnail, message, call_to_action: cta ?? { type: "LEARN_MORE", value: { link } } } }
        : { page_id: ident.meta_page_id, ...(ident.instagram_user_id ? { instagram_user_id: ident.instagram_user_id } : {}), link_data: { image_hash: up.imageHash, link, message, call_to_action: cta ?? { type: "LEARN_MORE", value: { link } } } };
      params = { name: `${name}_fichier`, object_story_spec: story };
    }
    const r = await metaPost<{ id: string }>(`${account}/adcreatives`, params, ctx());
    if (!r.ok) return { ok: false, error: `création : ${describeMetaError(r.error)}` };
    await db.from("ad_campaigns").update({ creative_external_id: r.data.id }).eq("id", row.id);
    row.creative_external_id = r.data.id;
  }

  // 4. Publicité
  if (!row.ad_external_id) {
    const label = req.creative.kind === "instagram_post" ? `ig-${req.creative.mediaId}` : freeSegment(req.ad_text ?? "fichier") || "fichier";
    const r = await metaPost<{ id: string }>(`${account}/ads`, { name: `${name}_${label}`, adset_id: row.adset_external_id, creative: { creative_id: row.creative_external_id }, status: "PAUSED" }, ctx());
    if (!r.ok) return { ok: false, error: `publicité : ${describeMetaError(r.error)}` };
    await db.from("ad_campaigns").update({ ad_external_id: r.data.id, ad_status: "PAUSED" }).eq("id", row.id);
    row.ad_external_id = r.data.id;
  }

  const { error } = await db.from("ad_requests").update({ status: "preparee", prepared_at: new Date().toISOString(), correction_reason: null }).eq("id", req.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Après « Renvoyer » et la correction du restaurateur : la création et la publicité sont
 * refaites (la campagne et l'ensemble restent, leur historique aussi).
 */
export async function resetCreative(requestId: string, actor: string): Promise<StepResult> {
  const db = createAdminClient();
  const { data, error } = await db.from("ad_campaigns").select("id, ad_external_id").eq("request_id", requestId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = data as { id: string; ad_external_id: string | null } | null;
  if (!row) return { ok: true };
  if (row.ad_external_id) {
    const r = await metaDelete(row.ad_external_id, { actor, requestId, campaignId: row.id });
    if (!r.ok) return { ok: false, error: `suppression de l'ancienne publicité : ${describeMetaError(r.error)}` };
  }
  const { error: e2 } = await db.from("ad_campaigns").update({ ad_external_id: null, creative_external_id: null, ad_status: null, ad_review_feedback: null }).eq("id", row.id);
  return e2 ? { ok: false, error: e2.message } : { ok: true };
}

async function campaignOf(requestId: string) {
  const { data, error } = await createAdminClient().from("ad_campaigns").select("id, external_id, adset_external_id, ad_external_id").eq("request_id", requestId).maybeSingle();
  if (error) throw error;
  return data as { id: string; external_id: string; adset_external_id: string | null; ad_external_id: string | null } | null;
}

/** Met en diffusion (ou en pause) les trois niveaux, de l'enfant vers le parent. */
export async function setDelivery(requestId: string, active: boolean, actor: string): Promise<StepResult> {
  let row;
  try {
    row = await campaignOf(requestId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!row?.adset_external_id || !row.ad_external_id) return { ok: false, error: "campagne non préparée chez Meta" };
  const status = active ? "ACTIVE" : "PAUSED";
  const ctx = { actor, requestId, campaignId: row.id };
  const order = active ? [row.ad_external_id, row.adset_external_id, row.external_id] : [row.external_id];
  for (const id of order) {
    const r = await metaPost(id, { status }, ctx);
    if (!r.ok) return { ok: false, error: `${id} → ${status} : ${describeMetaError(r.error)}` };
  }
  await createAdminClient().from("ad_campaigns").update({ status, effective_status: status }).eq("id", row.id);
  return { ok: true };
}

/**
 * Un complément payé : relève le plafond au nouveau total payé et, si la date de fin est
 * passée ou trop proche, la repousse du nombre de jours que le complément finance.
 */
export async function raiseCap(requestId: string, extraBudgetCents: number, actor: string, today: string): Promise<StepResult> {
  const db = createAdminClient();
  let row;
  let paid: number;
  try {
    row = await campaignOf(requestId);
    paid = await paidFor(requestId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!row) return { ok: true }; // pas encore créée : la préparation posera le bon plafond
  const ctx = { actor, requestId, campaignId: row.id };
  const r = await metaPost(row.external_id, { spend_cap: spendCapCents(paid) }, ctx);
  if (!r.ok) return { ok: false, error: `plafond : ${describeMetaError(r.error)}` };
  await db.from("ad_campaigns").update({ spend_cap_cents: paid }).eq("id", row.id);

  const { data: req } = await db.from("ad_requests").select("budget_cents, starts_on, ends_on").eq("id", requestId).single();
  const q = req as { budget_cents: number; starts_on: string; ends_on: string } | null;
  if (q && row.adset_external_id) {
    const daily = Math.max(100, dailyBudgetCents(q.budget_cents, q.starts_on, q.ends_on));
    const from = q.ends_on > today ? q.ends_on : today;
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.ceil(extraBudgetCents / daily));
    const newEnd = d.toISOString().slice(0, 10);
    const a = await metaPost(row.adset_external_id, { end_time: metaTimes(q.starts_on, newEnd).end_time }, ctx);
    if (!a.ok) return { ok: false, error: `date de fin : ${describeMetaError(a.error)}` };
    await db.from("ad_requests").update({ ends_on: newEnd }).eq("id", requestId);
  }
  return { ok: true };
}

/** Aperçu de la publicité tel que Meta l'affichera (fil Instagram ou Facebook), en HTML d'iframe. */
export async function adPreview(adExternalId: string, format: "INSTAGRAM_STANDARD" | "MOBILE_FEED_STANDARD" = "MOBILE_FEED_STANDARD"): Promise<string | null> {
  const r = await metaGet<{ data: { body: string }[] }>(`${adExternalId}/previews`, { ad_format: format }, { actor: "system" });
  return r.ok ? (r.data.data?.[0]?.body ?? null) : null;
}
