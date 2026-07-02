import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase";
import { createAdminClient } from "./supabase";
import { getRestaurantId } from "./restaurant";

type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

// ADR 0015 §7 — accès admin établissement pour un restaurant donné. Accepte
// DEUX mécaniques pendant la transition vers le modèle self-service :
// - isLegacyAdmin : profiles.is_admin (bootstrap ADMIN_EMAILS), mais
//   UNIQUEMENT pour le restaurant par défaut (getRestaurantId()) — préserve
//   l'accès historique de kraainem sans rien casser.
// - isOwner : restaurants.owner_id = l'utilisateur, pour n'importe quel
//   établissement (nouveau modèle self-service, /become-a-partner).
export async function requireAdmin(restaurantId: string): Promise<GuardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const [{ data: profile }, { data: restaurant }] = await Promise.all([
    admin.from("profiles").select("is_admin").eq("id", user.id).single(),
    admin.from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle(),
  ]);

  const isLegacyAdmin = !!(profile as { is_admin: boolean } | null)?.is_admin && restaurantId === getRestaurantId();
  const isOwner = (restaurant as { owner_id: string | null } | null)?.owner_id === user.id;

  if (!isLegacyAdmin && !isOwner) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}
