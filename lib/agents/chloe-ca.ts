import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { isMissingTable } from "../audit/store";
import { isMessageEnabled } from "../message-log";
import { addDays } from "../daily-revenue-model";
import { missingDays, shortDayLabel } from "../daily-revenue-entry";
import { CA_REMINDER_KEY, planReminders, type ClosingTimes } from "../daily-revenue-reminders";
import type { IdeaLines } from "./chloe";

// Chloé — le rappel du CA du jour (Brigade 09, chantier « La brigade »).
//
// Quand le CA d'hier n'est pas noté, une idée : « Tu n'as pas noté hier : 30 secondes ? ».
// Elle ouvre la saisie existante (ADR 0087, `/admin/[restaurantId]/ca/[jour]`) : Chloé ne
// saisit rien et n'invente aucun chiffre, elle rappelle le geste.
//
// Rien de neuf dans les règles : ce module ASSEMBLE celles de l'ADR 0087, il ne les refait pas.
//   - un jour est « couvert » s'il a une saisie (hors « pas de réponse ») ou des ventes importées ;
//   - le rappel du lendemain est dû quand hier n'est pas couvert ET n'est pas un jour de
//     fermeture habituel : c'est `planReminders` qui le dit, avec les horaires de la fiche Google ;
//   - on ne relance qu'un établissement qui note déjà son CA (un jour noté sur les 28 derniers)
//     ou dont les rappels sont allumés : jamais une tâche à quelqu'un à qui on n'a rien demandé
//     (ADR 0087 §5, même règle que l'accueil simple).
//
// Un jour sans bonne idée vaut mieux qu'une idée de remplissage : dans tous les autres cas,
// Chloé ne dit rien.

// ─── Types provisoires ────────────────────────────────────────────────────────
// Le contrat commun des idées (lib/agents/types.ts) est écrit par Mehdi (Brigade 01). Cette idée
// n'a pas de relais vers Hugo : son « geste » est d'ouvrir un écran existant (`action`). À
// l'arrivée de types.ts, on remplace ces types, pas la logique.

export type ChloeCaIdea = {
  assistant: "chloe";
  type: "ca_du_jour_a_noter";
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: null; // un rappel ne promet aucun gain : on ne chiffre pas
  decideBy: string; // ISO : l'idée d'hier expire ce soir, demain a la sienne
  action: { kind: "open"; path: string; label: string };
  evidence: Record<string, number | string | string[]>; // les chiffres qui ont produit l'idée (trace)
};

export type ChloeCaInput = {
  restaurantId: string;
  todayISO: string; // jour de Bruxelles
  covered: Set<string>; // jours notés (saisie ou ventes importées), hors « pas de réponse »
  closing: ClosingTimes | null; // horaires de la fiche Google ; null = inconnus (heure par défaut)
  remindersOn: boolean; // les rappels du CA sont allumés pour cet établissement
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** L'établissement « note son CA » s'il a un jour noté sur les 28 derniers (ADR 0087 §5). */
export const NOTES_CA_WINDOW_DAYS = 28;
/** On regarde l'état à 10 h : c'est l'heure du premier rappel du lendemain (ADR 0087 §4). */
const MORNING_MIN = 10 * 60;
/** Fenêtre de la trace : les jours notés sur les deux dernières semaines (seuil de révision, ADR 0087). */
const TRACE_DAYS = 14;

// ─── L'idée (pur, déterministe) ───────────────────────────────────────────────

/** Même règle que l'accueil simple : un jour noté sur les 28 derniers, ou les rappels allumés. */
export function notesCa(covered: Set<string>, todayISO: string, remindersOn: boolean): boolean {
  const since = addDays(todayISO, -NOTES_CA_WINDOW_DAYS);
  return remindersOn || [...covered].some((d) => d >= since);
}

/** Le rappel du CA d'hier, ou `null` quand il n'y a rien à rappeler. */
export function caReminderIdea(input: ChloeCaInput): ChloeCaIdea | null {
  const { restaurantId, todayISO, covered, closing, remindersOn } = input;
  if (!notesCa(covered, todayISO, remindersOn)) return null;

  const yesterday = addDays(todayISO, -1);
  const due = planReminders({ today: todayISO, nowMinutes: MORNING_MIN, closing, covered, sent: new Set() }).some(
    (r) => r.day === yesterday && r.slot !== "semaine"
  );
  if (!due) return null; // hier est noté, ou c'était un jour de fermeture

  const notedLast14 = Array.from({ length: TRACE_DAYS }, (_, i) => addDays(todayISO, -(i + 1))).filter((d) => covered.has(d)).length;
  return {
    assistant: "chloe",
    type: "ca_du_jour_a_noter",
    title: "Tu n'as pas noté hier",
    question: "30 secondes ?",
    lines: {
      what: `Noter le CA de ${shortDayLabel(yesterday)}, hier : ta caisse et tes plateformes.`,
      who: "Toi, ou la personne qui ferme la caisse.",
      cost: "0 € : trente secondes, et c'est ce qui permet de comparer ta semaine à la précédente.",
    },
    estimate: null,
    decideBy: todayISO,
    action: { kind: "open", path: `/admin/${restaurantId}/ca/${yesterday}`, label: "Saisir" },
    evidence: { day: yesterday, notedLast14, missing7: missingDays(covered, todayISO) },
  };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

/**
 * Jours notés sur les 28 derniers, horaires de fermeture et interrupteur des rappels d'un
 * établissement. Fail-open comme le reste du CA du jour : une table absente (migration pas
 * appliquée) donne « rien noté », jamais une erreur ; toute autre erreur remonte. Les ventes
 * importées se lisent par pages (un import CSV a une ligne par ticket) et refusent le tronqué.
 */
export async function loadChloeCaInput(restaurantId: string, todayISO: string): Promise<ChloeCaInput> {
  const admin = createAdminClient();
  const since = addDays(todayISO, -NOTES_CA_WINDOW_DAYS);

  const [entries, sales, resto, remindersOn] = await Promise.all([
    admin.from("daily_revenue_entries").select("sales_day, outcome").eq("restaurant_id", restaurantId).gte("sales_day", since),
    fetchAllRowsStrict<{ sold_on: string }>("Chloé CA : ventes importées", (from, to) =>
      admin.from("restaurant_sales").select("sold_on").eq("restaurant_id", restaurantId).gte("sold_on", since).order("id").range(from, to)
    ),
    admin.from("restaurants").select("closing_times").eq("id", restaurantId).maybeSingle(),
    isMessageEnabled(CA_REMINDER_KEY, restaurantId),
  ]);

  const covered = new Set<string>();
  if (entries.error && !isMissingTable(entries.error)) throw new Error(`daily_revenue_entries : ${entries.error.message}`);
  for (const e of (entries.data ?? []) as { sales_day: string; outcome: string }[]) if (e.outcome !== "sans_reponse") covered.add(e.sales_day);
  for (const s of sales) covered.add(String(s.sold_on).slice(0, 10));

  // Colonne absente (migration 20261024-1800 pas appliquée) : horaires inconnus, heure par défaut.
  const closing = resto.error ? null : ((resto.data as { closing_times: ClosingTimes | null } | null)?.closing_times ?? null);
  return { restaurantId, todayISO, covered, closing, remindersOn };
}
