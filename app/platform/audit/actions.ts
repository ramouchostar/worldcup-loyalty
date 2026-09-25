"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createAudit, getAudit, saveSection, updateAudit } from "@/lib/audit/store";
import { reviseWithAnswers } from "@/lib/audit/revise";
import { emptySignals, type ReviewsResultSummary } from "@/lib/audit/measure";
import { analyseThemes, engineThemes } from "@/lib/audit/review-themes";
import { recommend } from "@/lib/audit/recommend";
import type { StoredReview } from "@/lib/audit/dataforseo";
import type { AuditSignals, OwnerAnswers } from "@/lib/audit/signals";
import { runAudit } from "@/lib/audit/run";
import { resolveMapsLink } from "@/lib/audit/maps-link";

// Même garde locale que app/platform/backlog/actions.ts : une Server Action
// n'est pas protégée par le layout, elle revérifie le super-admin elle-même.
async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

// Nombre saisi à la française (« 38 000 », « 62,5 ») → nombre, ou null.
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/\s|€|%/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ADR 0069 §6 — les réponses du gérant révisent l'audit (priorités, objectif,
// calendrier) ; les notes mesurées ne bougent pas. La révision garde « ce qui a
// changé » pour l'afficher au gérant.
export async function saveAnswers(auditId: string, formData: FormData) {
  const user = await requireSuperAdmin();
  if (!user) redirect("/join?reason=platform-required");
  const data = await getAudit(auditId);
  if (!data) redirect("/platform/audit");

  const keys = ["surPlace", "emporter", "uberEats", "deliveroo", "takeaway", "direct"] as const;
  const values = keys.map((k) => num(formData.get(`c_${k}`)) ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const answers: OwnerAnswers = {
    // 0 partout = question non posée ; une autre somme que 100 n'est pas une répartition.
    channels: total === 100 ? (Object.fromEntries(keys.map((k, i) => [k, values[i]])) as OwnerAnswers["channels"]) : null,
    heroProduct: String(formData.get("heroProduct") ?? "").trim().slice(0, 80) || null,
    heroMarginPct: num(formData.get("heroMarginPct")),
    prepMinutes: num(formData.get("prepMinutes")),
    monthlyRevenue: num(formData.get("monthlyRevenue")),
    monthlyRevenueTarget: num(formData.get("monthlyRevenueTarget")),
  };

  const measured = (data.audit.signals ?? emptySignals()) as AuditSignals;
  const rev = reviseWithAnswers(measured, answers);
  await updateAudit(auditId, {
    answers,
    status: "revise",
    recommendations: {
      ...rev.after,
      revision: { changes: rev.changes.map((c) => ({ ...c, scenario: { id: c.scenario.id, title: c.scenario.title } })), newlyMatched: rev.newlyMatched },
    },
  });
  revalidatePath(`/platform/audit/${auditId}`);
  redirect(`/platform/audit/${auditId}#revision`);
}

// ADR 0069 §4 — relancer seulement l'analyse des thèmes, sur les avis déjà
// enregistrés (pas de nouvel appel DataForSEO). Sert après un échec, ou pour
// les audits faits avant que l'analyse existe.
export async function reanalyseThemes(auditId: string) {
  const user = await requireSuperAdmin();
  if (!user) redirect("/join?reason=platform-required");
  const data = await getAudit(auditId);
  if (!data) redirect("/platform/audit");
  const fiche = data.sections.find((x) => x.section === "fiche");
  const avis = data.sections.find((x) => x.section === "avis");
  if (avis?.status !== "ok") redirect(`/platform/audit/${auditId}`);

  const info = (fiche?.status === "ok" ? fiche.raw : null) as { title?: string; category?: string | null; place_topics?: Record<string, number> | null } | null;
  const reviews = ((avis.raw as { reviews?: StoredReview[] } | null)?.reviews ?? []) as StoredReview[];
  const result = { ...(avis.result as ReviewsResultSummary) };
  const calls = { ...(data.audit.calls ?? {}) };
  try {
    const themes = await analyseThemes({ name: info?.title ?? data.audit.name, category: info?.category ?? null, reviews, topics: info?.place_topics ?? null });
    result.themes = themes;
    result.themesError = null;
    calls.claude_tokens_in = themes.tokens.input;
    calls.claude_tokens_out = themes.tokens.output;
  } catch (e) {
    result.themes = null;
    result.themesError = e instanceof Error ? e.message : String(e);
  }
  await saveSection(auditId, "avis", { status: "ok", source: avis.source, raw: avis.raw, result, cost_usd: Number(avis.cost_usd) });

  // Les thèmes nourrissent le moteur : on recalcule les priorités (et la révision si le gérant a répondu).
  const measured: AuditSignals = { ...((data.audit.signals ?? emptySignals()) as AuditSignals), negativeThemes: result.themes ? engineThemes(result.themes.negatives) : [] };
  const answers = data.audit.answers as OwnerAnswers | null;
  const recommendations = answers
    ? (() => {
        const rev = reviseWithAnswers(measured, answers);
        return { ...rev.after, revision: { changes: rev.changes.map((c) => ({ ...c, scenario: { id: c.scenario.id, title: c.scenario.title } })), newlyMatched: rev.newlyMatched } };
      })()
    : recommend(measured);
  await updateAudit(auditId, { signals: measured, recommendations, calls });
  revalidatePath(`/platform/audit/${auditId}`);
  redirect(`/platform/audit/${auditId}`);
}

// ADR 0069 — lance un audit. La recherche Places (PR 1 complète) fournira un
// CID ; en attendant, on cherche par nom + commune, et le contrôle Bruxelles
// se fait sur l'adresse que la source renvoie (lib/audit/run.ts).
export async function startAudit(formData: FormData) {
  const user = await requireSuperAdmin();
  if (!user) redirect("/join?reason=platform-required");

  const link = String(formData.get("lien") ?? "").trim().slice(0, 2000);
  let name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const commune = String(formData.get("commune") ?? "").trim().slice(0, 60);
  let cid: string | null = null;

  // Un lien Google Maps collé prime sur le nom saisi (lib/audit/maps-link.ts).
  if (link) {
    const resolved = await resolveMapsLink(link);
    if (!resolved.ok) redirect(`/platform/audit?erreur=lien&motif=${encodeURIComponent(resolved.error)}`);
    cid = resolved.target.cid;
    name = resolved.target.name ?? name;
  }
  if (!name && !cid) redirect("/platform/audit?erreur=nom");

  const audit = await createAudit({ name: name || `CID ${cid}`, cid, createdBy: user.id });
  const target = cid ? { cid } : { keyword: `${name} ${commune || "Bruxelles"}` };
  after(() => runAudit(audit.id, target));

  revalidatePath("/platform/audit");
  redirect(`/platform/audit/${audit.id}`);
}
