import { createAdminClient } from "@/lib/supabase";
import { loadProgress } from "@/lib/partner-progress-server";
import { isIncomplete, type EstablishmentProgress } from "@/lib/partner-progress";
import { sendOnboardingReminderEmail } from "@/lib/email";
import { brusselsHour, decideOnboardingReminder, type OnboardingDecision } from "@/lib/onboarding-reminder-rules";

// Relance d'inscription restaurateur — lecture, décision (règles pures),
// envoi. SERVEUR UNIQUEMENT. Les comptes démo ne sont jamais lus. Le compteur
// des relances est le journal des envois (message_sends : clé
// onboarding_reminder, user_id = propriétaire, step 1 ou 2) : illisible, on
// n'envoie rien.

export type OnboardingRunResult = {
  ok: boolean;
  brusselsHour: number;
  owners: number;
  sent: { ownerId: string; step: 1 | 2; restaurants: string[]; ok: boolean }[];
  /** Deux relances sans effet depuis 48 h : à reprendre par l'équipe (Field management). */
  escalate: { ownerId: string; email: string | null; restaurants: string[] }[];
  waiting: Record<string, number>;
  skipped: { noOwner: number; noEmail: number };
};

export async function runOnboardingReminders(now = new Date()): Promise<OnboardingRunResult> {
  const admin = createAdminClient();
  const hour = brusselsHour(now);
  const result: OnboardingRunResult = { ok: true, brusselsHour: hour, owners: 0, sent: [], escalate: [], waiting: {}, skipped: { noOwner: 0, noEmail: 0 } };

  const { data: pendingRaw, error } = await admin
    .from("restaurants")
    .select("id, owner_id, created_at")
    .eq("status", "pending")
    .eq("is_demo", false);
  if (error) return { ...result, ok: false };
  const pending = (pendingRaw ?? []) as { id: string; owner_id: string | null; created_at: string }[];
  if (pending.length === 0) return result;

  const progress = new Map((await loadProgress(pending.map((r) => r.id))).map((p) => [p.id, p]));
  const byOwner = new Map<string, { establishments: EstablishmentProgress[]; oldest: Date }>();
  for (const r of pending) {
    const p = progress.get(r.id);
    if (!p || !isIncomplete(p)) continue;
    if (!r.owner_id) {
      result.skipped.noOwner++;
      continue;
    }
    const created = new Date(r.created_at);
    const entry = byOwner.get(r.owner_id) ?? { establishments: [], oldest: created };
    entry.establishments.push(p);
    if (created < entry.oldest) entry.oldest = created;
    byOwner.set(r.owner_id, entry);
  }
  const ownerIds = Array.from(byOwner.keys());
  result.owners = ownerIds.length;
  if (ownerIds.length === 0) return result;

  const [{ data: profiles }, journal] = await Promise.all([
    admin.from("profiles").select("id, email").in("id", ownerIds),
    admin
      .from("message_sends")
      .select("user_id, created_at")
      .eq("message_key", "onboarding_reminder")
      .eq("status", "sent")
      .in("user_id", ownerIds)
      .order("created_at", { ascending: true }),
  ]);
  const emails = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  const sentAt = new Map<string, Date[]>();
  for (const row of (journal.data ?? []) as { user_id: string; created_at: string }[]) {
    const list = sentAt.get(row.user_id) ?? [];
    list.push(new Date(row.created_at));
    sentAt.set(row.user_id, list);
  }

  for (const [ownerId, entry] of byOwner) {
    const decision: OnboardingDecision = decideOnboardingReminder(
      { oldestIncompleteCreatedAt: entry.oldest, sentAt: sentAt.get(ownerId) ?? [], journalAvailable: !journal.error },
      now,
      hour,
    );
    const restaurants = entry.establishments.map((e) => e.id);
    if (decision.action === "escalate") {
      result.escalate.push({ ownerId, email: emails.get(ownerId) ?? null, restaurants });
      continue;
    }
    if (decision.action !== "send") {
      const k = decision.action === "wait" ? `wait_${decision.reason}` : decision.action;
      result.waiting[k] = (result.waiting[k] ?? 0) + 1;
      continue;
    }
    const email = emails.get(ownerId);
    if (!email) {
      result.skipped.noEmail++;
      continue;
    }
    const ok = await sendOnboardingReminderEmail(email, { ownerId, establishments: entry.establishments, step: decision.step });
    result.sent.push({ ownerId, step: decision.step, restaurants, ok });
  }
  return result;
}
