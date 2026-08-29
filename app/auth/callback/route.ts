import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";
import { resolvePostLoginDestination } from "@/lib/post-login";
import { OWNER_INVITE_COOKIE, isValidInviteToken } from "@/lib/owner-invite-token";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

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

  let authError = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    authError = error;
  }

  if (!authError) {
    // Récupération de mot de passe → page dédiée avant toute redirection
    if (type === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const adminEmails = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (adminEmails.includes((user.email ?? "").toLowerCase())) {
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({ is_admin: true })
          .eq("id", user.id);
      }

      // ADR 0015 §7 — super-admin plateforme, même mécanique que ADMIN_EMAILS
      // mais rôle distinct (au-dessus de tous les établissements).
      const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (superAdminEmails.includes((user.email ?? "").toLowerCase())) {
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({ is_super_admin: true })
          .eq("id", user.id);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (!profile?.display_name) {
        return NextResponse.redirect(`${origin}/register`);
      }

      // ADR 0032 — invitation restaurateur en attente : elle prime sur tout le reste
      // (le compte vient d'être créé POUR ça). Le cookie n'est pas effacé ici :
      // c'est l'acceptation qui le consomme, pour que le lien survive à un
      // aller-retour (mail de confirmation ouvert, page fermée trop tôt).
      const pendingInvite = cookieStore.get(OWNER_INVITE_COOKIE)?.value;
      if (pendingInvite && isValidInviteToken(pendingInvite)) {
        return NextResponse.redirect(`${origin}/invite/${pendingInvite}`);
      }

      // Prospect redirigé vers /login depuis /become-a-partner (middleware) —
      // on l'y ramène au lieu de le laisser sur le parcours membre par défaut.
      const pendingBecomePartner = cookieStore.get("pending_become_partner")?.value === "1";
      if (pendingBecomePartner) {
        cookieStore.set("pending_become_partner", "", { maxAge: 0, path: "/" });
        return NextResponse.redirect(`${origin}/become-a-partner`);
      }

      // Arrivée via le QR code / lien d'un établissement précis (page /r/[id])
      // → on y retourne en priorité.
      const pendingRestaurantId = cookieStore.get("pending_restaurant_id")?.value;
      if (pendingRestaurantId) {
        // ADR 0040 — ticket photographié en visiteur → retour direct au scan.
        const pendingTicket = cookieStore.get("pending_ticket")?.value === "1";
        cookieStore.set("pending_restaurant_id", "", { maxAge: 0, path: "/" });
        cookieStore.set("pending_ticket", "", { maxAge: 0, path: "/" });
        return NextResponse.redirect(
          pendingTicket
            ? `${origin}/r/${pendingRestaurantId}/submit-order?resume=1`
            : `${origin}/r/${pendingRestaurantId}`
        );
      }

      // ADR 0030 §1 — destination par rôle (plateforme > console > membre).
      return NextResponse.redirect(`${origin}${await resolvePostLoginDestination(user.id)}`);
    }
    return NextResponse.redirect(`${origin}/join`);
  }

  return NextResponse.redirect(`${origin}/login?error=lien_invalide`);
}
