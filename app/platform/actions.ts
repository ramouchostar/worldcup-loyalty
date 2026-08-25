"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { setPlan, type Plan } from "@/lib/entitlements";
import { settlePlanRequests, markPlanRequestHandled } from "@/lib/plan-requests";
import { sendRestaurantActivatedEmail } from "@/lib/email";
import { createOwnerInviteAndNotify, revokeOwnerInvite } from "@/lib/owner-invites";
import { type AdminRole, parseAdminRole, upsertRestaurantAdmin } from "@/lib/restaurant-admins";

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

// ADR 0033 §2 — date de mise en ligne, distincte de created_at (un resto
// démarché est créé au rendez-vous et activé plus tard). Écrite à part et en
// best-effort : tant que m56 n'est pas appliquée, la colonne n'existe pas et
// l'approbation d'un établissement ne doit pas échouer pour autant.
// `.is("activated_at", null)` garde la PREMIÈRE activation : réactiver un
// établissement désactivé ne le fait pas réapparaître comme nouveau dans la
// courbe d'activations.
async function stampActivatedAt(admin: ReturnType<typeof createAdminClient>, restaurantId: string) {
  const { error } = await admin
    .from("restaurants")
    .update({ activated_at: new Date().toISOString() })
    .eq("id", restaurantId)
    .is("activated_at", null);
  if (error) console.error("[platform] stampActivatedAt failed:", error.message);
}

export async function approveRestaurant(restaurantId: string) {
  const user = await requireSuperAdmin();
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "active" }).eq("id", restaurantId);
  await stampActivatedAt(admin, restaurantId);

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name, profiles!restaurants_owner_id_fkey(email)")
    .eq("id", restaurantId)
    .single();
  const ownerEmail = (restaurant?.profiles as unknown as { email: string | null } | null)?.email;
  if (ownerEmail && restaurant?.name) {
    await sendRestaurantActivatedEmail(ownerEmail, restaurant.name, restaurantId);
  }

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
  if (status === "active") await stampActivatedAt(admin, restaurantId);
  revalidatePath("/platform");
}

// ADR 0033 §1 — bascule démo ↔ réel. Rien d'autre ne change pour
// l'établissement : mêmes données, même console, même parcours membre. Seule
// sa VISIBILITÉ bouge — un compte démo sort des surfaces publiques (accueil,
// /secteurs, /join) et des chiffres réseau, et y rentre en repassant réel.
export async function setRestaurantDemo(restaurantId: string, isDemo: boolean) {
  const user = await requireSuperAdmin();
  if (!user) return;

  const admin = createAdminClient();
  const { error } = await admin.from("restaurants").update({ is_demo: isDemo }).eq("id", restaurantId);
  if (error) console.error("[platform] setRestaurantDemo failed:", error.message);
  revalidatePath("/platform");
  revalidatePath("/platform/stats");
}

// ADR 0029 — flip de plan manuel (Phase 2, en attendant Stripe). Activer un
// plan solde automatiquement les demandes qu'il couvre (m51).
export async function setRestaurantPlanFromForm(formData: FormData) {
  const user = await requireSuperAdmin();
  if (!user) return;

  const restaurantId = (formData.get("restaurantId") as string) ?? "";
  const plan = formData.get("plan") as Plan;
  if (!restaurantId || !["gratuit", "croissance", "pro"].includes(plan)) return;

  await setPlan(restaurantId, plan);
  await settlePlanRequests(restaurantId, plan);
  revalidatePath("/platform");
}

// Activer le plan exactement demandé (bouton de la section « Demandes de plan »).
export async function grantPlanRequest(restaurantId: string, plan: Plan) {
  const user = await requireSuperAdmin();
  if (!user) return;
  await setPlan(restaurantId, plan);
  await settlePlanRequests(restaurantId, plan);
  revalidatePath("/platform");
}

// Ignorer une demande sans changer le plan (lead traité hors app, refus…).
export async function dismissPlanRequest(requestId: string) {
  const user = await requireSuperAdmin();
  if (!user) return;
  await markPlanRequestHandled(requestId);
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
  // ADR 0033 §1 — établissement fictif de démonstration : même création, même
  // code, seule la visibilité diffère (hors surfaces publiques et chiffres).
  const isDemo = formData.get("is_demo") === "on";

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

  // owner_id n'est plus écrit ici directement (ADR 0040) : c'est le trigger
  // de synchro qui le déduit du siège gérant ci-dessous — un
  // seul écrivain pour cette colonne dérivée, partout dans l'app.
  const base = {
    id: slug,
    name,
    sector,
    address,
    status: "active",
  };

  // Créé actif → sa date d'activation est maintenant (ADR 0033 §2).
  let { error } = await admin
    .from("restaurants")
    .insert({ ...base, is_demo: isDemo, activated_at: new Date().toISOString() });
  if (error && isUnknownColumn(error)) {
    // m56 pas encore appliquée : on crée quand même l'établissement, sans le
    // marquage démo — mieux vaut un resto à reclasser qu'un démarchage bloqué.
    ({ error } = await admin.from("restaurants").insert(base));
  }
  if (error) return { error: "Erreur lors de la création. Réessaie." };

  if (ownerId) {
    await upsertRestaurantAdmin({ restaurantId: slug, userId: ownerId, role: "gerant", invitedBy: user.id });
  }

  revalidatePath("/platform");
  revalidatePath("/platform/stats");
  const demoNote = isDemo ? " — compte démo (invisible du public)" : "";
  return { success: `${name} créé (${slug})${demoNote}${ownerNote}.` };
}

// PostgREST signale une colonne inconnue de deux façons selon qu'elle manque
// dans la requête (42703) ou dans son cache de schéma (PGRST204).
function isUnknownColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /is_demo|activated_at/.test(error.message ?? "");
}

// ADR 0032 + ADR 0040 — lien d'invitation restaurateur. Voie PRINCIPALE pour
// donner la console d'un établissement à quelqu'un : contrairement à
// assignOwner (plus bas), elle ne suppose pas qu'il ait déjà un compte —
// c'est son clic qui pose son siège (restaurant_admins), avant ou après son
// inscription. Le rôle est PROPOSÉ ici, confirmé à l'acceptation.
export async function createOwnerInviteFromForm(
  _prevState: { error?: string; url?: string; emailed?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; url?: string; emailed?: boolean }> {
  const user = await requireSuperAdmin();
  if (!user) return { error: "Accès refusé." };

  const restaurantId = (formData.get("restaurant_id") as string)?.trim();
  const email = ((formData.get("owner_email") as string) ?? "").trim().toLowerCase() || null;
  const role = parseAdminRole(formData.get("role"));
  if (!restaurantId) return { error: "Choisis un établissement." };

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

  revalidatePath("/platform");
  return { url: result.url, emailed: result.emailed };
}

// Génération depuis la ligne d'un établissement (liste) — même action, sans
// email : le super-admin copie le lien et l'envoie par le canal qu'il veut.
// Pas de sélecteur de rôle ici (reste un geste one-click) — défaut gérant.
export async function createOwnerInviteForRestaurant(restaurantId: string, role: AdminRole = "gerant") {
  const user = await requireSuperAdmin();
  if (!user) return;
  const admin = createAdminClient();
  const { data: restaurant } = await admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
  await createOwnerInviteAndNotify({
    restaurantId,
    restaurantName: restaurant?.name ?? restaurantId,
    role,
    createdBy: user.id,
  });
  revalidatePath("/platform");
}

// Coupe un lien encore en circulation (mauvais destinataire, deal annulé).
export async function revokeOwnerInviteAction(inviteId: string) {
  const user = await requireSuperAdmin();
  if (!user) return;
  await revokeOwnerInvite(inviteId);
  revalidatePath("/platform");
}

// Ajoute un siège gérant par email — voie directe, réservée au cas où la
// personne a DÉJÀ un compte membre (sinon utiliser le lien d'invitation
// ci-dessus). ADR 0040 — n'écrase plus le gérant existant, ajoute un siège
// (soumis au même plafond de 2 gérants, tenu en base) : le nom de l'action
// reste "assignOwner" pour ne pas faire bouger tous ses appelants, mais elle
// n'écrit plus jamais owner_id directement (le trigger de synchro s'en charge).
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

  const seat = await upsertRestaurantAdmin({
    restaurantId,
    userId: ownerProfile.id,
    role: "gerant",
    invitedBy: user.id,
  });
  if (!seat.ok) return { error: "Erreur lors du rattachement." };

  revalidatePath("/platform");
  const quotaNote = seat.role !== "gerant" ? " — quota de 2 gérants déjà atteint, ajouté en équipe" : "";
  return { success: `${restaurantId} → ${email} (${seat.role})${quotaNote}.` };
}
