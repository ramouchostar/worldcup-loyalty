// ADR 0078 — CA du jour saisi à la main : règles PURES (aucune base, aucune
// horloge — « aujourd'hui » est toujours injecté), testées dans
// daily-revenue-model.test.ts.
//
// Le chiffre d'affaires d'une journée arrive par WhatsApp (test manuel avec le
// responsable de caisse) et un super-admin le note dans /platform/ca. On garde
// aussi CE QUI S'EST PASSÉ (réponse directe, après relance, silence, fermé) :
// c'est la trace du test — le taux de réponse dit si le geste tient.

import { normalizeAmount } from "@/lib/sales-import";

export const OUTCOMES = ["repondu", "relance", "sans_reponse", "ferme", "historique"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  repondu: "Répondu",
  relance: "Après relance",
  sans_reponse: "Pas de réponse",
  ferme: "Fermé",
  historique: "Historique",
};

/** Les issues qui portent un montant (une réponse, ou un chiffre d'avant le test). */
export function outcomeHasAmount(o: Outcome): boolean {
  return o === "repondu" || o === "relance" || o === "historique";
}

export interface DailyEntry {
  sales_day: string; // AAAA-MM-JJ
  outcome: Outcome;
  amount: number | null;
  tickets: number | null;
  asked_at: string | null; // HH:MM
  replied_at: string | null; // HH:MM
  note: string | null;
}

/** Objectif du test : 10 réponses sur 14 jours ouverts. */
export const TEST_DAYS = 14;
export const TARGET_RATE = 10 / 14;
const MIN_DAYS_FOR_VERDICT = 4;

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// ── Dates (chaînes AAAA-MM-JJ, midi UTC : insensible aux changements d'heure) ──

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function weekdayName(day: string): string {
  return WEEKDAYS[weekday(day)];
}

/** « vendredi 2 octobre » */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function isDay(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

// ── Saisie ───────────────────────────────────────────────────────────────────

/**
 * Montant tapé à la main : « 1 240 », « 1240,50 », « 1.240 € ». Un point suivi de
 * trois chiffres exactement est un séparateur de milliers (usage belge) — sans
 * cette règle, normalizeAmount lirait « 1.240 » comme 1,24 €.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s €]/g, "");
  const thousands = /^\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, "") : compact;
  const n = normalizeAmount(thousands);
  if (n === null || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

export function parseTime(raw: string | null | undefined): string | null {
  const m = /^(\d{1,2})[:h](\d{2})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

// ── Formats ──────────────────────────────────────────────────────────────────

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-BE")} €`;
const eur2 = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const signed = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`;
const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function amountOf(e: DailyEntry | undefined): number | null {
  return e && outcomeHasAmount(e.outcome) && typeof e.amount === "number" ? e.amount : null;
}

// ── La réponse renvoyée au responsable de caisse ─────────────────────────────

/**
 * Le message WhatsApp qui remercie et compare : mêmes jours de semaine déjà notés
 * (jusqu'à 4), ticket moyen si les tickets sont donnés, semaine en cours contre la
 * même période de la semaine d'avant (seulement si elle est complète). Jamais de
 * prévision ici : il en faut 4 semaines (ADR 0027 §7).
 */
export function replyMessage(entries: DailyEntry[], day: string, amount: number, tickets: number | null): string {
  const byDay = new Map(entries.map((e) => [e.sales_day, e]));
  const name = weekdayName(day);
  const lines = [`Noté ✅ ${cap(name)} : ${eur(amount)}.`];

  const same = entries
    .filter((e) => e.sales_day < day && weekday(e.sales_day) === weekday(day) && amountOf(e) !== null)
    .sort((a, b) => b.sales_day.localeCompare(a.sales_day))
    .slice(0, 4);
  if (same.length > 0) {
    const avg = same.reduce((s, e) => s + (e.amount as number), 0) / same.length;
    const p = pct(amount, avg);
    const arrow = p >= 3 ? "📈" : p <= -3 ? "📉" : "➡️";
    lines.push(
      same.length === 1
        ? `${arrow} ${signed(p)} par rapport à ${name} dernier (${eur(avg)}).`
        : `${arrow} ${signed(p)} par rapport à la moyenne de tes ${same.length} derniers ${name}s (${eur(avg)}).`,
    );
  } else {
    lines.push(`Je le garde : dès ${name} prochain, je te dis si c'est mieux ou moins bien.`);
  }

  if (tickets && tickets > 0) lines.push(`Ticket moyen : ${eur2(amount / tickets)} (${tickets} tickets).`);

  const back = (weekday(day) + 6) % 7; // jours depuis lundi
  if (back > 0) {
    const monday = addDays(day, -back);
    let sum = amount;
    let n = 1;
    let prevSum = 0;
    let prevN = 0;
    for (let i = 0; i < back; i++) {
      const a = amountOf(byDay.get(addDays(monday, i)));
      if (a !== null) { sum += a; n++; }
    }
    for (let i = 0; i <= back; i++) {
      const a = amountOf(byDay.get(addDays(monday, i - 7)));
      if (a !== null) { prevSum += a; prevN++; }
    }
    let line = `Semaine en cours : ${eur(sum)} sur ${n} jour${n > 1 ? "s" : ""}`;
    if (prevN === back + 1 && prevSum > 0) line += ` (${signed(pct(sum, prevSum))} vs la semaine dernière à la même date)`;
    lines.push(`${line}.`);
  }

  lines.push("Merci, à demain !");
  return lines.join("\n");
}

export function morningMessage(day: string): string {
  return `Bonjour 👋 CA de ${weekdayName(day)} ?\nRéponds juste le chiffre (et le nombre de tickets si tu l'as).`;
}

export function reminderMessage(day: string): string {
  return `Petit rappel : le CA de ${weekdayName(day)} ? Un chiffre suffit 🙂`;
}

/** Récap du lundi pour le propriétaire : les 7 jours qui précèdent `today`. */
export function weeklyRecap(entries: DailyEntry[], today: string, restaurantName: string): string {
  const byDay = new Map(entries.map((e) => [e.sales_day, e]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 7));
  const open = days.filter((d) => {
    const e = byDay.get(d);
    return e && e.outcome !== "ferme" && e.outcome !== "historique";
  });
  if (open.length === 0) return `Bonjour ! (Ce récap se remplit avec les jours notés de la semaine.)`;
  const filled = open.filter((d) => amountOf(byDay.get(d)) !== null);
  const missing = open.filter((d) => amountOf(byDay.get(d)) === null).map(weekdayName);
  const total = filled.reduce((s, d) => s + (amountOf(byDay.get(d)) as number), 0);
  return [
    `Bonjour ! La semaine à ${restaurantName} : ${filled.length} jour${filled.length > 1 ? "s" : ""} sur ${open.length} remplis.` +
      (missing.length ? ` Il manque ${missing.join(", ")}.` : " Rien ne manque 👏"),
    ...(filled.length ? [`CA total des jours remplis : ${eur(total)}.`] : []),
  ].join("\n");
}

// ── Le test : 14 jours, taux de réponse ──────────────────────────────────────

export type Verdict = { tone: "neutral" | "good" | "warn" | "bad"; text: string };

export interface TestStats {
  start: string | null; // premier jour du test (premier jour noté hors historique)
  days: string[]; // les 14 jours du test
  elapsed: number; // jours du test déjà passés (≤ hier)
  toNote: string[]; // jours passés du test encore sans note
  open: number; // jours notés ouverts (hors fermé)
  answered: number; // répondu + après relance
  firstTry: number; // répondu sans relance
  medianDelayMin: number | null;
  verdict: Verdict;
}

function minutes(t: string | null): number | null {
  const v = parseTime(t);
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export function testStats(entries: DailyEntry[], today: string): TestStats {
  const testEntries = entries.filter((e) => e.outcome !== "historique");
  const start = testEntries.length ? testEntries.map((e) => e.sales_day).sort()[0] : null;
  const days = start ? Array.from({ length: TEST_DAYS }, (_, i) => addDays(start, i)) : [];
  const yesterday = addDays(today, -1);
  const byDay = new Map(testEntries.map((e) => [e.sales_day, e]));
  const inTest = days.map((d) => byDay.get(d)).filter((e): e is DailyEntry => !!e);
  const open = inTest.filter((e) => e.outcome !== "ferme");
  const answered = open.filter((e) => e.outcome === "repondu" || e.outcome === "relance");
  const firstTry = open.filter((e) => e.outcome === "repondu");
  const delays = answered
    .map((e) => {
      const a = minutes(e.asked_at);
      const b = minutes(e.replied_at);
      return a !== null && b !== null && b >= a ? b - a : null;
    })
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const medianDelayMin = delays.length ? delays[Math.floor((delays.length - 1) / 2)] : null;
  const elapsedDays = days.filter((d) => d <= yesterday);
  const toNote = elapsedDays.filter((d) => !byDay.has(d));

  return {
    start,
    days,
    elapsed: elapsedDays.length,
    toNote,
    open: open.length,
    answered: answered.length,
    firstTry: firstTry.length,
    medianDelayMin,
    verdict: verdictFor(open.length, answered.length, elapsedDays.length >= TEST_DAYS && toNote.length === 0),
  };
}

export function verdictFor(open: number, answered: number, done: boolean): Verdict {
  if (open === 0) return { tone: "neutral", text: "Pas encore de jour noté. Note la première réponse." };
  const rate = answered / open;
  const p = Math.round(rate * 100);
  if (open < MIN_DAYS_FOR_VERDICT) {
    return { tone: "neutral", text: `Trop tôt pour conclure : ${answered} réponse${answered > 1 ? "s" : ""} sur ${open} jour${open > 1 ? "s" : ""} ouvert${open > 1 ? "s" : ""}.` };
  }
  if (rate >= TARGET_RATE) {
    return done
      ? { tone: "good", text: `Test réussi : ${p} % de réponses (objectif 71 %, soit 10 sur 14). On peut construire la version WhatsApp.` }
      : { tone: "good", text: `En bonne voie : ${p} % de réponses (objectif 71 %, soit 10 sur 14). Continue jusqu'au 14e jour.` };
  }
  if (rate >= 0.5) {
    return { tone: "warn", text: `${p} % de réponses, sous l'objectif de 71 %. Regarde les notes : l'heure du message ou la personne ne sont peut-être pas les bonnes.` };
  }
  return done
    ? { tone: "bad", text: `Seulement ${p} % de réponses. Le geste ne tient pas tel quel : demande ce qui bloque avant de construire quoi que ce soit.` }
    : { tone: "bad", text: `Seulement ${p} % de réponses. Appelle le responsable pour comprendre ce qui bloque, sans attendre la fin du test.` };
}
