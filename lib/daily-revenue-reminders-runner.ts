import { randomUUID } from "node:crypto";
import { createAdminClient } from "./supabase";
import { listLiveRestaurants } from "./demo";
import { isMessageEnabled, isMissingJournal, recordSend } from "./message-log";
import { sendConsolePush } from "./console-push";
import { trackedUrl } from "./message-links";
import { APP_URL } from "./email-templates/kit";
import { sendCaReminderEmail } from "./email";
import { addDays } from "./daily-revenue-model";
import { isPlacesConfigured, placeOpeningPeriods } from "./audit/places";
import { hasDayWeather, snapshotDayWeather } from "./day-reasons-data";
import {
  CA_REMINDER_KEY,
  closingFromPeriods,
  planReminders,
  reminderTargetDay,
  reminderText,
  type ClosingTimes,
  type PlannedReminder,
} from "./daily-revenue-reminders";

// ADR 0087 §4 — la tâche horaire des rappels du CA du jour. Les règles sont
// pures (daily-revenue-reminders.ts) ; ici : lire, réserver, envoyer, journaliser.
//
// Éteint par défaut, allumé par établissement (`ca_du_jour` dans /platform/messages).
// Fail-closed sur le verrou : sans la table daily_revenue_reminders, RIEN ne part
// (un rappel renverrait à chaque passage) et la réponse le dit.

const HOURS_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** Après 23 h : les services du midi et du soir sont dans les 24 dernières heures de Google. */
const WEATHER_SNAPSHOT_MIN = 23 * 60;
/** Les sièges qui reçoivent le rappel : le propriétaire, le gérant et le manager — pas l'équipe en salle. */
const RECIPIENT_ROLES = ["gerant", "manager"];

export type ReminderReport = {
  restaurants: number;
  enabled: number;
  planned: number;
  sent: number;
  emails: number;
  pushes: number;
  failed: number;
  /** Photos météo du jour prises à ce passage. */
  weather: number;
  skipped: string[];
};

/** Jour et minute de Bruxelles, quelle que soit l'heure d'été. */
export function brusselsNow(now: Date): { today: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { today: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

type Restaurant = { id: string; name: string; owner_id: string | null; google_place_id: string | null; lat: number | null; lng: number | null; closing_times: ClosingTimes | null; hours_synced_at: string | null };

/** Les horaires de la fiche, relus chaque semaine. Une panne garde les anciens (ou l'heure par défaut). */
async function closingTimesFor(r: Restaurant, now: Date): Promise<ClosingTimes | null> {
  const fresh = r.hours_synced_at && now.getTime() - Date.parse(r.hours_synced_at) < HOURS_MAX_AGE_MS;
  if (fresh || !r.google_place_id || !isPlacesConfigured()) return r.closing_times;
  try {
    const closing = closingFromPeriods(await placeOpeningPeriods(r.google_place_id));
    await createAdminClient()
      .from("restaurants")
      .update({ closing_times: closing, hours_synced_at: now.toISOString() })
      .eq("id", r.id);
    return closing;
  } catch (e) {
    console.error(`[ca-rappels] horaires de ${r.id} illisibles :`, (e as Error).message);
    return r.closing_times;
  }
}

async function recipientsFor(r: Restaurant): Promise<{ userId: string; email: string | null }[]> {
  const admin = createAdminClient();
  const { data: seats } = await admin.from("restaurant_admins").select("user_id, role").eq("restaurant_id", r.id).in("role", RECIPIENT_ROLES);
  const ids = new Set<string>([...(r.owner_id ? [r.owner_id] : []), ...((seats ?? []) as { user_id: string }[]).map((s) => s.user_id)]);
  if (ids.size === 0) return [];
  const { data: profiles } = await admin.from("profiles").select("id, email").in("id", [...ids]);
  return ((profiles ?? []) as { id: string; email: string | null }[]).map((p) => ({ userId: p.id, email: p.email }));
}

/** Jours notés (montant ou fermé) et rappels déjà partis, sur les 8 derniers jours. */
async function knownState(restaurantId: string, today: string): Promise<{ covered: Set<string>; sent: Set<string> } | { lockMissing: true }> {
  const admin = createAdminClient();
  const since = addDays(today, -8);
  const [entries, sales, reminders] = await Promise.all([
    admin.from("daily_revenue_entries").select("sales_day, outcome").eq("restaurant_id", restaurantId).gte("sales_day", since),
    admin.from("restaurant_sales").select("sold_on").eq("restaurant_id", restaurantId).gte("sold_on", since),
    admin.from("daily_revenue_reminders").select("sales_day, slot").eq("restaurant_id", restaurantId).gte("sales_day", since),
  ]);
  if (reminders.error) {
    if (reminders.error.code === "42P01" || reminders.error.code === "PGRST205" || isMissingJournal(reminders.error)) return { lockMissing: true };
    throw new Error(`daily_revenue_reminders : ${reminders.error.message}`);
  }
  const covered = new Set<string>();
  for (const e of (entries.data ?? []) as { sales_day: string; outcome: string }[]) if (e.outcome !== "sans_reponse") covered.add(e.sales_day);
  for (const s of (sales.data ?? []) as { sold_on: string }[]) covered.add(String(s.sold_on).slice(0, 10));
  const sent = new Set(((reminders.data ?? []) as { sales_day: string; slot: string }[]).map((r) => `${r.sales_day}|${r.slot}`));
  return { covered, sent };
}

/** Réserve le rappel avant de l'envoyer : un second passage (ou une tâche doublée) ne le renvoie pas. */
async function claim(restaurantId: string, rem: PlannedReminder): Promise<boolean> {
  const { error } = await createAdminClient().from("daily_revenue_reminders").insert({ restaurant_id: restaurantId, sales_day: rem.day, slot: rem.slot });
  if (!error) return true;
  if (error.code !== "23505") console.error("[ca-rappels] réservation refusée :", error.message);
  return false;
}

async function send(r: Restaurant, rem: PlannedReminder, report: ReminderReport): Promise<number> {
  const recipients = await recipientsFor(r);
  const text = reminderText(rem);
  const path = `/admin/${r.id}/ca/${reminderTargetDay(rem)}`;
  let reached = 0;
  for (const to of recipients) {
    let ok = false;
    // La notification : son appui passe par /c/<envoi> et compte comme un clic.
    const pushId = randomUUID();
    const pushed = await sendConsolePush(to.userId, r.id, { title: text.title, body: text.body, url: trackedUrl(APP_URL, pushId, path) }).catch(() => "failed" as const);
    if (pushed !== "no_device") {
      await recordSend({
        id: pushId,
        restaurantId: r.id,
        audience: "restaurant",
        userId: to.userId,
        messageKey: CA_REMINDER_KEY,
        channel: "push",
        status: pushed === "sent" ? "sent" : "failed",
        error: pushed === "sent" ? null : "Push console refusé (clés VAPID, table ou appareil)",
        subject: `${rem.slot} · ${text.title}`,
      });
      if (pushed === "sent") {
        report.pushes++;
        ok = true;
      } else report.failed++;
    }
    // L'e-mail : toujours, la notification n'est qu'un raccourci.
    if (to.email) {
      const mailed = await sendCaReminderEmail(to.email, r.name, r.id, rem, to.userId).catch(() => false);
      if (mailed) {
        report.emails++;
        ok = true;
      } else report.failed++;
    }
    if (ok) reached++;
  }
  return reached;
}

export async function runCaReminders(now = new Date()): Promise<ReminderReport> {
  const report: ReminderReport = { restaurants: 0, enabled: 0, planned: 0, sent: 0, emails: 0, pushes: 0, failed: 0, weather: 0, skipped: [] };
  const { today, minutes } = brusselsNow(now);
  const admin = createAdminClient();
  const restaurants = await listLiveRestaurants<Restaurant>(admin, "id, name, owner_id, google_place_id, lat, lng, closing_times, hours_synced_at").catch(async () =>
    // Sans la migration 20261024-1800 (closing_times absente) : sans horaires, l'heure par défaut.
    (await listLiveRestaurants<Omit<Restaurant, "closing_times" | "hours_synced_at">>(admin, "id, name, owner_id, google_place_id, lat, lng")).map((r) => ({
      ...r,
      closing_times: null,
      hours_synced_at: new Date(now).toISOString(),
    }))
  );
  report.restaurants = restaurants.length;

  for (const r of restaurants) {
    // ADR 0087 §3 — la météo du jour, photographiée le soir même (Google n'en
    // garde que 24 h) pour expliquer un CA inhabituel saisi plus tard. Pour tous
    // les établissements en ligne, rappels allumés ou non : une lecture par jour.
    if (minutes >= WEATHER_SNAPSHOT_MIN && !(await hasDayWeather(r.id, today).catch(() => true))) {
      const kept = await snapshotDayWeather(r, today).catch(() => null);
      if (kept) report.weather++;
    }
    if (!(await isMessageEnabled(CA_REMINDER_KEY, r.id))) continue;
    report.enabled++;
    const state = await knownState(r.id, today);
    if ("lockMissing" in state) {
      report.skipped.push(`${r.id} : table daily_revenue_reminders absente (migration 20261024-1800), rien envoyé`);
      continue;
    }
    const closing = await closingTimesFor(r, now);
    const planned = planReminders({ today, nowMinutes: minutes, closing, covered: state.covered, sent: state.sent });
    report.planned += planned.length;
    for (const rem of planned) {
      if (!(await claim(r.id, rem))) continue;
      const reached = await send(r, rem, report);
      await admin.from("daily_revenue_reminders").update({ recipients: reached }).eq("restaurant_id", r.id).eq("sales_day", rem.day).eq("slot", rem.slot);
      if (reached > 0) report.sent++;
      else report.skipped.push(`${r.id} ${rem.day} ${rem.slot} : personne n'a pu être prévenu`);
    }
  }
  return report;
}
