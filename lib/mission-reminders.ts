// ============================================================
// Réserver un prestataire (ADR 0084 §5) — quand rappeler, à qui, et comment confirmer.
//
//   J-7     restaurateur : « prévenez votre équipe » (seulement s'il ne l'a pas fait)
//   J-2     restaurateur ET prestataire : « confirme ta présence »
//   veille  les deux : récap (qui n'a pas confirmé le sait) ; sans confirmation → alerte plateforme
//
// Chaque rappel a une FENÊTRE (jours où il peut encore partir) : un cron raté un jour n'efface pas le
// rappel, mais un rappel de J-7 n'arrive jamais à J-1. Fonctions PURES : le jour belge est injecté,
// la liste des rappels déjà envoyés aussi (l'unicité en base est la ceinture, ceci est les bretelles).
// ============================================================

import { addDays } from "./console-journey";

export type ReminderKey = "j7" | "j2" | "veille" | "alerte";
export type ReminderAudience = "restaurant" | "provider" | "platform";

export type ReminderMission = {
  id: string;
  status: string;
  shoot_date: string | null;
  team_notified_at: string | null;
  j2_confirmed_provider_at: string | null;
  j2_confirmed_restaurant_at: string | null;
};

export type DueReminder = { missionId: string; key: ReminderKey; audience: ReminderAudience };

const sentKey = (missionId: string, key: ReminderKey, audience: ReminderAudience) => `${missionId}:${key}:${audience}`;
export const reminderId = sentKey;

/**
 * Les rappels à envoyer aujourd'hui. `alreadySent` : les clés `missionId:key:audience` déjà réservées.
 *
 * - **j7** (restaurateur) : du J-7 jusqu'à J-3, tant que l'équipe n'est pas prévenue.
 * - **j2** (les deux) : de J-2 à J-1.
 * - **veille** (les deux) : à J-1, SEULEMENT si le j2 est parti avant — sinon c'est le j2 qui part (un seul e-mail par jour et par personne).
 * - **alerte** (plateforme) : à J-1, si l'un des deux n'a toujours pas confirmé sa présence.
 */
export function dueReminders(missions: readonly ReminderMission[], today: string, alreadySent: ReadonlySet<string>): DueReminder[] {
  const out: DueReminder[] = [];
  for (const m of missions) {
    if (m.status !== "date_bloquee" || !m.shoot_date) continue;
    const d = m.shoot_date;
    if (d < today) continue; // jour passé : plus rien à rappeler
    const has = (k: ReminderKey, a: ReminderAudience) => alreadySent.has(sentKey(m.id, k, a));
    const push = (key: ReminderKey, audience: ReminderAudience) => {
      if (!has(key, audience)) out.push({ missionId: m.id, key, audience });
    };

    if (today >= addDays(d, -7) && today <= addDays(d, -3) && !m.team_notified_at) push("j7", "restaurant");

    const veilleDay = today === addDays(d, -1);
    const inJ2Window = today >= addDays(d, -2) && today <= addDays(d, -1);
    for (const audience of ["restaurant", "provider"] as const) {
      const confirmed = audience === "restaurant" ? m.j2_confirmed_restaurant_at : m.j2_confirmed_provider_at;
      if (veilleDay && has("j2", audience)) {
        push("veille", audience);
      } else if (inJ2Window && !confirmed) {
        // Déjà confirmé : le j2 n'a plus d'objet ; le récap de la veille partira quand même (sans la demande).
        push("j2", audience);
      } else if (veilleDay && confirmed) {
        push("veille", audience);
      }
    }

    if (veilleDay && (!m.j2_confirmed_provider_at || !m.j2_confirmed_restaurant_at)) push("alerte", "platform");
  }
  return out;
}

// ── Confirmer sa présence ────────────────────────────────────

export type ConfirmVerdict = "ok" | "too_early" | "too_late" | "no_date";

/** On confirme à partir de J-2 et jusqu'au jour J compris ; avant, la demande n'est pas encore partie. */
export function judgeConfirm(shootDate: string | null, today: string): ConfirmVerdict {
  if (!shootDate) return "no_date";
  if (today < addDays(shootDate, -2)) return "too_early";
  if (today > shootDate) return "too_late";
  return "ok";
}

/** Où en est la présence : ce que lit chaque partie (et la plateforme). */
export function presenceState(m: Pick<ReminderMission, "j2_confirmed_provider_at" | "j2_confirmed_restaurant_at">): "both" | "restaurant_only" | "provider_only" | "none" {
  const r = !!m.j2_confirmed_restaurant_at;
  const p = !!m.j2_confirmed_provider_at;
  return r && p ? "both" : r ? "restaurant_only" : p ? "provider_only" : "none";
}

// ── Fichier calendrier (.ics) ────────────────────────────────

export type IcsInput = {
  uid: string;
  summary: string;
  /** Instants réels (UTC) de début et de fin : voir brusselsInstant (lib/mission-cancellation.ts). */
  start: Date;
  end: Date;
  description?: string;
  /** Rappel à J-2 dans le calendrier de la personne. */
  alarmDaysBefore?: number;
  now?: Date;
};

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Une ligne iCalendar ne dépasse pas 75 octets : on la replie (RFC 5545 §3.1), CRLF + espace. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(i: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Boosteats//Prestataires//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${i.uid}@boosteats.be`,
    `DTSTAMP:${icsDate(i.now ?? new Date())}`,
    `DTSTART:${icsDate(i.start)}`,
    `DTEND:${icsDate(i.end)}`,
    `SUMMARY:${icsEscape(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${icsEscape(i.description)}`] : []),
    ...(i.alarmDaysBefore
      ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(i.summary)}`, `TRIGGER:-P${i.alarmDaysBefore}D`, "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
