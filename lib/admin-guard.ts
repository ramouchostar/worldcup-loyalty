import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase";
import { createAdminClient } from "./supabase";
import { getRestaurantId } from "./restaurant";

type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

// ADR 0015 §7 — accès admin établissement pour un restaurant donné. Accepte
// TROIS mécaniques :
// - isLegacyAdmin : profiles.is_admin (bootstrap ADMIN_EMAILS), mais
//   UNIQUEMENT pour le restaurant par défaut (getRestaurantId()) — préserve
//   l'accès historique de kraainem sans rien casser.
// - isOwner : restaurants.owner_id = l'utilisateur, pour n'importe quel
//   établissement (nouveau modèle self-service, /become-a-partner).
// - isSuperAdmin : profiles.is_super_admin — la plateforme accède à la
//   console de n'importe quel établissement (support, gestion des données).
export type AdminAccess = {
  isLegacyAdmin: boolean;
  isOwner: boolean;
  isSuperAdmin: boolean;
};

// Détail des trois mécaniques — utilisé par le layout admin pour la garde ET
// la signalétique « Mode plateforme » (ADR 0030 §3 : le super-admin voit la
// même console que le gérant, seul un bandeau signale le contexte).
export async function getAdminAccess(userId: string, restaurantId: string): Promise<AdminAccess> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: restaurant }] = await Promise.all([
    admin.from("profiles").select("is_admin, is_super_admin").eq("id", userId).single(),
    admin.from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle(),
  ]);

  const p = profile as { is_admin: boolean; is_super_admin: boolean } | null;
  return {
    isLegacyAdmin: !!p?.is_admin && restaurantId === getRestaurantId(),
    isOwner: (restaurant as { owner_id: string | null } | null)?.owner_id === userId,
    isSuperAdmin: !!p?.is_super_admin,
  };
}

export async function isEstablishmentAdmin(userId: string, restaurantId: string): Promise<boolean> {
  const access = await getAdminAccess(userId, restaurantId);
  return access.isLegacyAdmin || access.isOwner || access.isSuperAdmin;
}

export async function requireAdmin(restaurantId: string): Promise<GuardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  if (!(await isEstablishmentAdmin(user.id, restaurantId))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}

// Réservé à la PLATEFORME (profiles.is_super_admin) — pas au restaurateur.
// ADR 0029 : le flip de plan (gratuit/croissance/pro) est une action plateforme
// tant que Stripe n'est pas branché (Phase 5) ; un owner ne doit pas pouvoir se
// mettre en Pro tout seul. Ne dépend d'aucun restaurantId (portée plateforme).
export async function requireSuperAdmin(): Promise<GuardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!(data as { is_super_admin: boolean } | null)?.is_super_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}
