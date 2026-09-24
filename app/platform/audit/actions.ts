"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createAudit, getAudit, updateAudit } from "@/lib/audit/store";
import { reviseWithAnswers } from "@/lib/audit/revise";
import { emptySignals } from "@/lib/audit/measure";
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
