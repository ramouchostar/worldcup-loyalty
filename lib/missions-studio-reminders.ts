import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { logEvent } from "./missions";
import { mailMission } from "./missions-notify";
import { dateLabelFr } from "./mission-team-message";
import { STUDIO_KEYS, dueStudioReminders, reminderLabel, type DueStudioReminder, type StudioMission, type StudioProofLite } from "./mission-studio-reminders";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 bis et ter, PR R) — le passage quotidien des rappels d'atelier : ce qui dort se réveille.
//
// Les règles sont pures (lib/mission-studio-reminders.ts) ; ce fichier les applique. Un rappel ne part JAMAIS deux fois : la
// ligne `mission_reminders` est RÉSERVÉE (clé primaire) avant l'envoi et libérée si l'envoi échoue — le passage suivant
// réessaie tant que la fenêtre est ouverte. Chaque envoi laisse sa ligne dans `mission_events`. Migration absente : le passage
// répond « unavailable » et n'envoie RIEN. Un rappel n'a aucun effet : il ne signe, n'annule ni ne valide rien.
// ============================================================

type DbError = { code?: string; message?: string } | null;

export type StudioRun = { ok: false; reason: "unavailable" } | { ok: true; today: string; missions: number; due: number; sent: number; failed: number; skipped: number };

type Row = { id: string; metier: "design" | "impression"; status: string; brief: Record<string, unknown> | null };

export async function runStudioReminders(now: Date = new Date()): Promise<StudioRun> {
  const today = todayInBrussels(now);
  const admin = createAdminClient();
  let rows: Row[] = [];
  const proofs = new Map<string, StudioProofLite[]>();
  let sentSet = new Set<string>();
  try {
    const { data, error } = await admin.from("missions").select("id, metier, status, brief").in("metier", ["design", "impression"]).in("status", ["accepte", "production"]).limit(500);
    if (error) throw error;
    rows = (data ?? []) as Row[];
    const ids = rows.map((r) => r.id).concat("00000000-0000-0000-0000-000000000000");

    const { data: sent, error: e2 } = await admin.from("mission_reminders").select("mission_id, key, audience").in("key", [...STUDIO_KEYS]).in("mission_id", ids);
    if (e2) throw e2;
    sentSet = new Set(((sent ?? []) as { mission_id: string; key: string; audience: string }[]).map((s) => `${s.mission_id}:${s.key}:${s.audience}`));

    // Les épreuves (impression). Table absente : pas d'épreuve connue, donc aucun rappel de bon à tirer — jamais une erreur.
    const printIds = rows.filter((r) => r.metier === "impression").map((r) => r.id);
    if (printIds.length > 0) {
      const { data: pr, error: e3 } = await admin.from("mission_proofs").select("mission_id, round, status, created_at, decided_at").in("mission_id", printIds);
      if (e3 && !isMissingTable(e3 as DbError)) throw e3;
      for (const p of (pr ?? []) as { mission_id: string; round: number; status: StudioProofLite["status"]; created_at: string; decided_at: string | null }[]) {
        const list = proofs.get(p.mission_id) ?? [];
        list.push({ round: p.round, status: p.status, createdAt: p.created_at, decidedAt: p.decided_at });
        proofs.set(p.mission_id, list);
      }
    }
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-studio-reminders] lecture impossible:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }

  const missions: StudioMission[] = rows.map((r) => ({
    id: r.id,
    metier: r.metier,
    status: r.status,
    deadline: typeof r.brief?.deadline === "string" ? r.brief.deadline : null,
    proofs: proofs.get(r.id) ?? [],
  }));
  const due = dueStudioReminders(missions, today, now, sentSet);
  const byId = new Map(missions.map((m) => [m.id, m]));
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const d of due) {
    const outcome = await sendOne(d, byId.get(d.missionId)?.deadline ?? null);
    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
    else skipped++;
  }
  return { ok: true, today, missions: rows.length, due: due.length, sent, failed, skipped };
}

async function sendOne(d: DueStudioReminder, deadline: string | null): Promise<"sent" | "failed" | "skipped"> {
  const admin = createAdminClient();
  // 1. RÉSERVER : si la ligne existe déjà (un autre passage, ou un rappel déjà parti), on ne fait rien.
  const { error: claim } = await admin.from("mission_reminders").insert({ mission_id: d.missionId, key: d.key, audience: d.audience });
  if (claim) {
    if (claim.code === "23505") return "skipped";
    console.error("[missions-studio-reminders] réservation impossible:", claim.message);
    return "failed";
  }
  // 2. ENVOYER, sinon LIBÉRER : le passage suivant réessaie tant que la fenêtre du rappel est ouverte.
  const sent = await mailMission(d.missionId, d.audience, d.key, deadline ? { deadlineLabel: dateLabelFr(deadline), deadlineDay: deadline } : {});
  if (sent) {
    await logEvent(d.missionId, { kind: "reminder_sent", actorKind: "system", reason: reminderLabel[d.key], meta: { key: d.key, audience: d.audience } });
    return "sent";
  }
  await admin.from("mission_reminders").delete().eq("mission_id", d.missionId).eq("key", d.key).eq("audience", d.audience);
  return "failed";
}
