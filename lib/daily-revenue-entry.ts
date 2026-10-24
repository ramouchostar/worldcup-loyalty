// ADR 0087 — le CA du jour saisi par le restaurateur dans la console : règles
// PURES (aucune base, aucune horloge — « aujourd'hui » est injecté), testées
// dans daily-revenue-entry.test.ts.
//
// Deux façons de saisir, à égalité : par canal (le total se calcule) ou le
// total directement. Un seul chiffre fait foi — le total, qui devient la vente
// de caisse du jour (ADR 0078 §4). Les canaux n'en sont que le détail.

import { addDays, isDay, parseAmount, weekdayName, type DailyEntry, outcomeHasAmount } from "@/lib/daily-revenue-model";

export const CHANNELS = [
  { key: "uber", label: "Uber Eats" },
  { key: "deliveroo", label: "Deliveroo" },
  { key: "takeaway", label: "Takeaway" },
  { key: "emporter", label: "À emporter" },
  { key: "sur_place", label: "Sur place" },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];
export type Channels = Record<ChannelKey, number | null>;

/** On saisit ou corrige les 14 derniers jours, aujourd'hui compris (le rappel du soir vise le jour même). */
export const EDITABLE_DAYS = 14;
/** « À faire » regarde les 7 jours qui précèdent aujourd'hui. */
export const TODO_WINDOW = 7;
/** Seuils d'un écart « inhabituel » (ADR 0087 §3). */
export const UNUSUAL_DAY_PCT = 25;
export const UNUSUAL_WEEK_PCT = 15;
/** Au-delà, une faute de frappe plus qu'un chiffre de caisse. */
const MAX_DAY_AMOUNT = 100_000;
const MAX_ORDERS = 5_000;

export function isEditableDay(day: string, today: string): boolean {
  return isDay(day) && day <= today && day >= addDays(today, -(EDITABLE_DAYS - 1));
}

// ── Lecture du formulaire ────────────────────────────────────────────────────

export type EntryInput = {
  closed: boolean;
  /** Montants tapés par canal (texte brut, vide = non renseigné). */
  channels: Partial<Record<ChannelKey, string>>;
  total: string;
  orders: string;
};

export type ParsedEntry =
  | { ok: true; closed: true }
  | { ok: true; closed: false; amount: number; tickets: number | null; channels: Channels | null }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Le total direct gagne s'il est rempli ; sinon la somme des canaux remplis.
 * Les deux remplis à la fois ne peut venir que d'un formulaire bricolé : le
 * total fait foi, les canaux sont ignorés plutôt que de produire un détail faux.
 */
export function parseEntry(input: EntryInput): ParsedEntry {
  if (input.closed) return { ok: true, closed: true };

  const ordersRaw = input.orders.trim();
  let tickets: number | null = null;
  if (ordersRaw) {
    const n = Number(ordersRaw.replace(/\s/g, ""));
    if (!Number.isInteger(n) || n < 0 || n > MAX_ORDERS) return { ok: false, error: "Nombre de commandes illisible : tape un nombre entier, par exemple 57." };
    tickets = n > 0 ? n : null;
  }

  const totalRaw = input.total.trim();
  if (totalRaw) {
    const amount = parseAmount(totalRaw);
    if (amount === null || amount <= 0) return { ok: false, error: "Total illisible : tape par exemple 1527 ou 1 527,50." };
    if (amount > MAX_DAY_AMOUNT) return { ok: false, error: "Ce total paraît trop élevé pour une journée. Vérifie le chiffre." };
    return { ok: true, closed: false, amount: round2(amount), tickets, channels: null };
  }

  const channels = {} as Channels;
  let filled = 0;
  for (const c of CHANNELS) {
    const raw = (input.channels[c.key] ?? "").trim();
    if (!raw) {
      channels[c.key] = null;
      continue;
    }
    const v = parseAmount(raw);
    if (v === null || v < 0) return { ok: false, error: `${c.label} : montant illisible. Tape par exemple 266 ou 266,50.` };
    channels[c.key] = round2(v);
    filled++;
  }
  if (filled === 0) return { ok: false, error: "Remplis au moins un canal, ou le total de la journée." };
  const amount = round2(CHANNELS.reduce((s, c) => s + (channels[c.key] ?? 0), 0));
  if (amount <= 0) return { ok: false, error: "Le total des canaux est à 0 € : si le restaurant était fermé, utilise « fermé ce jour-là »." };
  if (amount > MAX_DAY_AMOUNT) return { ok: false, error: "Ce total paraît trop élevé pour une journée. Vérifie les chiffres." };
  return { ok: true, closed: false, amount, tickets, channels };
}

/** Le détail recopié dans la note quand la base n'a pas encore les colonnes de canaux. */
export function channelsNote(channels: Channels | null): string | null {
  if (!channels) return null;
  const parts = CHANNELS.filter((c) => channels[c.key] !== null).map((c) => `${c.label} ${channels[c.key]}`);
  return parts.length ? `Par canal : ${parts.join(" · ")}` : null;
}

// ── Les jours à saisir (« À faire ») ──────────────────────────────────────────

/**
 * Jours des `TODO_WINDOW` derniers jours (hier d'abord) sans chiffre ni « fermé ».
 * `covered` = jours déjà connus : saisie du jour (quelle que soit l'issue, sauf
 * « pas de réponse ») ou ventes importées.
 */
export function missingDays(covered: Set<string>, today: string, window = TODO_WINDOW): string[] {
  const out: string[] = [];
  for (let i = 1; i <= window; i++) {
    const d = addDays(today, -i);
    if (!covered.has(d)) out.push(d);
  }
  return out;
}

/** Libellé court d'un jour : « lundi 26 ». */
export function shortDayLabel(day: string): string {
  return `${weekdayName(day)} ${Number(day.slice(8, 10))}`;
}

// ── Ce que ça donne (écran de retour) ─────────────────────────────────────────

export type ProgramOfDay = { amount: number; tickets: number };

export type DayFeedback = {
  day: string;
  amount: number;
  /** Le jour face à la moyenne des mêmes jours de semaine déjà notés (jusqu'à 4). */
  sameDays: { n: number; avg: number; pct: number; unusual: boolean } | null;
  /** Semaine du lundi jusqu'au jour, face à la même période de la semaine d'avant (complète). */
  week: { sum: number; days: number; prevSum: number | null; pct: number | null; unusual: boolean };
  averageTicket: number | null;
  program: {
    tickets: number;
    amount: number;
    /** CA du programme ÷ CA du jour, en %. */
    penetrationPct: number;
    /** Tickets du programme ÷ commandes de caisse, en % (si le nombre est donné). */
    orderSharePct: number | null;
    orders: number | null;
  };
};

const pctDiff = (a: number, b: number) => Math.round((a / b - 1) * 100);

function amountOf(e: DailyEntry | undefined): number | null {
  return e && outcomeHasAmount(e.outcome) && typeof e.amount === "number" ? e.amount : null;
}

function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/**
 * Même lecture que replyMessage (ADR 0078), en données : l'écran la met en page.
 * `entries` = les jours déjà notés (le jour saisi peut y figurer : il est remplacé
 * par `amount`). Jamais de prévision ici (ADR 0027 §7).
 */
export function dayFeedback(
  entries: DailyEntry[],
  day: string,
  amount: number,
  orders: number | null,
  program: ProgramOfDay,
): DayFeedback {
  const byDay = new Map(entries.filter((e) => e.sales_day !== day).map((e) => [e.sales_day, e]));

  const same = [...byDay.values()]
    .filter((e) => e.sales_day < day && weekday(e.sales_day) === weekday(day) && amountOf(e) !== null)
    .sort((a, b) => b.sales_day.localeCompare(a.sales_day))
    .slice(0, 4);
  let sameDays: DayFeedback["sameDays"] = null;
  if (same.length > 0) {
    const avg = same.reduce((s, e) => s + (e.amount as number), 0) / same.length;
    const pct = pctDiff(amount, avg);
    sameDays = { n: same.length, avg, pct, unusual: Math.abs(pct) >= UNUSUAL_DAY_PCT };
  }

  const back = (weekday(day) + 6) % 7; // jours depuis lundi
  const monday = addDays(day, -back);
  let sum = amount;
  let days = 1;
  for (let i = 0; i < back; i++) {
    const a = amountOf(byDay.get(addDays(monday, i)));
    if (a !== null) {
      sum += a;
      days++;
    }
  }
  let prevSum = 0;
  let prevN = 0;
  for (let i = 0; i <= back; i++) {
    const a = amountOf(byDay.get(addDays(monday, i - 7)));
    if (a !== null) {
      prevSum += a;
      prevN++;
    }
  }
  // Comparer une semaine entière à une semaine trouée tromperait : les deux doivent être complètes.
  const comparable = days === back + 1 && prevN === back + 1 && prevSum > 0;
  const weekPct = comparable ? pctDiff(sum, prevSum) : null;

  return {
    day,
    amount,
    sameDays,
    week: {
      sum,
      days,
      prevSum: comparable ? prevSum : null,
      pct: weekPct,
      unusual: weekPct !== null && Math.abs(weekPct) >= UNUSUAL_WEEK_PCT,
    },
    averageTicket: orders && orders > 0 ? Math.round((amount / orders) * 100) / 100 : null,
    program: {
      tickets: program.tickets,
      amount: Math.round(program.amount * 100) / 100,
      penetrationPct: amount > 0 ? Math.round((program.amount / amount) * 1000) / 10 : 0,
      orderSharePct: orders && orders > 0 ? Math.round((program.tickets / orders) * 100) : null,
      orders,
    },
  };
}
