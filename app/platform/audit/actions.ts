"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createAudit } from "@/lib/audit/store";
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
