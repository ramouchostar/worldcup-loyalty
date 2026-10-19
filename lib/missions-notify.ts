import { createAdminClient } from "./supabase";
import { logEvent, restaurantMissionUrl } from "./missions";
import { getRestaurantContactEmail } from "./missions-contact";
import { providerMissionUrl } from "./providers";
import { sendMissionUpdateEmail } from "./email";
import { platformAddress } from "./platform-address";
import type { MissionUpdateInput } from "./email-templates/mission-update";

// ============================================================
// Réserver un prestataire — un e-mail de mise à jour à l'une des parties (restaurateur, prestataire ou plateforme).
// Best-effort, jamais silencieux : l'issue (envoyé ou échoué) est une ligne de `mission_events`.
// ============================================================

type Party = { restaurantId: string; restaurantName: string; providerName: string; providerEmail: string | null; requestedBy: string | null };

async function party(missionId: string): Promise<Party | null> {
  const { data } = await createAdminClient().from("missions").select("restaurant_id, requested_by, restaurants(name), providers(email, display_name)").eq("id", missionId).maybeSingle();
  const r = data as unknown as { restaurant_id: string; requested_by: string | null; restaurants: { name: string } | null; providers: { email: string; display_name: string } | null } | null;
  if (!r) return null;
  return { restaurantId: r.restaurant_id, restaurantName: r.restaurants?.name ?? "Un restaurateur", providerName: r.providers?.display_name ?? "Le prestataire", providerEmail: r.providers?.email ?? null, requestedBy: r.requested_by };
}

/** Les compléments dont un e-mail a besoin (jamais un montant : le prix dépend du plan). */
export type MailExtras = Pick<MissionUpdateInput, "title" | "count" | "deadlineLabel" | "auto" | "free" | "print">;

export async function mailMission(missionId: string, to: "restaurant" | "provider" | "platform", kind: MissionUpdateInput["kind"], extras: MailExtras = {}): Promise<boolean> {
  try {
    const p = await party(missionId);
    if (!p) throw new Error("mission introuvable");
    const address = to === "restaurant" ? await getRestaurantContactEmail(p.restaurantId, p.requestedBy) : to === "provider" ? p.providerEmail : platformAddress();
    if (!address) throw new Error(`aucune adresse pour ${to}`);
    const url = to === "provider" ? providerMissionUrl(missionId) : restaurantMissionUrl(p.restaurantId, missionId);
    const sent = await sendMissionUpdateEmail(address, { kind, audience: to, restaurantName: p.restaurantName, providerName: p.providerName, url, ...extras }, p.restaurantId);
    await logEvent(missionId, { kind: sent ? (to === "provider" ? "provider_notified" : to === "restaurant" ? "restaurant_notified" : "platform_notified") : "notify_failed", actorKind: "system", meta: { channel: "email", about: kind } });
    return sent;
  } catch (e) {
    console.error("[missions-notify] mail failed:", kind, (e as Error).message);
    await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { channel: "email", about: kind } });
    return false;
  }
}
