import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { autoValidation } from "./mission-states";
import { logEvent, restaurantMissionUrl } from "./missions";
import { providerMissionUrl } from "./providers";
import { getRestaurantContactEmail } from "./missions-contact";
import { sendMissionUpdateEmail } from "./email";
import type { MissionUpdateInput } from "./email-templates/mission-update";

// ============================================================
// Réserver un prestataire (ADR 0084 §3, §6) — la validation automatique d'une livraison restée sans réponse.
//
// La règle est pure (`autoValidation`, lib/mission-states.ts) : rappel à J+3 et J+5, validation à J+7, et
// JAMAIS de validation sans que les deux rappels soient partis. Ce fichier l'applique. Deux garanties :
//  - chaque étape est un compare-and-swap (le rappel n° 2 ne s'écrit que si le n° 1 l'est ; la validation ne
//    s'écrit que sur une mission encore « livré » avec ses deux rappels) : deux passages du cron qui se
//    chevauchent ne font rien en double ;
//  - un compte-rendu de tournage CONTESTÉ bloque tout : la plateforme arbitre, rien n'est automatique.
// Chaque rappel, chaque validation, chaque échec laisse sa ligne dans `mission_events` (ADR 0065).
// ============================================================

type DbError = { code?: string; message?: string } | null;

type Row = {
  id: string;
  restaurant_id: string;
  requested_by: string | null;
  provider_id: string | null;
  delivered_at: string;
  reminders_sent: number;
  report_contested_at: string | null;
  report_confirmed_at: string | null;
  restaurants: { name: string } | null;
  providers: { email: string; display_name: string } | null;
};

export type ValidationRun = { ok: false; reason: "unavailable" } | { ok: true; checked: number; reminded: number; validated: number; blocked: number; failed: number };

export async function runAutoValidation(now: Date = new Date()): Promise<ValidationRun> {
  const admin = createAdminClient();
  let rows: Row[] = [];
  try {
    const { data, error } = await admin
      .from("missions")
      .select("id, restaurant_id, requested_by, provider_id, delivered_at, reminders_sent, report_contested_at, report_confirmed_at, restaurants(name), providers(email, display_name)")
      .eq("status", "livre")
      .not("delivered_at", "is", null);
    if (error) throw error;
    rows = (data ?? []) as unknown as Row[];
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[mission-validation] lecture impossible:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }

  let reminded = 0;
  let validated = 0;
  let blocked = 0;
  let failed = 0;

  for (const row of rows) {
    // Un compte-rendu contesté : la plateforme arbitre, rien n'est automatique.
    if (row.report_contested_at && !row.report_confirmed_at) {
      blocked++;
      continue;
    }
    const decision = autoValidation(new Date(row.delivered_at), now, row.reminders_sent);
    if (decision.action === "wait") continue;
    const outcome = decision.action === "remind" ? await remind(row, decision.reminder) : await validate(row);
    if (outcome === "done") decision.action === "remind" ? reminded++ : validated++;
    else if (outcome === "failed") failed++;
  }
  return { ok: true, checked: rows.length, reminded, validated, blocked, failed };
}

const restaurantName = (r: Row) => r.restaurants?.name ?? "Un restaurateur";
const providerName = (r: Row) => r.providers?.display_name ?? "Le prestataire";

async function remind(row: Row, reminder: 1 | 2): Promise<"done" | "skipped" | "failed"> {
  const admin = createAdminClient();
  // RÉSERVER : le rappel n'est compté que si personne ne l'a déjà compté.
  const { data, error } = await admin
    .from("missions")
    .update({ reminders_sent: reminder })
    .eq("id", row.id)
    .eq("status", "livre")
    .eq("reminders_sent", reminder - 1)
    .select("id");
  if (error) {
    console.error("[mission-validation] réservation impossible:", error.message);
    return "failed";
  }
  if (!data || data.length === 0) return "skipped";

  try {
    const to = await getRestaurantContactEmail(row.restaurant_id, row.requested_by);
    if (!to) throw new Error("aucune adresse de restaurateur");
    const sent = await sendMissionUpdateEmail(to, { kind: "validation_reminder", audience: "restaurant", round: reminder, restaurantName: restaurantName(row), providerName: providerName(row), url: restaurantMissionUrl(row.restaurant_id, row.id) }, row.restaurant_id);
    if (!sent) throw new Error("envoi refusé par le fournisseur d'e-mails");
    await logEvent(row.id, { kind: "validation_reminder_sent", actorKind: "system", meta: { reminder } });
    return "done";
  } catch (e) {
    // LIBÉRER : le prochain passage réessaie.
    await admin.from("missions").update({ reminders_sent: reminder - 1 }).eq("id", row.id).eq("status", "livre").eq("reminders_sent", reminder);
    console.error("[mission-validation] rappel échoué:", row.id, (e as Error).message);
    await logEvent(row.id, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { about: "validation_reminder", reminder } });
    return "failed";
  }
}

async function validate(row: Row): Promise<"done" | "skipped" | "failed"> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("missions")
    .update({ status: "valide", validated_at: now, updated_at: now })
    .eq("id", row.id)
    .eq("status", "livre")
    .gte("reminders_sent", 2) // jamais de validation silencieuse : les deux rappels sont partis
    .select("id");
  if (error) {
    console.error("[mission-validation] validation impossible:", error.message);
    return "failed";
  }
  if (!data || data.length === 0) return "skipped";
  await logEvent(row.id, { kind: "status", from: "livre", to: "valide", actorKind: "system", reason: "auto_validated", meta: { days: 7 } });
  await notifyBoth(row);
  return "done";
}

/** Chacun apprend que la livraison est validée ; l'issue de chaque e-mail est une ligne de la trace. */
async function notifyBoth(row: Row): Promise<void> {
  const base: Omit<MissionUpdateInput, "audience" | "url"> = { kind: "auto_validated", restaurantName: restaurantName(row), providerName: providerName(row) };
  const jobs: { who: "restaurant" | "provider"; to: () => Promise<string | null>; url: string }[] = [
    { who: "restaurant", to: () => getRestaurantContactEmail(row.restaurant_id, row.requested_by), url: restaurantMissionUrl(row.restaurant_id, row.id) },
    { who: "provider", to: async () => row.providers?.email ?? null, url: providerMissionUrl(row.id) },
  ];
  for (const j of jobs) {
    try {
      const to = await j.to();
      if (!to) throw new Error(`aucune adresse pour ${j.who}`);
      const sent = await sendMissionUpdateEmail(to, { ...base, audience: j.who, url: j.url }, row.restaurant_id);
      await logEvent(row.id, { kind: sent ? "notified" : "notify_failed", actorKind: "system", meta: { channel: "email", about: "auto_validated", who: j.who } });
    } catch (e) {
      console.error("[mission-validation] notification échouée:", j.who, (e as Error).message);
      await logEvent(row.id, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { about: "auto_validated", who: j.who } });
    }
  }
}
