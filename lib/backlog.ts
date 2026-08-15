import { createAdminClient } from "./supabase";
import { clampScale, type BacklogArea, type BacklogItem, type BacklogStatus } from "./backlog-model";

// ADR 0033 §3 — accès base du backlog plateforme. Table service-role only
// (m56) : donnée interne fondateurs, jamais lisible par la clé anon (m34).
// Rien de tout ça n'existe côté membre ni côté restaurateur.
//
// SERVEUR UNIQUEMENT. Le vocabulaire et le calcul de priorité vivent dans
// `lib/backlog-model.ts`, importable par le tableau côté client.

const COLUMNS =
  "id, title, details, area, status, impact, effort, owner, restaurant_id, due_date, created_by, created_at, updated_at, done_at";

// Lecture fail-open : m56 pas encore appliquée → backlog vide, jamais un 500
// sur la console plateforme.
export async function listBacklog(): Promise<BacklogItem[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_backlog")
      .select(COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as BacklogItem[]) ?? [];
  } catch (e) {
    console.error("[backlog] listBacklog failed:", (e as Error).message);
    return [];
  }
}

export type BacklogInput = {
  title: string;
  details?: string | null;
  area?: BacklogArea;
  status?: BacklogStatus;
  impact?: number;
  effort?: number;
  owner?: string | null;
  restaurantId?: string | null;
  dueDate?: string | null;
  createdBy?: string | null;
};

// Écritures : l'erreur REMONTE (contrairement aux lectures). Ce sont des
// actions explicites — l'appelant doit pouvoir rapporter un échec plutôt que
// laisser croire que l'item est enregistré.
export async function createBacklogItem(input: BacklogInput): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_backlog").insert({
    title: input.title,
    details: input.details ?? null,
    area: input.area ?? "produit",
    status: input.status ?? "idee",
    impact: clampScale(input.impact),
    effort: clampScale(input.effort),
    owner: input.owner ?? null,
    restaurant_id: input.restaurantId ?? null,
    due_date: input.dueDate ?? null,
    created_by: input.createdBy ?? null,
  });
  if (error) throw new Error(error.message);
}

export type BacklogPatch = Partial<
  Pick<BacklogItem, "title" | "details" | "area" | "status" | "impact" | "effort" | "owner" | "due_date">
> & { restaurant_id?: string | null };

export async function updateBacklogItem(id: string, patch: BacklogPatch): Promise<void> {
  const admin = createAdminClient();
  const row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.impact !== undefined) row.impact = clampScale(patch.impact);
  if (patch.effort !== undefined) row.effort = clampScale(patch.effort);
  // done_at suit le statut dans les DEUX sens : rouvrir un item efface sa date
  // de clôture, sinon l'historique raconte une livraison qui n'a pas eu lieu.
  if (patch.status !== undefined) {
    row.done_at = patch.status === "fait" ? new Date().toISOString() : null;
  }
  const { error } = await admin.from("platform_backlog").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBacklogItem(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_backlog").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
