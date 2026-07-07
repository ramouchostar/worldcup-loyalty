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

// Bascule active ↔ disabled sur n'importe quel établissement. Jamais de
// suppression : désactiver préserve l'historique (commandes, récompenses)
// et reste réversible.
export async function setRestaurantStatus(restaurantId: string, status: "active" | "disabled") {
  const user = await requireSuperAdmin();
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("restaurants").update({ status }).eq("id", restaurantId);
  revalidatePath("/platform");
}

// Création directe par la plateforme (démarchage terrain : on inscrit le
// resto pour lui). Créé directement 'active' — c'est nous qui validons.
// L'owner est optionnel : rattaché par email si le compte existe déjà,
// sinon à réassigner plus tard depuis cette console.
export async function createRestaurantAsSuperAdmin(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const user = await requireSuperAdmin();
  if (!user) return { error: "Accès refusé." };

  const name = (formData.get("name") as string)?.trim();
  const sector = (formData.get("sector") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const ownerEmail = (formData.get("owner_email") as string)?.trim().toLowerCase() || null;

  if (!name || name.length < 2) return { error: "Nom de l'établissement requis." };
  if (!sector || sector.length < 2) return { error: "Secteur (ville/quartier) requis." };

  const admin = createAdminClient();

  let ownerId: string | null = null;
  let ownerNote = "";
  if (ownerEmail) {
    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();
    if (ownerProfile) {
      ownerId = ownerProfile.id;
    } else {
      ownerNote = ` (aucun compte pour ${ownerEmail} — owner à rattacher quand il sera inscrit)`;
    }
  }

  const { generateRestaurantSlug } = await import("@/lib/restaurant");
  const slug = await generateRestaurantSlug(name);

  const { error } = await admin.from("restaurants").insert({
    id: slug,
    name,
    sector,
    address,
    owner_id: ownerId,
    status: "active",
  });
  if (error) return { error: "Erreur lors de la création. Réessaie." };

  revalidatePath("/platform");
  return { success: `${name} créé (${slug})${ownerNote}.` };
}

// Rattache / réassigne l'owner d'un établissement par email.
export async function assignOwner(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const user = await requireSuperAdmin();
  if (!user) return { error: "Accès refusé." };

  const restaurantId = (formData.get("restaurant_id") as string)?.trim();
  const email = (formData.get("owner_email") as string)?.trim().toLowerCase();
  if (!restaurantId || !email) return { error: "Établissement et email requis." };

  const admin = createAdminClient();
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!ownerProfile) return { error: `Aucun compte membre avec l'email ${email}.` };

  const { error } = await admin
    .from("restaurants")
    .update({ owner_id: ownerProfile.id })
    .eq("id", restaurantId);
  if (error) return { error: "Erreur lors du rattachement." };

  revalidatePath("/platform");
  return { success: `Owner de ${restaurantId} → ${email}.` };
}
