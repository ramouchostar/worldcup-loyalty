"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { claimProviderInvite } from "@/lib/providers";
import { PROVIDER_INVITE_COOKIE } from "@/lib/provider-invite-token";

// ADR 0084 — l'acceptation passe par une Server Action (jamais par le GET de la page) : la
// page affiche, l'action attribue — même principe anti-CSRF que l'invitation restaurateur.
export async function acceptProviderInvite(token: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");

  const result = await claimProviderInvite(token, user.id, user.email);
  if (!result.ok) redirect(`/prestataire/invitation/${token}?error=${result.state}`);

  // Le lien est consommé : le cookie de retour n'a plus lieu d'être.
  (await cookies()).delete(PROVIDER_INVITE_COOKIE);
  redirect("/prestataire");
}

export async function dismissProviderInvite(): Promise<void> {
  (await cookies()).delete(PROVIDER_INVITE_COOKIE);
  redirect("/join");
}
