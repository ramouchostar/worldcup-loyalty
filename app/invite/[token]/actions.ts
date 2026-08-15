"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { claimOwnerInvite, OWNER_INVITE_COOKIE } from "@/lib/owner-invites";

// ADR 0032 — l'attribution de `restaurants.owner_id` se fait ICI, sur une
// Server Action (POST), jamais au rendu de la page : un GET mutant serait
// déclenchable par simple prévisualisation de lien (WhatsApp, antivirus mail)
// et griller l'invitation avant que le restaurateur ne l'ouvre. Même
// raisonnement que POST /api/auth/bootstrap-admin.
export async function acceptInvite(token: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?reason=login-required`);

  const result = await claimOwnerInvite(token, user.id);

  const cookieStore = await cookies();
  if (!result.ok) {
    redirect(`/invite/${token}?error=${result.state}`);
  }

  cookieStore.set(OWNER_INVITE_COOKIE, "", { maxAge: 0, path: "/" });
  redirect(`/admin/${result.restaurantId}`);
}

// « Pas maintenant » : oublie l'invitation en attente pour ne pas rerouter le
// restaurateur vers elle à chaque connexion. Le lien reste valide s'il change
// d'avis — c'est le cookie qu'on efface, pas l'invitation.
export async function dismissInvite() {
  const cookieStore = await cookies();
  cookieStore.set(OWNER_INVITE_COOKIE, "", { maxAge: 0, path: "/" });
  redirect("/join");
}
