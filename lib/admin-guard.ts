import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase";
import { createAdminClient } from "./supabase";
import { getRestaurantId } from "./restaurant";
import { type AdminRole, getSeatRole } from "./restaurant-admins";

type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

// ADR 0015 §7 + ADR 0040 — accès admin établissement pour un restaurant
// donné. Accepte QUATRE mécaniques :
// - isLegacyAdmin : profiles.is_admin (bootstrap ADMIN_EMAILS), mais
//   UNIQUEMENT pour le restaurant par défaut (getRestaurantId()) — préserve
//   l'accès historique de kraainem sans rien casser.
// - isOwner : restaurants.owner_id = l'utilisateur, pour n'importe quel
//   établissement (nouveau modèle self-service, /become-a-partner).
// - isSuperAdmin : profiles.is_super_admin — la plateforme accède à la
//   console de n'importe quel établissement (support, gestion des données).
// - seatRole : siège restaurant_admins (gérant/manager/équipe, ADR 0040) —
//   PLUSIEURS admins par établissement. En V1 le rôle ne différencie que le
//   droit d'inviter (canInviteFromAccess) : les quatre mécaniques donnent le
//   même accès console, aucune autre surface n'est encore gatée par rôle.
export type AdminAccess = {
  isLegacyAdmin: boolean;
  isOwner: boolean;
  isSuperAdmin: boolean;
  seatRole: AdminRole | null;
};

// Détail des quatre mécaniques — utilisé par le layout admin pour la garde ET
// la signalétique « Mode plateforme » (ADR 0030 §3 : le super-admin voit la
// même console que le gérant, seul un bandeau signale le contexte).
export async function getAdminAccess(userId: string, restaurantId: string): Promise<AdminAccess> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: restaurant }, seatRole] = await Promise.all([
    admin.from("profiles").select("is_admin, is_super_admin").eq("id", userId).single(),
    admin.from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle(),
    getSeatRole(userId, restaurantId),
  ]);

  const p = profile as { is_admin: boolean; is_super_admin: boolean } | null;
  return {
    isLegacyAdmin: !!p?.is_admin && restaurantId === getRestaurantId(),
    isOwner: (restaurant as { owner_id: string | null } | null)?.owner_id === userId,
    isSuperAdmin: !!p?.is_super_admin,
    seatRole,
  };
}

export async function isEstablishmentAdmin(userId: string, restaurantId: string): Promise<boolean> {
  const access = await getAdminAccess(userId, restaurantId);
  return access.isLegacyAdmin || access.isOwner || access.isSuperAdmin || access.seatRole !== null;
}

// ADR 0040 §6 — accès aux trois pages sensibles (seuils CA, paliers
// d'équipe, réglages établissement) : réservé à gérant/manager (+ pont
// legacy). Même ensemble de rôles que canInviteFromAccess en V1 — deux noms
// parce que ce sont deux permissions distinctes qui pourraient diverger.
export function canManageEstablishment(access: AdminAccess): boolean {
  return (
    access.isSuperAdmin ||
    access.isLegacyAdmin ||
    access.isOwner ||
    access.seatRole === "gerant" ||
    access.seatRole === "manager"
  );
}

// ADR 0040 §5/§10 — qui peut inviter ET qui peut retirer un siège : super-admin,
// gérant, manager. Équipe non (sinon n'importe qui se clone ou se retire
// l'accès). isLegacyAdmin/isOwner sont inclus par défense en profondeur : ils
// donnent déjà un accès console complet ailleurs (isEstablishmentAdmin), les
// exclure ici casserait le droit d'inviter du pont legacy ADMIN_EMAILS
// (kraainem) s'il n'a pas de ligne restaurant_admins explicite — coût nul
// une fois le backfill (ADR 0040) appliqué, puisque isOwner devient alors
// redondant avec seatRole === "gerant".
export function canInviteFromAccess(access: AdminAccess): boolean {
  return canManageEstablishment(access);
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

// ADR 0040 §6 — variante de requireAdmin pour les trois routes API des pages
// restreintes (thresholds, team-tiers, settings) : un siège équipe est bien
// admin de l'établissement (isEstablishmentAdmin), mais pas autorisé sur ces
// surfaces précises. Défense en profondeur derrière la garde déjà posée
// côté page (canManageEstablishment) — un appel direct à l'API doit être
// bloqué même si la page n'a pas été traversée.
export async function requireEstablishmentManager(restaurantId: string): Promise<GuardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const access = await getAdminAccess(user.id, restaurantId);
  if (!canManageEstablishment(access)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Réservé aux gérants et managers." }, { status: 403 }),
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
