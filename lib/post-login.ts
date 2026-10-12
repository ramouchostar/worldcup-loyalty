import { createAdminClient } from "./supabase";
import { getAdminRestaurantIds } from "./restaurant-admins";
import { pickDestination } from "./view-mode";
import { getProviderByUserId } from "./providers";

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
  opts?: { as?: string | null; clientMode?: boolean }
): Promise<string> {
  const admin = createAdminClient();

  const [{ data: profileRaw }, adminRestaurantIds, { data: membership }, provider] = await Promise.all([
    admin
      .from("profiles")
      .select("is_admin, is_super_admin, display_name")
      .eq("id", userId)
      .single(),
    // ADR 0041 — owner_id ∪ sièges restaurant_admins (gérant/manager/équipe).
    getAdminRestaurantIds(userId),
    admin
      .from("memberships")
      .select("restaurant_id")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // ADR 0084 — un prestataire actif arrive dans son espace (même règle que le middleware).
    getProviderByUserId(userId),
  ]);

  const profile = profileRaw as {
    is_admin: boolean;
    is_super_admin: boolean;
    display_name: string | null;
  } | null;
  // is_admin legacy (ADMIN_EMAILS) donne accès à la console du restaurant par
  // défaut — même logique que /admin (app/admin/page.tsx, pont legacy).
  const hasConsole = adminRestaurantIds.length > 0 || !!profile?.is_admin;

  return pickDestination(
    {
      isSuperAdmin: !!profile?.is_super_admin,
      hasConsole,
      membershipRestaurantId: membership?.restaurant_id ?? null,
      hasDisplayName: !!profile?.display_name,
      isProvider: provider?.status === "active",
    },
    opts
  );
}
