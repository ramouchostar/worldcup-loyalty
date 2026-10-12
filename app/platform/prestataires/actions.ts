"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createProvider, createProviderInvite, setProviderStatus } from "@/lib/providers";

// ADR 0084 — la plateforme invite, relance et suspend les prestataires. Réservé au super-admin :
// chaque action se re-garde (une Server Action est une route publique).
async function requireSuperAdmin(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");
  return user.id;
}

export type InviteActionResult = { error?: string; url?: string; emailed?: boolean; name?: string };

/** Crée le prestataire ET son lien d'invitation (lié à son adresse), envoie l'e-mail si possible. */
export async function inviteProvider(_prev: InviteActionResult | null, formData: FormData): Promise<InviteActionResult> {
  const userId = await requireSuperAdmin();
  const created = await createProvider({
    email: String(formData.get("email") ?? ""),
    displayName: String(formData.get("name") ?? ""),
    metiers: formData.getAll("metiers").map(String),
    createdBy: userId,
  });
  if (!created.ok) return { error: created.error };

  const invite = await createProviderInvite(created.provider.id, userId);
  revalidatePath("/platform/prestataires");
  if (!invite.ok) return { error: `Prestataire créé, mais le lien n'a pas pu l'être : ${invite.error}` };
  return { url: invite.invite.url, emailed: invite.emailed, name: created.provider.display_name };
}

/** Un nouveau lien (l'ancien est révoqué) — pour un lien perdu, expiré, ou une adresse corrigée. */
export async function reissueInvite(providerId: string): Promise<InviteActionResult> {
  const userId = await requireSuperAdmin();
  const invite = await createProviderInvite(providerId, userId);
  revalidatePath("/platform/prestataires");
  if (!invite.ok) return { error: invite.error };
  return { url: invite.invite.url, emailed: invite.emailed };
}

export async function toggleProviderStatus(providerId: string, status: "active" | "suspended"): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const ok = await setProviderStatus(providerId, status);
  revalidatePath("/platform/prestataires");
  return ok ? {} : { error: "Changement impossible : le prestataire n'a pas encore activé son compte, ou le service est indisponible." };
}
