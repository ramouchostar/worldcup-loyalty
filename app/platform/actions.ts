"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

export async function approveRestaurant(restaurantId: string) {
  const user = await requireSuperAdmin();
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "active" }).eq("id", restaurantId);
  revalidatePath("/platform");
}

export async function rejectRestaurant(restaurantId: string) {
  const user = await requireSuperAdmin();
  if (!user) return;

  // On garde la ligne et son catalogue plutôt que supprimer — le
  // restaurateur peut réviser et resoumettre.
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "disabled" }).eq("id", restaurantId);
  revalidatePath("/platform");
}
