import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase";

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contact@belchicken.be",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export type TriggerType = "tier_upgrade" | "member_inactive" | "tier_approaching" | "advancement";
export type Channel = "push" | "in_app";

export function buildMessage(
  trigger: TriggerType,
  teamName: string,
  teamFlag: string,
  details?: { newReward?: string; nextReward?: string; ptsNeeded?: number; round?: string }
): string {
  switch (trigger) {
    case "tier_upgrade":
      return `${teamFlag} Ta communauté ${teamName} vient de franchir un palier ! Tu as débloqué : ${details?.newReward ?? "une récompense"}.`;
    case "member_inactive":
      return `${teamFlag} ${teamName} a besoin de toi ! Reviens passer une commande chez Belchicken pour faire progresser ta communauté.`;
    case "tier_approaching":
      return `${teamFlag} Plus que ${details?.ptsNeeded?.toLocaleString("fr-BE")} pts pour débloquer ${details?.nextReward ?? "le prochain bonus"} avec ${teamName} !`;
    case "advancement":
      return `🏆 ${teamFlag} ${teamName} passe en ${details?.round ?? "tour suivant"} ! Tu gagnes une récompense d'avancement à ta prochaine visite.`;
  }
}

export async function sendPush(
  userId: string,
  restaurantId: string,
  message: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);

  if (!subs || subs.length === 0) return false;

  const payload = JSON.stringify({ title: "Belchicken", body: message, url: "/dashboard" });

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Nettoyer les abonnements expirés (410 Gone)
  const stale = subs.filter((_, i) => {
    const r = results[i];
    return r.status === "rejected" && (r.reason as any)?.statusCode === 410;
  });
  if (stale.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", stale.map(s => s.endpoint));
  }

  return results.some(r => r.status === "fulfilled");
}

export async function logNotification(
  userId: string,
  restaurantId: string,
  trigger: TriggerType,
  channel: Channel,
  message: string,
  communityScore: number
) {
  const admin = createAdminClient();
  await Promise.all([
    admin.from("notification_log").insert({
      user_id: userId,
      restaurant_id: restaurantId,
      trigger_type: trigger,
      channel,
      community_score_at_send: communityScore,
      message_body: message,
    }),
    admin
      .from("profiles")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("id", userId),
  ]);
}
