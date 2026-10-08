import { createAdminClient } from "./supabase";

// ADR 0081 §6 — demandes de services marketing (pub dans la zone, vidéos)
// depuis les missions de la console, avant que ces services ne soient intégrés
// à l'app. Même modèle que les demandes de plan (lib/plan-requests.ts) : le
// restaurateur demande, l'équipe voit la demande sur /platform et rappelle.
// Table `service_requests` (migration 20261008-1053), service-role only.

export type ServiceKind = "pub" | "video";
export const SERVICE_KINDS: readonly ServiceKind[] = ["pub", "video"];

export type ServiceRequest = {
  id: string;
  restaurant_id: string;
  service: ServiceKind;
  source: string | null;
  created_at: string;
};

export type RequestServiceResult = "created" | "already_pending" | "error";

/** Idempotent grâce à l'index unique partiel : une demande en attente suffit. */
export async function requestService(
  restaurantId: string,
  service: ServiceKind,
  source: string | null,
  requestedBy: string
): Promise<RequestServiceResult> {
  try {
    const { error } = await createAdminClient()
      .from("service_requests")
      .insert({ restaurant_id: restaurantId, service, source, requested_by: requestedBy });
    if (!error) return "created";
    if (error.code === "23505") return "already_pending";
    throw error;
  } catch (e) {
    // Migration absente comprise : la route répond une erreur, jamais un faux « c'est noté ».
    console.error("[service-requests] requestService failed:", (e as Error).message);
    return "error";
  }
}

/** Services déjà demandés et en attente pour un établissement (fail-open : aucun). */
export async function pendingServicesFor(restaurantId: string): Promise<ServiceKind[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("service_requests")
      .select("service")
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending");
    if (error) throw error;
    return ((data ?? []) as { service: ServiceKind }[]).map((r) => r.service);
  } catch (e) {
    console.error("[service-requests] pendingServicesFor failed:", (e as Error).message);
    return [];
  }
}

/** Demandes en attente pour /platform — section vide si la migration manque. */
export async function getPendingServiceRequests(): Promise<ServiceRequest[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("service_requests")
      .select("id, restaurant_id, service, source, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as ServiceRequest[]) ?? [];
  } catch (e) {
    console.error("[service-requests] getPendingServiceRequests failed:", (e as Error).message);
    return [];
  }
}

export async function markServiceRequestHandled(id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("service_requests")
    .update({ status: "handled", handled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[service-requests] markServiceRequestHandled failed:", error.message);
}
