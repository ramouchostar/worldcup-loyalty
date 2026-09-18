// ============================================================
// Limites d'envoi de tickets (décision du porteur, 2026-09-18) — pur, testé.
//
// 1. Deux tickets par client et par jour (heure de Bruxelles), au plus : le
//    troisième est refusé AVANT la lecture (pas d'appel Vision payé). Rien
//    n'est perdu : un ticket reste valable des semaines (MAX_TICKET_AGE_DAYS),
//    le client l'envoie le lendemain.
// 2. Envois très fréquents : à partir de 6 tickets sur 7 jours glissants, le
//    ticket part en vérification chez le restaurateur (motif
//    `frequent_submitter`) au lieu d'être validé tout seul. Signal typique
//    d'un employé qui ramasse les tickets oubliés par les clients et les
//    enregistre à son nom.
// Seules les commandes créées comptent (en attente ou validées) : une photo
// refusée à la lecture n'a rien coûté au programme.
// ============================================================

export const TICKETS_PER_DAY_MAX = 2;
export const FREQUENT_WINDOW_DAYS = 7;
export const FREQUENT_TICKETS_THRESHOLD = 6;

export const DAILY_LIMIT_MESSAGE =
  "Tu as déjà envoyé 2 tickets aujourd'hui. Garde celui-ci : tu pourras l'envoyer demain.";

/** Le client a-t-il déjà atteint sa limite du jour ? (`sentToday` = commandes créées aujourd'hui) */
export function isDailyLimitReached(sentToday: number): boolean {
  return sentToday >= TICKETS_PER_DAY_MAX;
}

/** Ce ticket (compté) porte-t-il le client à 6 tickets ou plus sur 7 jours ? */
export function isFrequentSubmitter(sentLast7DaysBeforeThis: number): boolean {
  return sentLast7DaysBeforeThis + 1 >= FREQUENT_TICKETS_THRESHOLD;
}

// Décalage de Bruxelles (en minutes) à l'instant donné : +60 l'hiver, +120 l'été.
function brusselsOffsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/** Minuit du jour en cours à Bruxelles, en ISO UTC — début du compteur « aujourd'hui ». */
export function brusselsDayStartIso(now: Date = new Date()): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const midnightAsUtc = Date.parse(`${day}T00:00:00Z`);
  return new Date(midnightAsUtc - brusselsOffsetMinutes(now) * 60_000).toISOString();
}
