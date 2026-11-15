// Lecture de l'espace Marketing (ADR 0104 §1) — service-role, UN établissement, appelée après
// le contrôle d'accès du layout. lib/marketing-space.ts calcule. Chaque bloc se lit à part :
// une panne n'ôte que son bloc, se dit à l'écran (« lecture impossible ») et dans les journaux
// (`[marketing] <bloc> : …`). Jamais un zéro qui passerait pour un vrai chiffre.

import { createAdminClient } from "./supabase";
import { fetchAllRowsStrict } from "./paged-select";
import { brusselsDay } from "./console-journey";
import { getConsentingUserIds } from "./consent";
import { listScheduledBroadcasts } from "./broadcast";
import { listTodayIdeas } from "./agents/proposals";
import { loadRevenueTracker } from "./revenue-tracker-data";
import { listRequests, pubAvailability, type RequestView } from "./ads/requests";
import { voucherCounts } from "./ads/vouchers-data";
import { NO_VOUCHERS, offerOf, type VoucherCounts } from "./ads/vouchers";
import { MARKETING_ASSISTANTS, addDays, groupAnnouncements, type Announcement, type MarketingIdea, type RevenueDay } from "./marketing-space";

export type Block<T> = { ok: true; data: T } | { ok: false };

async function block<T>(label: string, read: () => Promise<T>): Promise<Block<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (e) {
    console.error(`[marketing] ${label} :`, (e as Error).message);
    return { ok: false };
  }
}

const dayStartIso = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 2 * 3_600_000).toISOString();

export function loadMarketingIdeas(restaurantId: string): Promise<Block<MarketingIdea[]>> {
  return block("idées", async () => {
    const t = await listTodayIdeas(restaurantId);
    if (t.unavailable) return [];
    return t.toDecide
      .filter((r) => MARKETING_ASSISTANTS.includes(r.assistant))
      .map((r) => ({ id: r.id, assistant: r.assistant, title: r.content.title, question: r.content.question, lines: r.content.lines }));
  });
}

export function loadRevenueDays(restaurantId: string, today: string): Promise<Block<RevenueDay[]>> {
  return block("chiffre d'affaires", async () => (await loadRevenueTracker(restaurantId, today, 70)).days);
}

export type Audience = { members: number; promoReachable: number; pushSubscribers: number };

export function loadAudience(restaurantId: string): Promise<Block<Audience>> {
  return block("publics", async () => {
    const admin = createAdminClient();
    const [members, subs] = await Promise.all([
      fetchAllRowsStrict<{ user_id: string }>("Marketing : membres", (a, b) =>
        admin.from("memberships").select("user_id").eq("restaurant_id", restaurantId).order("user_id").range(a, b)
      ),
      fetchAllRowsStrict<{ user_id: string }>("Marketing : notifications", (a, b) =>
        admin.from("push_subscriptions").select("user_id").eq("restaurant_id", restaurantId).order("id").range(a, b)
      ),
    ]);
    const ids = [...new Set(members.map((m) => m.user_id))];
    // ADR 0022 + 0039 : une promo ne part qu'aux clients qui ont dit oui.
    const consenting = ids.length ? await getConsentingUserIds(ids, "marketing_push", admin) : new Set<string>();
    return { members: ids.length, promoReachable: consenting.size, pushSubscribers: new Set(subs.map((s) => s.user_id)).size };
  });
}

/** Les annonces envoyées depuis 60 jours (journal, une ligne par membre), et les jours des tickets validés. */
export function loadAnnouncementsAndTickets(restaurantId: string, today: string): Promise<Block<{ announcements: Announcement[]; ticketDays: string[] }>> {
  return block("annonces", async () => {
    const admin = createAdminClient();
    const since = addDays(today, -60);
    const [log, orders] = await Promise.all([
      fetchAllRowsStrict<{ message_body: string | null; sent_at: string }>("Marketing : annonces", (a, b) =>
        admin
          .from("notification_log")
          .select("message_body, sent_at")
          .eq("restaurant_id", restaurantId)
          .in("trigger_type", ["admin_broadcast", "admin_service"])
          .gte("sent_at", dayStartIso(since))
          .order("id")
          .range(a, b)
      ),
      fetchAllRowsStrict<{ order_date: string }>("Marketing : tickets", (a, b) =>
        admin
          .from("orders")
          .select("order_date")
          .eq("restaurant_id", restaurantId)
          .eq("status", "validated")
          .gte("order_date", addDays(since, -7))
          .order("id")
          .range(a, b)
      ),
    ]);
    return {
      announcements: groupAnnouncements(log.map((r) => ({ day: brusselsDay(r.sent_at), message: r.message_body }))),
      ticketDays: orders.map((o) => String(o.order_date).slice(0, 10)),
    };
  });
}

export type Scheduled = { id: string; message: string; sendOn: string };

export function loadScheduled(restaurantId: string): Promise<Block<Scheduled[]>> {
  return block("annonces programmées", async () =>
    (await listScheduledBroadcasts(restaurantId))
      .filter((s) => !s.sent_at)
      .map((s) => ({ id: s.id, message: s.message, sendOn: s.send_on }))
      .sort((a, b) => (a.sendOn < b.sendOn ? -1 : 1))
  );
}

export type PubBlock = {
  open: boolean;
  requests: (RequestView & { vouchers: VoucherCounts; hasVoucher: boolean })[];
};

/** La Pub : fermée → `open: false` sans lecture ; ouverte → les demandes et leurs bons. */
export function loadPub(restaurantId: string, isSuperAdmin: boolean): Promise<Block<PubBlock>> {
  return block("pub", async () => {
    const av = await pubAvailability(restaurantId, isSuperAdmin);
    if (!av.open) return { open: false, requests: [] };
    const list = await listRequests(restaurantId);
    if (!list.ok) throw new Error("lecture des demandes impossible");
    const requests = list.requests.filter((r) => r.status !== "annulee");
    const counts = await voucherCounts(requests.map((r) => r.id));
    return {
      open: true,
      requests: requests.map((r) => ({
        ...r,
        vouchers: counts.get(r.id) ?? NO_VOUCHERS,
        // Une pub « Visites » avec offre mène au bon (ADR 0104 §2) ; une notoriété avec mot clé, non.
        hasVoucher: r.objective === "TRAFIC" && offerOf({ text: r.offerText, keyword: r.offerKeyword, from: r.offerFrom, to: r.offerTo }) !== null,
      })),
    };
  });
}
