import { createAdminClient } from "./supabase";
import type { AdminRole } from "./restaurant-admin-roles";

// ADR 0041 — sièges d'admin multi-rôles par établissement (table
// restaurant_admins). Remplace le modèle « un seul owner_id » (ADR 0015
// §7) sans le supprimer : owner_id reste, dérivé du premier gérant par un
// trigger DB.
//
// V1 : le rôle gate le droit d'inviter/retirer un siège (voir
// canManageEstablishment/canInviteFromAccess dans lib/admin-guard.ts) et
// l'accès à trois pages (seuils CA, paliers d'équipe, réglages). Le reste de
// la console reste identique quel que soit le siège — même principe que le
// mode plateforme (ADR 0030 §3 : le super-admin voit la même console que le
// gérant).
//
// Type/libellés/parsing du rôle vivent dans restaurant-admin-roles.ts (pas
// ici) : ce module-ci importe createAdminClient (donc next/headers), invalide
// dans un composant client — re-exportés pour ne rien casser côté serveur.
export type { AdminRole } from "./restaurant-admin-roles";
export { ADMIN_ROLES, ADMIN_ROLE_LABELS, parseAdminRole } from "./restaurant-admin-roles";

// INSERT ... ON CONFLICT DO UPDATE (pas d'upsert Supabase générique : on veut
// le rôle RETOURNÉ, qui peut différer de celui demandé si le trigger de
// quota l'a rétrogradé en équipe — l'appelant doit toujours relire ce
// que la base a réellement persisté, jamais supposer que role == params.role.
export async function upsertRestaurantAdmin(params: {
  restaurantId: string;
  userId: string;
  role: AdminRole;
  invitedBy: string | null;
}): Promise<{ ok: true; role: AdminRole } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("restaurant_admins")
    .upsert(
      {
        restaurant_id: params.restaurantId,
        user_id: params.userId,
        role: params.role,
        invited_by: params.invitedBy,
      },
      { onConflict: "restaurant_id,user_id" }
    )
    .select("role")
    .single();

  if (error || !data) return { ok: false, error: "Erreur lors de l'attribution du siège." };
  return { ok: true, role: (data as { role: AdminRole }).role };
}

// Retrait pur (pas de rétrogradation in place) — voir ADR 0041 §10. Le
// plancher d'un gérant minimum et la resynchro d'owner_id sont tenus par des
// triggers DB (BEFORE/AFTER DELETE), jamais vérifiés ici : cette fonction
// relit juste l'erreur Postgres pour donner un message utile côté UI.
export async function removeRestaurantAdmin(
  restaurantId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurant_admins")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId);

  if (error) {
    if (/dernier gérant/i.test(error.message)) {
      return { ok: false, error: "Impossible de retirer le dernier gérant : il en faut toujours au moins un." };
    }
    return { ok: false, error: "Erreur lors du retrait du siège." };
  }
  return { ok: true };
}

export async function getSeatRole(userId: string, restaurantId: string): Promise<AdminRole | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("restaurant_admins")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: AdminRole } | null)?.role ?? null;
}

export async function isRestaurantAdminSeat(userId: string, restaurantId: string): Promise<boolean> {
  return (await getSeatRole(userId, restaurantId)) !== null;
}

// Compteurs par rôle — pilote l'UI d'invitation (désactiver « gérant » dans
// le sélecteur une fois 2/2 atteints, etc.) ; le vrai plafond reste tenu par
// le trigger DB, ceci n'est qu'un affichage.
export async function getSeatCounts(restaurantId: string): Promise<Record<AdminRole, number>> {
  const admin = createAdminClient();
  const { data } = await admin.from("restaurant_admins").select("role").eq("restaurant_id", restaurantId);
  const counts: Record<AdminRole, number> = { gerant: 0, manager: 0, equipe: 0 };
  for (const row of (data ?? []) as { role: AdminRole }[]) counts[row.role]++;
  return counts;
}

// Union owner_id (legacy, avant backfill ou en cas de désynchro) ∪ sièges —
// alimente lib/post-login.ts, app/admin/page.tsx (sélecteur multi-établissements)
// et la carte gérant sur /r/[id].
export async function getAdminRestaurantIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: owned }, { data: seats }] = await Promise.all([
    admin.from("restaurants").select("id").eq("owner_id", userId),
    admin.from("restaurant_admins").select("restaurant_id").eq("user_id", userId),
  ]);
  const ids = new Set<string>();
  for (const r of (owned ?? []) as { id: string }[]) ids.add(r.id);
  for (const s of (seats ?? []) as { restaurant_id: string }[]) ids.add(s.restaurant_id);
  return Array.from(ids);
}

export type RestaurantAdminRow = {
  userId: string;
  role: AdminRole;
  email: string | null;
  displayName: string | null;
  createdAt: string;
};

// Liste des sièges d'un établissement, avec profil joint — alimente
// app/admin/[restaurantId]/access/page.tsx.
export async function listRestaurantAdmins(restaurantId: string): Promise<RestaurantAdminRow[]> {
  const admin = createAdminClient();
  const { data: seats } = await admin
    .from("restaurant_admins")
    .select("user_id, role, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  const rows = (seats ?? []) as { user_id: string; role: AdminRole; created_at: string }[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles } = await admin.from("profiles").select("id, email, display_name").in("id", userIds);
  const profileById = new Map(
    ((profiles ?? []) as { id: string; email: string | null; display_name: string | null }[]).map((p) => [p.id, p])
  );

  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    email: profileById.get(r.user_id)?.email ?? null,
    displayName: profileById.get(r.user_id)?.display_name ?? null,
    createdAt: r.created_at,
  }));
}
