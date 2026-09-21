import { createAdminClient } from "./supabase";
import { listLiveRestaurants } from "./demo";
import { addToTotals, emptyTotals, totalsByKey, type SendRow, type SendTotals } from "./message-catalog";
import { isMissingJournal, listMessageSettings, type MessageSetting } from "./message-log";

// Lecture de /platform/messages (ADR 0063) — SERVEUR UNIQUEMENT. Deux sources :
//   message_sends     — e-mails et pushs transactionnels (journal, 20260921-1615)
//   notification_log  — notifications automatiques et annonces (ADR 0009/0039)
// Les chiffres de notifications sont bornés au réseau réel (comptes démo
// exclus, ADR 0033) : le cron joue aussi les établissements de démonstration,
// dont les faux membres gonfleraient tout.

export const OVERVIEW_DAYS = 30;
const ROW_CAP = 20_000;
const RECENT_LIMIT = 40;

export type RecentSend = {
  id: string;
  created_at: string;
  restaurant: string | null;
  message_key: string;
  channel: string;
  status: string;
  error: string | null;
  clicked: boolean;
};

export type NotificationCount = { key: string; push: number; whatsapp: number; in_app: number; total: number };

export type MessagesOverview = {
  journalAvailable: boolean;
  windowDays: number;
  email: SendTotals; // e-mails du réseau sur la fenêtre, tests exclus
  byKey: Record<string, SendTotals>;
  unreachable: number; // pushs sans appareil abonné
  notifications: NotificationCount[];
  lastSentAt: string | null;
  lastFailure: { at: string; key: string; error: string } | null;
  failureReasons: { error: string; count: number }[];
  recent: RecentSend[];
  restaurants: { id: string; name: string }[];
  settings: MessageSetting[];
  settingsAvailable: boolean;
  optOuts: Record<string, number>; // arrêts demandés, par séquence
  truncated: boolean;
};

type JournalRow = SendRow & { created_at: string; error: string | null; restaurant_id: string | null };

export async function getMessagesOverview(now = new Date()): Promise<MessagesOverview> {
  const admin = createAdminClient();
  const since = new Date(now.getTime() - OVERVIEW_DAYS * 86_400_000).toISOString();

  const [live, allRestaurantsRes, sendsRes, recentRes, lastSentRes, { settings, available: settingsAvailable }] = await Promise.all([
    listLiveRestaurants<{ id: string; name: string }>(admin, "id, name"),
    admin.from("restaurants").select("id, name"),
    admin
      .from("message_sends")
      .select("message_key, channel, status, clicked_at, delivered_at, created_at, error, restaurant_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),
    admin
      .from("message_sends")
      .select("id, created_at, restaurant_id, message_key, channel, status, error, clicked_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    admin
      .from("message_sends")
      .select("created_at")
      .eq("channel", "email")
      .in("status", ["sent", "delivered"])
      .order("created_at", { ascending: false })
      .limit(1),
    listMessageSettings(),
  ]);

  const names = new Map(((allRestaurantsRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const journalAvailable = !isMissingJournal(sendsRes.error);
  const rows = (sendsRes.data ?? []) as JournalRow[];

  const emailRows = rows.filter((r) => r.channel === "email" && r.message_key !== "test");
  const email = emailRows.reduce(addToTotals, emptyTotals());
  // Canal « none » : soit un tirage témoin (compté par séquence), soit un
  // push sans appareil abonné (compté à part, « non joignable »).
  const isUnreachable = (r: JournalRow) => r.channel === "none" && r.status === "failed";
  const byKeyMap = totalsByKey(rows.filter((r) => !isUnreachable(r)));
  const byKey: Record<string, SendTotals> = Object.fromEntries(byKeyMap);
  const unreachable = rows.filter(isUnreachable).length;

  const failures = rows.filter((r) => r.status === "failed" && r.channel !== "none");
  const reasonCounts = new Map<string, number>();
  for (const f of failures) {
    const reason = f.error ?? "Erreur inconnue";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const failureReasons = [...reasonCounts.entries()]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const lastFailure = failures[0]
    ? { at: failures[0].created_at, key: failures[0].message_key, error: failures[0].error ?? "Erreur inconnue" }
    : null;

  // Notifications du réseau réel (notification_log, ADR 0009).
  const liveIds = live.map((r) => r.id);
  let notifications: NotificationCount[] = [];
  if (liveIds.length > 0) {
    const { data: notifRows } = await admin
      .from("notification_log")
      .select("trigger_type, channel")
      .in("restaurant_id", liveIds)
      .gte("sent_at", since)
      .limit(ROW_CAP);
    const byTrigger = new Map<string, NotificationCount>();
    for (const n of (notifRows ?? []) as { trigger_type: string; channel: string }[]) {
      const c = byTrigger.get(n.trigger_type) ?? { key: n.trigger_type, push: 0, whatsapp: 0, in_app: 0, total: 0 };
      if (n.channel === "push") c.push += 1;
      else if (n.channel === "whatsapp") c.whatsapp += 1;
      else c.in_app += 1;
      c.total += 1;
      byTrigger.set(n.trigger_type, c);
    }
    notifications = [...byTrigger.values()].sort((a, b) => b.total - a.total);
  }

  // Arrêts « ne plus recevoir » par séquence (migration 20260921-2119).
  const optOuts: Record<string, number> = {};
  const { data: optRows } = await admin.from("message_optouts").select("message_key").limit(ROW_CAP);
  for (const r of (optRows ?? []) as { message_key: string }[]) optOuts[r.message_key] = (optOuts[r.message_key] ?? 0) + 1;

  const recent: RecentSend[] = ((recentRes.data ?? []) as {
    id: string; created_at: string; restaurant_id: string | null; message_key: string; channel: string; status: string; error: string | null; clicked_at: string | null;
  }[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    restaurant: r.restaurant_id ? names.get(r.restaurant_id) ?? r.restaurant_id : null,
    message_key: r.message_key,
    channel: r.channel,
    status: r.status,
    error: r.error,
    clicked: !!r.clicked_at,
  }));

  return {
    journalAvailable,
    windowDays: OVERVIEW_DAYS,
    email,
    byKey,
    unreachable,
    notifications,
    lastSentAt: ((lastSentRes.data ?? []) as { created_at: string }[])[0]?.created_at ?? null,
    lastFailure,
    failureReasons,
    recent,
    restaurants: live.map((r) => ({ id: r.id, name: r.name })),
    settings,
    settingsAvailable: settingsAvailable && journalAvailable,
    optOuts,
    truncated: rows.length >= ROW_CAP,
  };
}
