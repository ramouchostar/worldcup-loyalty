// Lecture de la page « Stats » (lib/stats-page.ts calcule, cette page lit) —
// service-role, UN établissement, appelée après le contrôle d'accès du layout.
//
// Chaque bloc se lit SÉPARÉMENT : une table absente ou une panne vide ce bloc
// seul, qui dit « indisponible » à l'écran et laisse sa ligne dans les logs
// (`[stats] <bloc> : …`). Jamais un zéro qui passerait pour un vrai chiffre.

import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase";
import { fetchAllRowsStrict } from "./paged-select";
import { brusselsDay } from "./console-journey";
import { loadRevenueTracker } from "./revenue-tracker-data";
import { isPlacesConfigured, placeRating } from "./audit/places";
import type { DayRange, StatsItemLine, StatsTicket } from "./stats-page";

export type Block<T> = { ok: true; data: T } | { ok: false };

async function block<T>(label: string, read: () => Promise<T>): Promise<Block<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (e) {
    console.error(`[stats] ${label} :`, (e as Error).message);
    return { ok: false };
  }
}

/** Début de la journée belge `day`, en instant ISO (pour filtrer un horodatage). */
function dayStartIso(day: string): string {
  // Au plus large : minuit UTC moins 2 h couvre l'heure d'été comme d'hiver ;
  // le filtre exact se fait ensuite par brusselsDay().
  return new Date(Date.parse(`${day}T00:00:00Z`) - 2 * 3_600_000).toISOString();
}

// ── Tickets (tout l'historique : « nouveau » et « revenu » en dépendent) ───────

export function loadTickets(restaurantId: string): Promise<Block<StatsTicket[]>> {
  return block("tickets", async () => {
    const admin = createAdminClient();
    const rows = await fetchAllRowsStrict<{ user_id: string | null; order_date: string; amount: number | null }>(
      "Stats : tickets",
      (from, to) =>
        admin
          .from("orders")
          .select("user_id, order_date, amount")
          .eq("restaurant_id", restaurantId)
          .eq("status", "validated")
          .order("id")
          .range(from, to)
    );
    return rows
      .filter((r) => r.user_id)
      .map((r) => ({ userId: r.user_id as string, day: String(r.order_date).slice(0, 10), amount: Number(r.amount) || 0 }));
  });
}

/** Jours (belges) où un cadeau a été récupéré, depuis `from`. */
export function loadGiftDays(restaurantId: string, from: string): Promise<Block<string[]>> {
  return block("cadeaux", async () => {
    const admin = createAdminClient();
    const rows = await fetchAllRowsStrict<{ redeemed_at: string | null }>("Stats : cadeaux", (a, b) =>
      admin
        .from("pending_rewards")
        .select("redeemed_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "redeemed")
        .gte("redeemed_at", dayStartIso(from))
        .order("id")
        .range(a, b)
    );
    return rows.filter((r) => r.redeemed_at).map((r) => brusselsDay(r.redeemed_at as string));
  });
}

// ── Chiffre d'affaires ─────────────────────────────────────────────────────

export function loadRevenue(restaurantId: string, today: string, since: string) {
  // Assez loin pour couvrir la période ET sa comparaison (mois d'avant).
  const days = Math.max(70, Math.ceil((Date.parse(today) - Date.parse(since)) / 86_400_000) + 40);
  return block("chiffre d'affaires", () => loadRevenueTracker(restaurantId, today, days));
}

// ── Google ───────────────────────────────────────────────────────────────────

// Une lecture Places par établissement toutes les 6 h au plus : la note bouge
// lentement, et chaque appel est payé.
const cachedRating = unstable_cache(
  async (placeId: string) => placeRating(placeId),
  ["stats-place-rating"],
  { revalidate: 6 * 3600 }
);

export type GoogleBlock = {
  /** null : pas de fiche liée, ou Places non configuré, ou fiche sans note. */
  rating: { rating: number; count: number } | null;
  /** Lecture de la note tentée et échouée (dit à l'écran). */
  ratingFailed: boolean;
  /** Défi « avis Google » accompli par des membres du programme (micro-actions validées). */
  reviews: ChallengeCount;
};

/** Membres qui ont accompli un défi de l'appli : depuis le début (jusqu'à la fin de la période) et dans la période. */
export type ChallengeCount = { total: number; inPeriod: number };

export type SocialBlock = {
  networks: { key: "instagram_follow" | "tiktok_follow" | "facebook_follow"; label: string; follows: ChallengeCount }[];
};

type RestaurantLinks = {
  google_place_id: string | null;
  google_maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
};

// Un défi par membre et par type (UNIQUE user_id, reward_type) : compter les
// défis validés, c'est compter les membres qui l'ont accompli.
async function loadClaims(restaurantId: string, range: DayRange): Promise<Record<string, ChallengeCount>> {
  const admin = createAdminClient();
  const rows = await fetchAllRowsStrict<{ reward_type: string; claimed_at: string }>("Stats : défis", (a, b) =>
    admin
      .from("micro_reward_claims")
      .select("reward_type, claimed_at")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .order("id")
      .range(a, b)
  );
  const out: Record<string, ChallengeCount> = {};
  for (const r of rows) {
    const d = brusselsDay(r.claimed_at);
    if (d > range.to) continue;
    const c = (out[r.reward_type] ??= { total: 0, inPeriod: 0 });
    c.total += 1;
    if (d >= range.from) c.inPeriod += 1;
  }
  return out;
}

export async function loadReputation(
  restaurantId: string,
  range: DayRange
): Promise<{ google: Block<GoogleBlock>; social: Block<SocialBlock> }> {
  const admin = createAdminClient();
  const links = await block("liens de l'établissement", async () => {
    const { data, error } = await admin
      .from("restaurants")
      .select("google_place_id, google_maps_url, instagram_url, tiktok_url, facebook_url")
      .eq("id", restaurantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as RestaurantLinks | null;
  });
  const claims = await block("actions des membres", () => loadClaims(restaurantId, range));
  if (!claims.ok) return { google: { ok: false }, social: { ok: false } };
  const l = links.ok ? links.data : null;

  let rating: GoogleBlock["rating"] = null;
  let ratingFailed = false;
  if (l?.google_place_id && isPlacesConfigured()) {
    try {
      rating = await cachedRating(l.google_place_id);
    } catch (e) {
      ratingFailed = true;
      console.error("[stats] note Google :", (e as Error).message);
    }
  }

  // Un réseau s'affiche s'il est relié OU si des membres y ont déjà fait le défi.
  const zero: ChallengeCount = { total: 0, inPeriod: 0 };
  const networks: SocialBlock["networks"] = [];
  const NETS = [
    { key: "instagram_follow", label: "Instagram", url: l?.instagram_url },
    { key: "tiktok_follow", label: "TikTok", url: l?.tiktok_url },
    { key: "facebook_follow", label: "Facebook", url: l?.facebook_url },
  ] as const;
  for (const n of NETS) {
    const c = claims.data[n.key];
    if (n.url || c) networks.push({ key: n.key, label: n.label, follows: c ?? zero });
  }

  return {
    google: { ok: true, data: { rating, ratingFailed, reviews: claims.data.google_review ?? { total: 0, inPeriod: 0 } } },
    social: { ok: true, data: { networks } },
  };
}

// ── Messages aux clients ────────────────────────────────────────────────────

export type MessagesBlock = {
  emailsSent: number;
  emailsDelivered: number;
  emailsClicked: number;
  /** Clients qui ont accepté les notifications de cet établissement (aujourd'hui). */
  pushReachable: number;
  /** Annonces envoyées dans la période (une annonce = un message, quel que soit le nombre de clients). */
  announcements: number;
};

export function loadMessages(restaurantId: string, range: DayRange): Promise<Block<MessagesBlock>> {
  return block("messages", async () => {
    const admin = createAdminClient();
    const [emails, subs, log] = await Promise.all([
      fetchAllRowsStrict<{ status: string; created_at: string; delivered_at: string | null; clicked_at: string | null }>(
        "Stats : e-mails",
        (a, b) =>
          admin
            .from("message_sends")
            .select("status, created_at, delivered_at, clicked_at")
            .eq("restaurant_id", restaurantId)
            .eq("audience", "member")
            .eq("channel", "email")
            .gte("created_at", dayStartIso(range.from))
            .order("id")
            .range(a, b)
      ),
      fetchAllRowsStrict<{ user_id: string }>("Stats : abonnés aux notifications", (a, b) =>
        admin.from("push_subscriptions").select("user_id").eq("restaurant_id", restaurantId).order("id").range(a, b)
      ),
      fetchAllRowsStrict<{ message_body: string | null; sent_at: string }>("Stats : annonces", (a, b) =>
        admin
          .from("notification_log")
          .select("message_body, sent_at")
          .eq("restaurant_id", restaurantId)
          .in("trigger_type", ["admin_broadcast", "admin_service"])
          .gte("sent_at", dayStartIso(range.from))
          .order("id")
          .range(a, b)
      ),
    ]);
    const inRangeTs = (ts: string) => {
      const d = brusselsDay(ts);
      return d >= range.from && d <= range.to;
    };
    const mails = emails.filter((e) => inRangeTs(e.created_at) && e.status !== "failed" && e.status !== "holdout");
    const announcements = new Set(
      log.filter((r) => inRangeTs(r.sent_at)).map((r) => `${brusselsDay(r.sent_at)}|${r.message_body ?? ""}`)
    );
    return {
      emailsSent: mails.length,
      emailsDelivered: mails.filter((e) => e.delivered_at || e.status === "delivered").length,
      emailsClicked: mails.filter((e) => e.clicked_at).length,
      pushReachable: new Set(subs.map((s) => s.user_id)).size,
      announcements: announcements.size,
    };
  });
}

// ── Ce qui se vend (Croissance et Pro) ──────────────────────────────────────

export function loadItemLines(restaurantId: string, range: DayRange): Promise<Block<StatsItemLine[]>> {
  return block("plats vendus", async () => {
    const admin = createAdminClient();
    const [orders, menu] = await Promise.all([
      fetchAllRowsStrict<{ id: string }>("Stats : tickets de la période", (a, b) =>
        admin
          .from("orders")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("status", "validated")
          .gte("order_date", range.from)
          .lte("order_date", range.to)
          .order("id")
          .range(a, b)
      ),
      admin.from("menu_items").select("id, name").eq("restaurant_id", restaurantId),
    ]);
    if (menu.error) throw new Error(menu.error.message);
    const names = new Map(((menu.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
    const lines: StatsItemLine[] = [];
    const ids = orders.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 150) {
      const slice = ids.slice(i, i + 150);
      // is_ignored (ADR 0046) — fail-open tant que la colonne manque, comme la page Ventes.
      type Line = { raw_name: string; quantity: number | null; menu_item_id: string | null; is_ignored?: boolean };
      const withFlag = await admin.from("order_items").select("raw_name, quantity, menu_item_id, is_ignored").in("order_id", slice);
      let data = withFlag.data as Line[] | null;
      if (withFlag.error) {
        const bare = await admin.from("order_items").select("raw_name, quantity, menu_item_id").in("order_id", slice);
        if (bare.error) throw new Error(bare.error.message);
        data = bare.data as Line[] | null;
      }
      for (const it of data ?? []) {
        lines.push({
          name: (it.menu_item_id && names.get(it.menu_item_id)) || it.raw_name,
          quantity: Number(it.quantity) || 1,
          ignored: !!it.is_ignored,
        });
      }
    }
    return lines;
  });
}
