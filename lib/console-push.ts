import webpush from "web-push";
import { createAdminClient } from "./supabase";

// Push de la console restaurateur (ADR 0077 §2). Mêmes clés VAPID et même
// service worker que les membres, abonnements à part
// (console_push_subscriptions). SERVEUR UNIQUEMENT, fail-open : sans clé ni
// table, rien ne part et rien ne casse.

let configured = false;
function configure(): boolean {
  if (configured) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contact@boosteats.be",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export type ConsolePushPayload = { title: string; body: string; url: string };

/** Envoie à tous les appareils abonnés de cette personne pour cet établissement. */
export async function sendConsolePush(userId: string, restaurantId: string, payload: ConsolePushPayload): Promise<"sent" | "no_device" | "failed"> {
  if (!configure()) return "failed";
  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("console_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);
  if (error) return "failed";
  if (!subs || subs.length === 0) return "no_device";

  const body = JSON.stringify({ ...payload, icon: "/icons/icon-boosteats.png" });
  const results = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body))
  );

  // Abonnement expiré (404 / 410) : on le retire, il ne reviendra pas.
  const stale = subs.filter((_, i) => {
    const r = results[i];
    const code = r.status === "rejected" ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return code === 404 || code === 410;
  });
  if (stale.length > 0) {
    await admin
      .from("console_push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .in("endpoint", stale.map((s) => s.endpoint));
  }
  return results.some((r) => r.status === "fulfilled") ? "sent" : "failed";
}
