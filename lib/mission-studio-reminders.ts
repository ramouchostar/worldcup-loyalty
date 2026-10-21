// ============================================================
// Réserver un prestataire (ADR 0084 §5 bis et ter) — les rappels des métiers d'atelier (graphiste, imprimeur).
//
// Un métier d'atelier n'a pas de date de tournage, donc pas de J-7 ni de J-2 : mais il a un JOUR SOUHAITÉ (le brief) et, pour
// l'impression, un bon à tirer qui attend une réponse. Ce qui dort doit réveiller quelqu'un, sans jamais décider à sa place :
//
//   devis accepté, rien commencé    le prestataire de J-6 à J-3 ; la PLATEFORME dès J-2
//   en cours, rien livré            le prestataire à J-2 ; en retard (J+1) : lui ET la plateforme
//   épreuve sans réponse (2 jours)  le restaurateur ; encore (5 jours) : une seconde fois
//   corrections sans épreuve (2 j)  le prestataire
//
// Chaque rappel part UNE fois (clé primaire en base). Un rappel n'a jamais d'effet : il ne signe, n'annule ni ne valide rien.
// Fonctions PURES : le jour belge et l'instant sont injectés ; l'unicité en base est la ceinture, ceci les bretelles.
// ============================================================

import { addDays } from "./console-journey";

export type StudioReminderKey = "studio_start" | "studio_start_late" | "studio_deliver" | "studio_overdue" | "bat_review" | "bat_review_again" | "bat_corrections_due";
export type StudioAudience = "restaurant" | "provider" | "platform";
export type DueStudioReminder = { missionId: string; key: StudioReminderKey; audience: StudioAudience };

export const STUDIO_KEYS: readonly StudioReminderKey[] = ["studio_start", "studio_start_late", "studio_deliver", "studio_overdue", "bat_review", "bat_review_again", "bat_corrections_due"];

export const REVIEW_AFTER_DAYS = 2;
export const REVIEW_AGAIN_AFTER_DAYS = 5;
export const CORRECTIONS_AFTER_DAYS = 2;

export type StudioProofLite = { round: number; status: "proposed" | "corrections" | "signed"; createdAt: string; decidedAt: string | null };

export type StudioMission = {
  id: string;
  metier: "design" | "impression";
  status: string;
  /** Le jour souhaité (YYYY-MM-DD), tel qu'écrit dans le brief. */
  deadline: string | null;
  proofs: readonly StudioProofLite[];
};

const DAY_MS = 24 * 3_600_000;
const daysSince = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / DAY_MS;

/** Les rappels à envoyer aujourd'hui. `alreadySent` : les clés `missionId:key:audience` déjà réservées. */
export function dueStudioReminders(missions: readonly StudioMission[], today: string, now: Date, alreadySent: ReadonlySet<string>): DueStudioReminder[] {
  const out: DueStudioReminder[] = [];
  for (const m of missions) {
    const push = (key: StudioReminderKey, audience: StudioAudience) => {
      if (!alreadySent.has(`${m.id}:${key}:${audience}`)) out.push({ missionId: m.id, key, audience });
    };
    const d = m.deadline && /^\d{4}-\d{2}-\d{2}$/.test(m.deadline) ? m.deadline : null;

    if (m.status === "accepte" && d) {
      if (today >= addDays(d, -6) && today <= addDays(d, -3)) push("studio_start", "provider");
      if (today >= addDays(d, -2)) push("studio_start_late", "platform");
    }

    if (m.status === "production") {
      if (d) {
        if (today >= addDays(d, -2) && today <= d) push("studio_deliver", "provider");
        if (today > d) {
          push("studio_overdue", "provider");
          push("studio_overdue", "platform");
        }
      }
      // Le bon à tirer : l'épreuve qui attend, les corrections qui attendent. Jamais après la signature.
      if (m.metier === "impression" && !m.proofs.some((p) => p.status === "signed")) {
        const last = [...m.proofs].sort((a, b) => a.round - b.round).at(-1);
        if (last?.status === "proposed") {
          const age = daysSince(last.createdAt, now);
          if (age >= REVIEW_AFTER_DAYS) push("bat_review", "restaurant");
          if (age >= REVIEW_AGAIN_AFTER_DAYS) push("bat_review_again", "restaurant");
        }
        if (last?.status === "corrections" && last.decidedAt && daysSince(last.decidedAt, now) >= CORRECTIONS_AFTER_DAYS) push("bat_corrections_due", "provider");
      }
    }
  }
  return out;
}

/** La clé qui dit ce qu'on a envoyé (la trace). */
export const reminderLabel: Record<StudioReminderKey, string> = {
  studio_start: "le prestataire n'a pas encore commencé",
  studio_start_late: "toujours pas commencé, le jour souhaité approche",
  studio_deliver: "la livraison souhaitée approche",
  studio_overdue: "le jour souhaité est passé sans livraison",
  bat_review: "une épreuve attend la réponse du restaurateur",
  bat_review_again: "l'épreuve attend toujours la réponse du restaurateur",
  bat_corrections_due: "des corrections attendent une nouvelle épreuve",
};
