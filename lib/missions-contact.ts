import { createAdminClient } from "./supabase";

/**
 * L'adresse du restaurateur à prévenir pour une mission : celui qui a envoyé le brief, sinon le
 * propriétaire de l'établissement. `null` si personne n'a d'adresse — l'appelant le TRACE (jamais
 * un e-mail perdu en silence, ADR 0065).
 */
export async function getRestaurantContactEmail(restaurantId: string, requestedBy: string | null): Promise<string | null> {
  const admin = createAdminClient();
  if (requestedBy) {
    const { data } = await admin.from("profiles").select("email").eq("id", requestedBy).maybeSingle();
    const email = (data as { email: string | null } | null)?.email;
    if (email) return email;
  }
  const { data: r } = await admin.from("restaurants").select("profiles!restaurants_owner_id_fkey(email)").eq("id", restaurantId).maybeSingle();
  return ((r as { profiles?: { email?: string | null } | null } | null)?.profiles?.email as string | null | undefined) ?? null;
}
