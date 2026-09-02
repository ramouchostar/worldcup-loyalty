"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { recordConsents } from "@/lib/consent";
import { resolvePostLoginDestination } from "@/lib/post-login";
import { sendWelcomeEmail } from "@/lib/email";
import { OWNER_INVITE_COOKIE, isValidInviteToken } from "@/lib/owner-invite-token";

// ADR 0047 — /register ne collecte plus que le CONSENTEMENT (parcours Google
// OAuth, où aucune case n'a pu être cochée à l'inscription). Prénom, zones et
// date de naissance vivent dans /compte, au moment où ils servent. L'ancienne
// `registerProfile` (prénom + naissance + zones + consentements, tout en
// double avec /signup) est remplacée par cette action minimale.
export async function acceptProgramme(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  // ADR 0022 — acceptation de la politique (information, obligatoire)
  if (formData.get("accept_policy") !== "1") {
    return { error: "Tu dois accepter la politique de confidentialité et les conditions d'utilisation." };
  }

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

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "Non authentifié. Reconnecte-toi puis réessaie." };
  }
  const user = session.user;

  // Journal append-only (ADR 0022). Les opt-ins facultatifs (offres,
  // statistiques) se gèrent dans Mon compte — jamais groupés ici.
  const admin = createAdminClient();
  try {
    await recordConsents(user.id, { programme: true }, "signup", admin);
  } catch {
    return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  // Bienvenue — une seule fois, à l'entrée dans le programme. Attendu (pas
  // fire-and-forget) : une Server Action se termine à l'appel de redirect().
  // Best-effort : un échec d'envoi ne bloque jamais l'inscription.
  const { data: prof } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  if (user.email) await sendWelcomeEmail(user.email, (prof?.display_name ?? "").trim() || "toi");

  // ADR 0032 — inscription déclenchée par un lien d'invitation restaurateur : on
  // ramène le restaurateur sur son invitation, où il active son accès.
  const pendingInvite = cookieStore.get(OWNER_INVITE_COOKIE)?.value;
  if (pendingInvite && isValidInviteToken(pendingInvite)) {
    redirect(`/invite/${pendingInvite}`);
  }

  // Prospect redirigé vers /login (puis /register) depuis /become-a-partner
  // (middleware) — on l'y ramène au lieu de le laisser tomber sur /join.
  // GARDE-FOU (incident 2026-09-02) : jamais pour un rôle élevé — le cookie
  // envoyait même le super-admin dans le tunnel d'inscription resto.
  const pendingBecomePartner = cookieStore.get("pending_become_partner")?.value === "1";
  if (pendingBecomePartner) {
    cookieStore.set("pending_become_partner", "", { maxAge: 0, path: "/" });
    const roleDest = await resolvePostLoginDestination(user.id);
    redirect(roleDest === "/platform" || roleDest === "/admin" ? roleDest : "/become-a-partner");
  }

  const pendingRestaurantId = cookieStore.get("pending_restaurant_id")?.value;
  if (pendingRestaurantId) {
    // ADR 0040 — ticket photographié en visiteur → retour direct au scan.
    const pendingTicket = cookieStore.get("pending_ticket")?.value === "1";
    cookieStore.set("pending_restaurant_id", "", { maxAge: 0, path: "/" });
    cookieStore.set("pending_ticket", "", { maxAge: 0, path: "/" });
    redirect(
      pendingTicket
        ? `/r/${pendingRestaurantId}/submit-order?resume=1`
        : `/r/${pendingRestaurantId}`
    );
  }

  // ADR 0030 §1 — destination par RÔLE, pas /join en dur (incident
  // 2026-09-02 : le super-admin qui passait par la case de consentement
  // atterrissait sur la liste des restos au lieu de /platform).
  redirect(await resolvePostLoginDestination(user.id));
}
