// Assainissement de la DATE contenue dans la clé de commande lue par l'OCR.
//
// Incident Kasia (kraainem, 22/08/2026) : même ticket scanné 6 fois, l'OCR
// lisait « 2025-08-22/223/08228 » (année du prior du modèle) → numéro affiché
// en lecture seule → à la soumission, la date 2025 est antérieure au programme
// → 400 incompréhensible → nouveau scan → même erreur. Ici on répare ce qui
// est réparable SANS deviner : une année manifestement fausse (passée) dont la
// date, une fois l'année remplacée par l'année courante, tombe dans la fenêtre
// récente plausible d'un ticket (≤ aujourd'hui, ≥ aujourd'hui − MAX_AGE_DAYS).
// Pur, sans dépendance : testable (lib/receipt-key-sanity.test.ts).

export const MAX_TICKET_AGE_DAYS = 45;

export type KeySanity = {
  order_number: string | null;
  // true si l'année a été remplacée par l'année courante
  corrected: boolean;
  // pourquoi la clé a été invalidée (→ null), le cas échéant
  issue: null | "future" | "too_old" | "invalid_date";
  // date (YYYY-MM-DD) finalement portée par la clé, si le format en contient une
  date: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
function isRealDate(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && isoDate(d) === iso;
}

/**
 * @param key        clé lue par l'OCR (déjà validée contre le pattern), ou null
 * @param pattern    regex de la clé (compileKeyPattern(config)) — null = pas de clé fiable
 * @param dateGroup  index du groupe capturant la date, null si le format n'en contient pas
 * @param todayISO   date du jour YYYY-MM-DD (Europe/Brussels côté appelant)
 */
export function sanitizeKeyDate(
  key: string | null,
  pattern: RegExp | null,
  dateGroup: number | null,
  todayISO: string
): KeySanity {
  if (!key || !pattern || dateGroup === null) {
    return { order_number: key, corrected: false, issue: null, date: null };
  }
  const m = pattern.exec(key.trim());
  const captured = m?.[dateGroup];
  if (!captured || !ISO.test(captured)) {
    return { order_number: key, corrected: false, issue: null, date: null };
  }
  if (!isRealDate(captured)) {
    return { order_number: null, corrected: false, issue: "invalid_date", date: captured };
  }

  const oldest = addDays(todayISO, -MAX_TICKET_AGE_DAYS);
  const inWindow = (d: string) => d >= oldest && d <= todayISO;

  if (inWindow(captured)) {
    return { order_number: key, corrected: false, issue: null, date: captured };
  }

  // Année passée manifestement fausse ? On essaie l'année courante (et la
  // précédente en tout début d'année) : si ça tombe dans la fenêtre, c'est
  // une erreur de lecture de l'année, pas un vieux ticket.
  const year = Number(captured.slice(0, 4));
  const todayYear = Number(todayISO.slice(0, 4));
  if (year < todayYear) {
    for (const y of [todayYear, todayYear - 1]) {
      if (y === year) continue;
      const candidate = `${y}${captured.slice(4)}`;
      if (isRealDate(candidate) && inWindow(candidate)) {
        return {
          order_number: key.replace(captured, candidate),
          corrected: true,
          issue: null,
          date: candidate,
        };
      }
    }
    return { order_number: null, corrected: false, issue: "too_old", date: captured };
  }

  // Date future (année ou jour lus trop grands) : on ne devine pas.
  return { order_number: null, corrected: false, issue: "future", date: captured };
}
