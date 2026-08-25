"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/lib/post-login";
import { OWNER_INVITE_COOKIE, isValidInviteToken } from "@/lib/owner-invite-token";

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "Email ou mot de passe incorrect." };
  }

  // ADR 0032 — invitation restaurateur en attente : priorité absolue (le
  // restaurateur se connecte justement pour activer son accès). Le cookie est
  // consommé à l'acceptation, pas ici.
  const pendingInvite = cookieStore.get(OWNER_INVITE_COOKIE)?.value;
  if (pendingInvite && isValidInviteToken(pendingInvite)) {
    redirect(`/invite/${pendingInvite}`);
  }

  // Arrivée via le QR code / lien d'un établissement précis (page /r/[id])
  // → on y retourne en priorité, peu importe les adhésions existantes.
  const pendingRestaurantId = cookieStore.get("pending_restaurant_id")?.value;
  if (pendingRestaurantId) {
    // ADR 0040 — un ticket photographié en visiteur attend dans l'appareil :
    // on rouvre directement l'écran de scan, qui le reprend et l'envoie.
    const pendingTicket = cookieStore.get("pending_ticket")?.value === "1";
    cookieStore.set("pending_restaurant_id", "", { maxAge: 0, path: "/" });
    cookieStore.set("pending_ticket", "", { maxAge: 0, path: "/" });
    redirect(
      pendingTicket
        ? `/r/${pendingRestaurantId}/submit-order?resume=1`
        : `/r/${pendingRestaurantId}`
    );
  }

  // ADR 0030 §1 — destination par rôle (plateforme > console > membre),
  // `as=resto` (Espace restaurateur) force la console.
  redirect(await resolvePostLoginDestination(data.user.id, { as: formData.get("as") as string | null }));
}
