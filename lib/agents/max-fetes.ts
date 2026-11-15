import { createAdminClient } from "../supabase";
import { addDays } from "../daily-revenue-model";
import { isPlacesConfigured, placeSpecialDays } from "../audit/places";
import type { IdeaLines } from "./chloe";

// Max — les horaires des jours fériés (ADR 0105 §5, étape 2).
//
// Quinze jours avant un jour férié belge ou une veille de fête, Max demande au gérant ses horaires de
// ces jours-là, pour qu'ils soient sur sa fiche Google. Sans horaires exceptionnels, Google affiche les
// horaires habituels (ou prévient qu'ils « peuvent varier ») : un client qui voit « fermé » à tort, ou
// trouve porte close, part chez le voisin. Le geste est gratuit, et le gain se joue ce jour-là.
//
// Ce que Max sait, et ce qu'il ne sait pas :
//   - l'API Places ne montre les horaires exceptionnels (`currentOpeningHours.specialDays`) que pour les
//     7 prochains jours. Au-delà, Max ne peut pas savoir s'ils sont déjà posés : il demande, et le gérant
//     répond « Déjà fait » d'un geste (refus appris, ADR 0089 §8) ;
//   - dans les 7 jours, Max relit la fiche : si TOUS les jours de l'occasion y ont des horaires
//     exceptionnels, il se tait (`deja_sur_la_fiche`). Une lecture en échec ne le fait jamais taire : il
//     vaut mieux demander une fois de trop que laisser passer Noël. L'échec est dans la trace ;
//   - il ne devine aucun horaire : c'est le gérant qui les donne, l'équipe (ou le gérant lui-même) les
//     pose. Les franchisés et Boosteats peuvent modifier les fiches (Mehdi, 2026-11-15).

export type FeteIdea = {
  assistant: "max";
  type: "horaires_jours_speciaux";
  finding: string; // « horaires_fetes:<premier jour> » : une idée par occasion, jamais deux
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: null;
  decideBy: string;
  action: { kind: "update_fiche"; finding: string; via: "api" | "equipe"; needsInput: string; label: string };
  evidence: Record<string, number | string | string[]>;
};

export type FeteBlock =
  | "pas_de_fiche" // pas d'identifiant Google
  | "aucune_fete_proche" // aucun jour spécial dans la fenêtre
  | "deja_sur_la_fiche"; // tous les jours de l'occasion ont déjà des horaires exceptionnels

export type FeteDecision = { idea: FeteIdea | null; reason: FeteBlock | null };

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** Max demande à partir de 15 jours avant le premier jour de l'occasion. */
export const LEAD_DAYS = 15;
/** … et jusqu'à 2 jours avant : en deçà, l'équipe n'a plus le temps de poser les horaires. */
export const LAST_CALL_DAYS = 2;
/** Fenêtre de l'API Places pour les horaires exceptionnels. */
export const PLACES_SPECIAL_DAYS_WINDOW = 7;
/** Deux jours spéciaux à moins de 8 jours l'un de l'autre forment une seule occasion (24/12 → 1/1). */
const GROUP_GAP_DAYS = 7;

// ─── Le calendrier belge (pur) ────────────────────────────────────────────────

export type SpecialDay = { date: string; label: string };

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Dimanche de Pâques (calendrier grégorien, algorithme anonyme de Meeus). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

/** Les jours fériés légaux belges et les deux veilles de fête où les horaires changent. */
export function belgianSpecialDays(year: number): SpecialDay[] {
  const easter = easterSunday(year);
  const days: SpecialDay[] = [
    { date: iso(year, 1, 1), label: "Nouvel An" },
    { date: addDays(easter, 1), label: "lundi de Pâques" },
    { date: iso(year, 5, 1), label: "fête du Travail" },
    { date: addDays(easter, 39), label: "Ascension" },
    { date: addDays(easter, 50), label: "lundi de Pentecôte" },
    { date: iso(year, 7, 21), label: "fête nationale" },
    { date: iso(year, 8, 15), label: "Assomption" },
    { date: iso(year, 11, 1), label: "Toussaint" },
    { date: iso(year, 11, 11), label: "Armistice" },
    { date: iso(year, 12, 24), label: "veille de Noël" },
    { date: iso(year, 12, 25), label: "Noël" },
    { date: iso(year, 12, 31), label: "Saint-Sylvestre" },
  ];
  return days.sort((x, y) => (x.date < y.date ? -1 : 1));
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** La prochaine occasion dont le premier jour tombe entre J+2 et J+15, ou null. */
export function nextOccasion(todayISO: string): SpecialDay[] | null {
  const year = Number(todayISO.slice(0, 4));
  const all = [...belgianSpecialDays(year), ...belgianSpecialDays(year + 1)];
  const groups: SpecialDay[][] = [];
  for (const d of all) {
    const last = groups[groups.length - 1];
    if (last && dayDiff(last[last.length - 1].date, d.date) <= GROUP_GAP_DAYS) last.push(d);
    else groups.push([d]);
  }
  for (const g of groups) {
    const lead = dayDiff(todayISO, g[0].date);
    if (lead >= LAST_CALL_DAYS && lead <= LEAD_DAYS) return g;
  }
  return null;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 24, 25 et 31 décembre et 1er janvier » : les jours groupés par mois, le 1er écrit « 1er ». */
export function datesLabel(dates: string[]): string {
  const byMonth: { month: number; days: string[] }[] = [];
  for (const d of dates) {
    const month = Number(d.slice(5, 7));
    const day = Number(d.slice(8, 10));
    const label = day === 1 ? "1er" : String(day);
    const last = byMonth[byMonth.length - 1];
    if (last && last.month === month) last.days.push(label);
    else byMonth.push({ month, days: [label] });
  }
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);
  return join(byMonth.map((g) => `${join(g.days)} ${MONTHS[g.month - 1]}`));
}

// ─── L'idée (pur) ─────────────────────────────────────────────────────────────

export type FeteInput = {
  restaurantId: string;
  todayISO: string;
  hasPlace: boolean;
  /**
   * Les jours qui ont des horaires exceptionnels sur la fiche, lus par Places (7 jours à venir).
   * `null` : pas lus (hors fenêtre, Places non configuré, ou lecture en échec — voir `readNote`).
   */
  specialDaysOnFiche: string[] | null;
  readNote: "lu" | "hors_fenetre" | "places_absent" | "echec";
  ficheManaged: boolean;
};

export function feteDecision(input: FeteInput): FeteDecision {
  if (!input.hasPlace) return { idea: null, reason: "pas_de_fiche" };
  const occasion = nextOccasion(input.todayISO);
  if (!occasion) return { idea: null, reason: "aucune_fete_proche" };

  const dates = occasion.map((d) => d.date);
  const onFiche = input.specialDaysOnFiche ?? [];
  // Se taire seulement si la fiche a été lue ET que tous les jours sont dans la fenêtre lisible ET posés.
  const readable = dates.every((d) => dayDiff(input.todayISO, d) <= PLACES_SPECIAL_DAYS_WINDOW);
  if (input.specialDaysOnFiche && readable && dates.every((d) => onFiche.includes(d))) {
    return { idea: null, reason: "deja_sur_la_fiche" };
  }

  const first = dates[0];
  const when = datesLabel(dates);
  const names = [...new Set(occasion.map((d) => d.label))].join(", ");
  const via = input.ficheManaged ? "api" : "equipe";
  const needsInput = `tes horaires du ${when} (ouvert, fermé ou horaires réduits)`;
  const finding = `horaires_fetes:${first}`;
  return {
    reason: null,
    idea: {
      assistant: "max",
      type: "horaires_jours_speciaux",
      finding,
      title: `Tes horaires du ${when} sont-ils sur ta fiche Google ?`,
      question: "Tu me donnes tes horaires ?",
      lines: {
        what: `Poser sur ta fiche Google tes horaires du ${when} (${names}). Sans eux, Google montre tes horaires habituels : un client qui trouve porte close, ou qui croit que tu es fermé, va chez le voisin.`,
        who:
          via === "api"
            ? `Toi, pour me donner ${needsInput} ; je mets ta fiche à jour.`
            : `Toi, pour nous donner ${needsInput} ; l'équipe Boosteats les pose sur ta fiche. Déjà fait ? Réponds « Déjà fait ».`,
        cost: "0 € : quelques minutes, et ta fiche dit vrai ces jours-là.",
      },
      estimate: null,
      decideBy: addDays(first, -LAST_CALL_DAYS),
      action: { kind: "update_fiche", finding, via, needsInput, label: "Oui, je donne mes horaires" },
      evidence: {
        dates,
        occasion: names,
        daysBefore: dayDiff(input.todayISO, first),
        ficheRead: input.readNote,
        onFiche,
      },
    },
  };
}

// ─── Lecture en base et chez Google ───────────────────────────────────────────

/**
 * La fiche n'est lue chez Google que si un jour de l'occasion tombe dans les 7 prochains jours : avant,
 * la réponse serait toujours vide, et chaque lecture coûte. Une lecture en échec est dite (`echec`,
 * journal `[max-fetes]`) et ne fait jamais taire Max.
 */
export async function loadFeteInput(restaurantId: string, todayISO: string): Promise<FeteInput> {
  const { data, error } = await createAdminClient().from("restaurants").select("google_place_id").eq("id", restaurantId).maybeSingle();
  if (error) throw new Error(`restaurants : ${error.message}`);
  const placeId = (data as { google_place_id: string | null } | null)?.google_place_id ?? null;
  const base: FeteInput = { restaurantId, todayISO, hasPlace: !!placeId, specialDaysOnFiche: null, readNote: "hors_fenetre", ficheManaged: false };
  if (!placeId) return base;

  const occasion = nextOccasion(todayISO);
  const inWindow = !!occasion && occasion.some((d) => dayDiff(todayISO, d.date) <= PLACES_SPECIAL_DAYS_WINDOW);
  if (!inWindow) return base;
  if (!isPlacesConfigured()) return { ...base, readNote: "places_absent" };
  try {
    return { ...base, specialDaysOnFiche: await placeSpecialDays(placeId), readNote: "lu" };
  } catch (e) {
    console.error(`[max-fetes] ${restaurantId} : lecture des horaires exceptionnels impossible :`, (e as Error).message);
    return { ...base, readNote: "echec" };
  }
}

export async function loadFeteDecision(restaurantId: string, todayISO: string): Promise<FeteDecision> {
  return feteDecision(await loadFeteInput(restaurantId, todayISO));
}

export const FETE_BLOCK_TEXT: Record<FeteBlock, string> = {
  pas_de_fiche: "Pas de fiche Google reliée à cet établissement.",
  aucune_fete_proche: "Aucun jour férié dans les 15 prochains jours.",
  deja_sur_la_fiche: "Les horaires de ces jours-là sont déjà sur la fiche.",
};
