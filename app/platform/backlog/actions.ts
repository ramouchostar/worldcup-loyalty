"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createBacklogItem, updateBacklogItem, deleteBacklogItem } from "@/lib/backlog";
import {
  BACKLOG_AREAS,
  BACKLOG_STATUSES,
  type BacklogArea,
  type BacklogStatus,
} from "@/lib/backlog-model";

// Même garde locale que app/platform/actions.ts : `lib/admin-guard.ts`
// renvoie des NextResponse, adaptés aux routes API, pas aux Server Actions.
async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

function refresh() {
  revalidatePath("/platform/backlog");
}

// Les valeurs de formulaire viennent d'un <select>, mais rien n'empêche un POST
// forgé : on ne fait jamais confiance au libellé reçu, on le confronte à la
// liste close (qui est aussi la contrainte CHECK en base, m56).
function parseArea(value: FormDataEntryValue | null): BacklogArea {
  return BACKLOG_AREAS.includes(value as BacklogArea) ? (value as BacklogArea) : "produit";
}

function parseStatus(value: FormDataEntryValue | null): BacklogStatus {
  return BACKLOG_STATUSES.includes(value as BacklogStatus) ? (value as BacklogStatus) : "idee";
}

function parseScale(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 3;
}

export async function addBacklogItem(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const user = await requireSuperAdmin();
  if (!user) return { error: "Accès refusé." };

  const title = ((formData.get("title") as string) ?? "").trim();
  if (title.length < 3) return { error: "Donne un titre à l'action (3 caractères minimum)." };

  try {
    await createBacklogItem({
      title,
      details: ((formData.get("details") as string) ?? "").trim() || null,
      area: parseArea(formData.get("area")),
      status: parseStatus(formData.get("status")),
      impact: parseScale(formData.get("impact")),
      effort: parseScale(formData.get("effort")),
      owner: ((formData.get("owner") as string) ?? "").trim() || null,
      restaurantId: ((formData.get("restaurant_id") as string) ?? "").trim() || null,
      dueDate: ((formData.get("due_date") as string) ?? "").trim() || null,
      createdBy: user.id,
    });
  } catch (e) {
    // Cas le plus probable : m56 pas encore appliquée en base.
    console.error("[backlog] addBacklogItem failed:", (e as Error).message);
    return { error: "Enregistrement impossible. La migration m56 est-elle appliquée ?" };
  }

  refresh();
  return { success: `« ${title} » ajouté au backlog.` };
}

// Changer d'état est le geste le plus fréquent d'une revue à deux : il doit
// tenir en un clic, sans ouvrir le formulaire d'édition. Deux formes — un
// bouton lié (« Fait ✓ ») et un sélecteur pour les autres transitions.
export async function setBacklogStatus(id: string, status: BacklogStatus) {
  const user = await requireSuperAdmin();
  if (!user) return;
  if (!BACKLOG_STATUSES.includes(status)) return;
  await updateBacklogItem(id, { status });
  refresh();
}

export async function setBacklogStatusFromForm(formData: FormData) {
  const user = await requireSuperAdmin();
  if (!user) return;
  const id = ((formData.get("id") as string) ?? "").trim();
  if (!id) return;
  await updateBacklogItem(id, { status: parseStatus(formData.get("status")) });
  refresh();
}

export async function editBacklogItem(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireSuperAdmin();
  if (!user) return { error: "Accès refusé." };

  const id = ((formData.get("id") as string) ?? "").trim();
  const title = ((formData.get("title") as string) ?? "").trim();
  if (!id) return { error: "Item introuvable." };
  if (title.length < 3) return { error: "Titre trop court." };

  try {
    await updateBacklogItem(id, {
      title,
      details: ((formData.get("details") as string) ?? "").trim() || null,
      area: parseArea(formData.get("area")),
      status: parseStatus(formData.get("status")),
      impact: parseScale(formData.get("impact")),
      effort: parseScale(formData.get("effort")),
      owner: ((formData.get("owner") as string) ?? "").trim() || null,
      restaurant_id: ((formData.get("restaurant_id") as string) ?? "").trim() || null,
      due_date: ((formData.get("due_date") as string) ?? "").trim() || null,
    });
  } catch (e) {
    console.error("[backlog] editBacklogItem failed:", (e as Error).message);
    return { error: "Modification impossible." };
  }

  refresh();
  return {};
}

export async function removeBacklogItem(id: string) {
  const user = await requireSuperAdmin();
  if (!user) return;
  await deleteBacklogItem(id);
  refresh();
}
