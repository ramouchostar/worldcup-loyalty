"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { addEvent, getProspect, importProspects, updateProspect, type ProspectPatch } from "@/lib/crm";
import {
  CRM_EVENT_KINDS,
  CRM_OFFERS,
  CRM_STATUSES,
  CRM_STRATEGIES,
  discoveryRejection,
  normalizeProspect,
  prospectFromPlace,
  type CrmEventKind,
  type CrmOffer,
  type CrmStatus,
  type CrmStrategy,
  type DiscoveryRejection,
} from "@/lib/crm-model";
import { isPlacesConfigured, searchText } from "@/lib/audit/places";
import { createAudit } from "@/lib/audit/store";
import { runAudit } from "@/lib/audit/run";

// Même garde locale que app/platform/backlog/actions.ts : une Server Action
// n'est pas protégée par le layout, elle revérifie le super-admin elle-même.
async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

async function guard() {
  const user = await requireSuperAdmin();
  if (!user) redirect("/join?reason=platform-required");
  return user;
}

const text = (v: FormDataEntryValue | null, max = 600): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

function back(id?: string, params?: Record<string, string>): never {
  revalidatePath("/platform/crm");
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  redirect(`/platform/crm${qs}${id ? `#p-${id}` : ""}`);
}

// ─── Import d'une liste (JSON collé) ───────────────────────────────────────────

export async function importJson(formData: FormData) {
  await guard();
  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("json") ?? ""));
  } catch {
    back(undefined, { import: "illisible" });
  }
  if (!Array.isArray(rows)) back(undefined, { import: "illisible" });
  const ok = [];
  const refused: string[] = [];
  for (const r of rows as unknown[]) {
    const n = normalizeProspect(r);
    if (n.ok) ok.push(n.value);
    else refused.push(n.reason);
  }
  const res = await importProspects(ok, "import");
  back(undefined, {
    import: "ok",
    crees: String(res.created),
    doublons: String(res.skipped),
    refuses: String(refused.length),
    ...(refused.length ? { motifs: refused.slice(0, 5).join(" · ") } : {}),
  });
}

// ─── Découverte Google Maps (clé serveur, ADR 0069 §4) ─────────────────────────

export async function discoverFromGoogle(formData: FormData) {
  await guard();
  if (!isPlacesConfigured()) back(undefined, { google: "non_branche" });
  const what = text(formData.get("quoi"), 60) ?? "fast food";
  const where = text(formData.get("ou"), 60) ?? "Bruxelles";
  let places;
  try {
    places = await searchText(`${what} ${where}`, 20);
  } catch (e) {
    back(undefined, { google: "echec", motif: (e instanceof Error ? e.message : String(e)).slice(0, 160) });
  }
  // Chaque fiche écartée est comptée par motif : rien n'est masqué en silence.
  const rejected: Record<DiscoveryRejection, number> = { hors_bruxelles: 0, chaine: 0, type: 0, peu_d_avis: 0 };
  const kept = [];
  for (const p of places) {
    const why = discoveryRejection(p);
    if (why) rejected[why]++;
    else kept.push({ ...prospectFromPlace(p), status: "a_qualifier" as CrmStatus });
  }
  const res = await importProspects(kept, "google_places");
  back(undefined, {
    google: "ok",
    recherche: `${what} ${where}`,
    lus: String(places.length),
    crees: String(res.created),
    doublons: String(res.skipped),
    ...Object.fromEntries(Object.entries(rejected).map(([k, v]) => [`x_${k}`, String(v)])),
  });
}

// ─── Statut, contact, fiche ───────────────────────────────────────────────────

export async function setStatus(id: string, formData: FormData) {
  const user = await guard();
  const p = await getProspect(id);
  if (!p) back();
  const status = CRM_STATUSES.includes(formData.get("status") as CrmStatus) ? (formData.get("status") as CrmStatus) : p.status;
  const lost = text(formData.get("lost_reason"), 200);
  const dnc = formData.get("do_not_contact") === "on";
  if (status === p.status && !lost && dnc === p.do_not_contact) back(id);

  const patch: ProspectPatch = { status, do_not_contact: dnc || (status === "perdu" ? p.do_not_contact : false) };
  if (status === "perdu") patch.lost_reason = lost ?? p.lost_reason ?? "non précisé";
  if (status === "signe" && !p.signed_at) patch.signed_at = new Date().toISOString();
  if (status === "perdu" || status === "signe") patch.next_action_at = null;
  await updateProspect(id, patch);
  if (status !== p.status) {
    await addEvent({ prospectId: id, kind: "statut", fromStatus: p.status, toStatus: status, note: status === "perdu" ? patch.lost_reason : null, createdBy: user.id });
  }
  back(id);
}

/** Un appel, un message ou une visite. Le premier contact fait passer « à contacter » en « contacté ». */
export async function logContact(id: string, formData: FormData) {
  const user = await guard();
  const p = await getProspect(id);
  if (!p) back();
  const kind = CRM_EVENT_KINDS.includes(formData.get("kind") as CrmEventKind) ? (formData.get("kind") as CrmEventKind) : "note";
  const note = text(formData.get("note"), 1000);
  const next = text(formData.get("next_action_at"), 10);
  await addEvent({ prospectId: id, kind, note, createdBy: user.id });

  const patch: ProspectPatch = {};
  if (next && /^\d{4}-\d{2}-\d{2}$/.test(next)) patch.next_action_at = next;
  if (kind !== "note" && (p.status === "a_contacter" || p.status === "a_qualifier")) {
    patch.status = "contacte";
    await addEvent({ prospectId: id, kind: "statut", fromStatus: p.status, toStatus: "contacte", createdBy: user.id });
  }
  if (Object.keys(patch).length) await updateProspect(id, patch);
  back(id);
}

export async function updateDetails(id: string, formData: FormData) {
  await guard();
  const p = await getProspect(id);
  if (!p) back();
  const strategy = CRM_STRATEGIES.includes(formData.get("strategy") as CrmStrategy) ? (formData.get("strategy") as CrmStrategy) : p.strategy;
  const offer = CRM_OFFERS.includes(formData.get("offer") as CrmOffer) ? (formData.get("offer") as CrmOffer) : p.offer;
  const next = text(formData.get("next_action_at"), 10);
  const patch: ProspectPatch = {
    strategy,
    offer,
    pitch: text(formData.get("pitch"), 600),
    notes: text(formData.get("notes"), 4000),
    owner_user: text(formData.get("owner_user"), 40),
    next_action_at: next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null,
    phone: text(formData.get("phone"), 40),
    email: text(formData.get("email"), 200),
    owner_name: text(formData.get("owner_name"), 120),
    owner_contact: text(formData.get("owner_contact"), 200),
  };
  // Qualifié à la main = prêt à contacter.
  if (p.status === "a_qualifier" && formData.get("qualifier") === "on") patch.status = "a_contacter";
  await updateProspect(id, patch);
  back(id);
}

/**
 * Relie la fiche Google et complète ce qui manque (note, avis, téléphone,
 * site) — sans écraser un contact saisi à la main. La note et le nombre
 * d'avis sont toujours rafraîchis : ce sont des mesures, pas des saisies.
 */
export async function enrichFromGoogle(id: string) {
  await guard();
  const p = await getProspect(id);
  if (!p) back();
  if (!isPlacesConfigured()) back(id, { google: "non_branche" });
  let hit;
  try {
    [hit] = await searchText(`${p.name} ${p.address ?? p.commune ?? "Bruxelles"}`, 1);
  } catch (e) {
    back(id, { google: "echec", motif: (e instanceof Error ? e.message : String(e)).slice(0, 160) });
  }
  if (!hit) back(id, { google: "introuvable", nom: p.name });
  await updateProspect(id, {
    place_id: hit.id,
    maps_uri: hit.mapsUri,
    rating: hit.rating,
    reviews_count: hit.reviewsCount,
    phone: p.phone ?? hit.phone,
    website: p.website ?? hit.website,
    address: p.address ?? hit.address,
  });
  back(id, { google: "relie", nom: hit.name });
}

/** Lance l'audit (ADR 0069) du prospect et le relie à sa fiche CRM. */
export async function startProspectAudit(id: string) {
  const user = await guard();
  const p = await getProspect(id);
  if (!p) back();
  const audit = await createAudit({ name: p.name, placeId: p.place_id, address: p.address, postalCode: p.postal_code, createdBy: user.id });
  await updateProspect(id, { audit_id: audit.id });
  after(() => runAudit(audit.id, { keyword: `${p.name} ${p.commune ?? "Bruxelles"}` }));
  revalidatePath("/platform/crm");
  redirect(`/platform/audit/${audit.id}`);
}
