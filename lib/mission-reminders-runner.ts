import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { addDays } from "./console-journey";
import { dueReminders, reminderId, type DueReminder, type ReminderMission } from "./mission-reminders";
import { dateLabelFr } from "./mission-team-message";
import { logEvent, restaurantMissionUrl } from "./missions";
import { providerMissionUrl } from "./providers";
import { getRestaurantContactEmail } from "./missions-contact";
import { sendMissionReminderEmail } from "./email";
import { DEFAULT_RESTAURANT_COPY_TO } from "./email-sender";

// ============================================================
// Réserver un prestataire (ADR 0084 §5) — le passage quotidien des rappels.
//
// Les règles sont pures (lib/mission-reminders.ts) ; ce fichier les applique. Un rappel ne part
// JAMAIS deux fois : la ligne `mission_reminders` est RÉSERVÉE (clé primaire) avant l'envoi, et
// libérée si l'envoi échoue — le passage suivant réessaie tant que la fenêtre du rappel est ouverte.
// Chaque envoi, refus et échec laisse sa ligne dans `mission_events` (ADR 0065) ; migration absente :
// le passage répond « unavailable » et n'envoie RIEN (jamais un rappel sans garde-fou de doublon).
// ============================================================

type DbError = { code?: string; message?: string } | null;

type Row = ReminderMission & {
  restaurant_id: string;
  requested_by: string | null;
  shoot_start: string | null;
  brief: Record<string, unknown> | null;
  restaurants: { name: string } | null;
  providers: { email: string; display_name: string } | null;
};

export type ReminderRun =
  | { ok: false; reason: "unavailable" }
  | { ok: true; today: string; missions: number; due: number; sent: number; failed: number; skipped: number };

/** L'adresse qui reçoit les alertes plateforme : la boîte réelle de l'équipe, sinon la copie plateforme. */
function platformAddress(): string {
  return (process.env.EMAIL_REPLY_TO || process.env.RESTAURANT_EMAIL_COPY_TO || DEFAULT_RESTAURANT_COPY_TO).trim();
}

export async function runMissionReminders(now: Date = new Date()): Promise<ReminderRun> {
  const today = todayInBrussels(now);
  const admin = createAdminClient();

  let rows: Row[] = [];
  let sentSet = new Set<string>();
  try {
    // Les tournages des 8 prochains jours : au-delà, rien n'est encore dû ; passés, plus rien ne l'est.
    const { data, error } = await admin
      .from("missions")
      .select("id, status, shoot_date, shoot_start, restaurant_id, requested_by, team_notified_at, j2_confirmed_provider_at, j2_confirmed_restaurant_at, brief, restaurants(name), providers(email, display_name)")
      .eq("status", "date_bloquee")
      .gte("shoot_date", today)
      .lte("shoot_date", addDays(today, 8));
    if (error) throw error;
    rows = (data ?? []) as unknown as Row[];

    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const { data: sent, error: e2 } = await admin.from("mission_reminders").select("mission_id, key, audience").in("mission_id", ids);
      if (e2) throw e2;
      sentSet = new Set(((sent ?? []) as { mission_id: string; key: string; audience: string }[]).map((s) => `${s.mission_id}:${s.key}:${s.audience}`));
    } else {
      // Aucune mission : on vérifie quand même que la table existe, sinon on le DIT.
      const { error: e3 } = await admin.from("mission_reminders").select("mission_id").limit(1);
      if (e3) throw e3;
    }
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[mission-reminders] lecture impossible:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }

  const due = dueReminders(rows, today, sentSet);
  const byId = new Map(rows.map((r) => [r.id, r]));
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const d of due) {
    const row = byId.get(d.missionId);
    if (!row) continue;
    const outcome = await sendOne(d, row);
    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
    else skipped++;
  }
  return { ok: true, today, missions: rows.length, due: due.length, sent, failed, skipped };
}

async function sendOne(d: DueReminder, row: Row): Promise<"sent" | "failed" | "skipped"> {
  const admin = createAdminClient();

  // 1. RÉSERVER : si la ligne existe déjà (un autre passage, ou un rappel déjà parti), on ne fait rien.
  const { error: claimError } = await admin.from("mission_reminders").insert({ mission_id: d.missionId, key: d.key, audience: d.audience });
  if (claimError) {
    if (claimError.code === "23505") return "skipped";
    console.error("[mission-reminders] réservation impossible:", claimError.message);
    return "failed";
  }

  // 2. ENVOYER. Toute exception est un échec tracé, jamais un rappel perdu en silence.
  try {
    const restaurantName = row.restaurants?.name ?? "Un restaurateur";
    const providerName = row.providers?.display_name ?? "Le prestataire";
    const contactAnswer = (row.brief?.contact as { name?: string; phone?: string } | undefined) ?? {};
    const contact = [contactAnswer.name, contactAnswer.phone].filter(Boolean).join(" · ") || "à confirmer";
    const base = {
      key: d.key,
      audience: d.audience,
      restaurantName,
      dateLabel: dateLabelFr(row.shoot_date!),
      startTime: row.shoot_start ?? "",
      contact,
    } as const;

    let to: string | null = null;
    let input: Parameters<typeof sendMissionReminderEmail>[1];
    if (d.audience === "provider") {
      to = row.providers?.email ?? null;
      input = { ...base, recipientName: providerName, otherName: restaurantName, url: providerMissionUrl(row.id), selfConfirmed: !!row.j2_confirmed_provider_at, otherConfirmed: !!row.j2_confirmed_restaurant_at };
    } else if (d.audience === "restaurant") {
      to = await getRestaurantContactEmail(row.restaurant_id, row.requested_by);
      input = { ...base, recipientName: restaurantName, otherName: providerName, url: restaurantMissionUrl(row.restaurant_id, row.id), selfConfirmed: !!row.j2_confirmed_restaurant_at, otherConfirmed: !!row.j2_confirmed_provider_at };
    } else {
      to = platformAddress();
      const missing = [!row.j2_confirmed_restaurant_at && restaurantName, !row.j2_confirmed_provider_at && providerName].filter(Boolean) as string[];
      input = { ...base, recipientName: "Boosteats", otherName: providerName, url: `${restaurantMissionUrl(row.restaurant_id, row.id)}`, missing };
    }
    if (!to) throw new Error(`aucune adresse pour ${d.audience}`);

    const ok = await sendMissionReminderEmail(to, input, row.restaurant_id);
    if (!ok) throw new Error("envoi refusé par le fournisseur d'e-mails");
    await logEvent(row.id, { kind: d.key === "alerte" ? "j2_unconfirmed" : "reminder_sent", actorKind: "system", meta: { key: d.key, audience: d.audience } });
    return "sent";
  } catch (e) {
    // 3. LIBÉRER : le passage suivant réessaiera, tant que la fenêtre du rappel est ouverte.
    await admin.from("mission_reminders").delete().eq("mission_id", d.missionId).eq("key", d.key).eq("audience", d.audience);
    console.error("[mission-reminders] envoi échoué:", reminderId(d.missionId, d.key, d.audience), (e as Error).message);
    await logEvent(row.id, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { key: d.key, audience: d.audience } });
    return "failed";
  }
}
