import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase";
import { getRestaurantDisplayName } from "@/lib/restaurant";

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contact@belchicken.be",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export type CommunityTriggerType = "tier_upgrade" | "member_inactive" | "tier_approaching" | "advancement";
// Stratégies membres (ADR 0024) — messages construits dans member-strategies.ts
export type TriggerType = CommunityTriggerType | "tier_nudge" | "birthday" | "winback";
export type Channel = "push" | "whatsapp" | "in_app";

export function buildMessage(
  trigger: CommunityTriggerType,
  teamName: string,
  teamFlag: string,
  restaurantName: string,
  details?: { newReward?: string; nextReward?: string; ptsNeeded?: number; round?: string }
): string {
  switch (trigger) {
    case "tier_upgrade":
      return `${teamFlag} Ta communauté ${teamName} vient de franchir un palier ! Tu as débloqué : ${details?.newReward ?? "une récompense"} sur chaque commande directe.`;
    case "member_inactive":
      return `${teamFlag} ${teamName} a besoin de toi ! Reviens passer une commande chez ${restaurantName} pour faire progresser ta communauté.`;
    case "tier_approaching":
      return `${teamFlag} Plus que ${details?.ptsNeeded?.toLocaleString("fr-BE")} pts pour débloquer ${details?.nextReward ?? "le prochain bonus"} avec ${teamName} ! Une commande ce soir peut tout changer.`;
    case "advancement":
      return `🏆 ${teamFlag} ${teamName} passe en ${details?.round ?? "tour suivant"} ! Ton bonus d'avancement est actif : présente-toi au comptoir ${restaurantName}.`;
  }
}


export async function sendPush(
  userId: string,
  restaurantId: string,
  message: string
): Promise<boolean> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);

  if (!subs || subs.length === 0) return false;

  const title = await getRestaurantDisplayName(restaurantId);
  const payload = JSON.stringify({ title, body: message, url: `/r/${restaurantId}/dashboard` });

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
    return r.status === "rejected" && (r.reason as { statusCode?: number })?.statusCode === 410;
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

// Fallback WhatsApp — proactive template messages via Meta Business API
// Requiert un template pré-approuvé Meta (WHATSAPP_TEMPLATE_NAME)
export async function sendWhatsApp(phone: string | null, message: string): Promise<boolean> {
  if (!phone) return false;

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!phoneNumberId || !token || !templateName) return false;

  // Normalise: supprime espaces, tirets, parenthèses, garde le + pour l'international
  const cleanPhone = phone.replace(/[\s()\-]/g, "").replace(/^\+/, "");
  if (cleanPhone.length < 8) return false;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: "fr" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: message }],
            },
          ],
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function logNotification(
  userId: string,
  restaurantId: string,
  trigger: TriggerType,
  channel: Channel,
  message: string,
  // null pour les triggers non communautaires (ADR 0024) — un 0 fausserait
  // le calcul « +500 pts depuis la dernière notification » du trigger
  // member_inactive (ADR 0009).
  communityScore: number | null
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
