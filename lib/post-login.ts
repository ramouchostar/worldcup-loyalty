import { createAdminClient } from "./supabase";

// ADR 0030 §1 — routage post-login par rôle : la destination la plus
// puissante gagne (plateforme > console resto > membre). Le paramètre
// `as=resto` (porte « Espace restaurateur », landing /restaurateurs) force
// la destination admin quel que soit le rôle le plus élevé.
//
// Utilisé par login/actions.ts, auth/callback/route.ts et le redirect
// /login|/signup du middleware (logique dupliquée là-bas : le middleware ne
// doit pas embarquer la clé service-role — garder les deux en phase).
export async function resolvePostLoginDestination(
  userId: string,
  opts?: { as?: string | null }
): Promise<string> {
  const admin = createAdminClient();

  const [{ data: profileRaw }, { data: owned }, { data: membership }] = await Promise.all([
    admin
      .from("profiles")
      .select("is_admin, is_super_admin, display_name, birth_date")
      .eq("id", userId)
      .single(),
    admin.from("restaurants").select("id").eq("owner_id", userId).limit(1),
    admin
      .from("memberships")
      .select("restaurant_id")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRaw as {
    is_admin: boolean;
    is_super_admin: boolean;
    display_name: string | null;
    birth_date: string | null;
  } | null;
  // is_admin legacy (ADMIN_EMAILS) donne accès à la console du restaurant par
  // défaut — même logique que /admin (app/admin/page.tsx, pont legacy).
  const hasConsole = (owned ?? []).length > 0 || !!profile?.is_admin;

  // Porte « Espace restaurateur » : on honore l'intention affichée.
  if (opts?.as === "resto") {
    if (hasConsole) return "/admin";
    if (profile?.is_super_admin) return "/platform";
    return "/become-a-partner";
  }

  if (profile?.is_super_admin) return "/platform";
  if (hasConsole) return "/admin";

  if (membership) return `/r/${membership.restaurant_id}/dashboard`;
  // Compte sans profil complété → finir l'inscription (cf. registerProfile).
  // birth_date est le vrai signal de complétude : le trigger m29b dérive un
  // display_name du préfixe email (jamais vide pour un compte Google), ce qui
  // faisait sauter /register — zones et consentements compris — aux inscrits
  // OAuth. Seul registerProfile pose birth_date.
  return profile?.display_name && profile?.birth_date ? "/join" : "/register";
}
