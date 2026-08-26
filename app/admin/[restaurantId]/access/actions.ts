"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { parseAdminRole, removeRestaurantAdmin } from "@/lib/restaurant-admins";
import { createOwnerInviteAndNotify, revokeOwnerInvite, getActiveInvitesByRestaurant } from "@/lib/owner-invites";

// ADR 0041 §5/§10 — même garde que la console elle-même (getAdminAccess),
// plus la restriction "peut inviter/retirer un siège" (gérant/manager/
// super-admin, jamais un siège équipe seul — sinon n'importe qui se clone
// ou se retire l'accès). canManageEstablishment couvre ici les deux gestes :
// inviter et retirer partagent le même ensemble de rôles en V1.
async function requireCanManageSeats(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const access = await getAdminAccess(user.id, restaurantId);
  return canManageEstablishment(access) ? user : null;
}

export async function createSeatInviteFromConsole(
  restaurantId: string,
  _prevState: { error?: string; url?: string; emailed?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; url?: string; emailed?: boolean }> {
  const user = await requireCanManageSeats(restaurantId);
  if (!user) return { error: "Accès refusé." };

  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase() || null;
  const role = parseAdminRole(formData.get("role"));

  const admin = createAdminClient();
  const { data: restaurant } = await admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();

  const result = await createOwnerInviteAndNotify({
    restaurantId,
    restaurantName: restaurant?.name ?? restaurantId,
    email,
    role,
    createdBy: user.id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/admin/${restaurantId}/access`);
  return { url: result.url, emailed: result.emailed };
}

export async function revokeSeatInviteFromConsole(restaurantId: string): Promise<void> {
  const user = await requireCanManageSeats(restaurantId);
  if (!user) return;

  const activeInvites = await getActiveInvitesByRestaurant();
  const invite = activeInvites.get(restaurantId);
  if (invite) await revokeOwnerInvite(invite.id);

  revalidatePath(`/admin/${restaurantId}/access`);
}

// ADR 0041 §10 — retrait pur, même ensemble de rôles que l'invitation (par
// symétrie, pas de hiérarchie manager < gérant introduite ici). Le plancher
// d'un gérant minimum par établissement est tenu par un trigger DB
// (enforce_restaurant_admin_min_gerant), pas vérifié ici : cette action
// relaie juste le message d'erreur si la base a bloqué le retrait.
export async function removeSeatFromConsole(restaurantId: string, targetUserId: string): Promise<{ error?: string }> {
  const user = await requireCanManageSeats(restaurantId);
  if (!user) return { error: "Accès refusé." };

  const result = await removeRestaurantAdmin(restaurantId, targetUserId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/admin/${restaurantId}/access`);
  return {};
}
