// ============================================================
// Vue simple de la console — le parcours du restaurateur (ADR 0064).
//
// L'accueil de la console répond à trois questions, comme celui du membre
// (ADR 0059) : est-ce que ça tourne aujourd'hui ? qu'est-ce que je dois
// faire ? est-ce que ça vaut le coup ? Et il le fait selon l'étape où en est
// l'établissement : on ne montre pas des opportunités à un restaurant qui n'a
// pas encore de tickets, on lui dit où coller son QR.
//
// Fonctions PURES, même contrat que le forecast (ADR 0027) et la valeur
// programme : la date « aujourd'hui » est injectée (jour belge YYYY-MM-DD),
// chaque chiffre se recalcule à la main depuis les lignes sources. Aucune
// promesse inventée : un délai s'écrit « environ », un objectif se déduit de
// ce que l'établissement a déjà tenu.
//
// Surface restaurateur : les euros sont permis (ADR 0027 §1), rien ici ne
// remonte jamais vers un membre (ADR 0007).
// ============================================================

import { crossedMilestone, nextMilestone, type MilestoneKind } from "./email-templates/pro-milestone";

// ── Étapes ──────────────────────────────────────────────────────────────────

export type Stage = "lancer" | "rythme" | "croissance";

/** Tickets validés au total pour quitter l'étape « Lancer ». */
export const LAUNCH_TARGET = 10;
/** Tickets validés sur la fenêtre des idées pour débloquer « Faire grandir ». */
export const GROWTH_TARGET = 100;
/** Même fenêtre que la page Opportunités (PERIOD_DAYS) : quand l'étape
 *  s'ouvre, les idées ont réellement de quoi se calculer. */
export const GROWTH_WINDOW_DAYS = 90;

export const STAGES: readonly { key: Stage; label: string; unlock: string }[] = [
  { key: "lancer", label: "Lancer", unlock: "Tes 10 premiers tickets" },
  { key: "rythme", label: "Prendre le rythme", unlock: `${LAUNCH_TARGET} tickets validés` },
  { key: "croissance", label: "Faire grandir", unlock: `${GROWTH_TARGET} tickets sur 90 jours` },
];

export function stageOf(v: { validatedTotal: number; validatedWindow: number }): Stage {
  if (v.validatedTotal < LAUNCH_TARGET) return "lancer";
  if (v.validatedWindow < GROWTH_TARGET) return "rythme";
  return "croissance";
}

export type StageState = "done" | "current" | "locked";

export function stageStates(stage: Stage): { key: Stage; label: string; unlock: string; state: StageState }[] {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return STAGES.map((s, i) => ({ ...s, state: i < idx ? "done" : i === idx ? "current" : "locked" }));
}

// ── Jours belges ────────────────────────────────────────────────────────────

/** Compte par jour belge (YYYY-MM-DD). Un jour absent vaut 0. */
export type DayCounts = Record<string, number>;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`); // midi : aucun changement d'heure ne fait sauter de jour
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le jour de commerce d'un horodatage : un ticket de 23 h 30 appartient à la journée belge. */
export function brusselsDay(ts: string | Date): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

export function countByDay(timestamps: string[]): DayCounts {
  const out: DayCounts = {};
  for (const ts of timestamps) {
    const d = brusselsDay(ts);
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

const countOn = (c: DayCounts, day: string) => c[day] ?? 0;

// ── Objectif du jour ────────────────────────────────────────────────────────
//
// Des paliers, et une règle qu'on peut dire en une phrase au restaurateur :
// « ton objectif est le premier palier que tu n'as pas encore tenu 5 jours sur
// les 7 derniers ; tiens-le 5 jours sur 7 et tu passes au suivant ». Il monte
// tout seul quand l'établissement progresse, ne s'invente jamais un chiffre
// hors de portée, et redescend après une mauvaise semaine plutôt que de rester
// un reproche.
//
// Pas de « série de jours d'affilée » : un objectif qui monte casse
// forcément la série de qui garde son rythme — la récompense serait punie.
// Le jeu, c'est le passage de palier.
//
// Paliers serrés en bas (+1 jusqu'à 6) : entre 3 et 6 tickets par jour, un
// saut de 5 à 10 serait hors de portée pendant des semaines.

export const GOAL_LEVELS = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60] as const;
export const GOAL_HELD_DAYS = 5;
export const GOAL_WINDOW_DAYS = 7;

/** Objectif à partir des jours qui précèdent (ordre indifférent). */
export function goalFromHistory(previousDays: number[]): number {
  for (const level of GOAL_LEVELS) {
    const held = previousDays.filter((n) => n >= level).length;
    if (held < GOAL_HELD_DAYS) return level;
  }
  return GOAL_LEVELS[GOAL_LEVELS.length - 1];
}

/** L'objectif d'un jour — calculé sur les 7 jours d'avant, jamais sur le jour même. */
export function goalForDay(counts: DayCounts, day: string): number {
  const previous = Array.from({ length: GOAL_WINDOW_DAYS }, (_, i) => countOn(counts, addDays(day, -(i + 1))));
  return goalFromHistory(previous);
}

/** Palier suivant — null au plafond. */
export function nextGoalLevel(goal: number): number | null {
  return GOAL_LEVELS.find((l) => l > goal) ?? null;
}

const WEEKDAY_LETTERS = ["D", "L", "M", "M", "J", "V", "S"]; // index getUTCDay()
const WEEKDAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export type DayCell = {
  day: string;
  letter: string;
  weekday: string;
  count: number;
  /** Jour qui atteint l'objectif d'aujourd'hui — une seule barre pour tous les jours. */
  met: boolean;
  isToday: boolean;
};

/** Les `n` derniers jours, du plus ancien à aujourd'hui inclus, jugés contre `goal`. */
export function recentDays(counts: DayCounts, today: string, goal: number, n = 7): DayCell[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1));
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    const count = countOn(counts, day);
    return { day, letter: WEEKDAY_LETTERS[wd], weekday: WEEKDAY_NAMES[wd], count, met: count >= goal, isToday: day === today };
  });
}

/** Rythme moyen par jour sur les `days` jours complets avant aujourd'hui. */
export function pacePerDay(counts: DayCounts, today: string, days = 14): number {
  let total = 0;
  for (let i = 1; i <= days; i++) total += countOn(counts, addDays(today, -i));
  return total / days;
}

/** Jours pour combler `remaining` au rythme donné — null si le rythme est nul. */
export function daysToReach(remaining: number, pace: number): number | null {
  if (remaining <= 0) return 0;
  if (pace <= 0) return null;
  return Math.ceil(remaining / pace);
}

// ── Liste de lancement (étape 1) ────────────────────────────────────────────

/** Au moins autant d'arrivées anonymes sur la vitrine en 14 jours : les QR sont au mur. */
export const QR_SCANNED_MIN = 5;
/** Articles au catalogue avec un prix de revient : le prix des cadeaux se calcule. */
export const CATALOG_READY_MIN = 5;

export type ChecklistItem = {
  key: "logo" | "menu" | "qr" | "staff" | "tickets";
  title: string;
  hint: string;
  done: boolean;
  href: string;
  progress?: { value: number; target: number };
};

export function launchChecklist(i: {
  base: string;
  hasLogo: boolean;
  canManage: boolean;
  catalogItemsWithCost: number;
  landings14d: number;
  staffCodes: number;
  validatedTotal: number;
  budgetPct: number;
}): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  // Un siège équipe ne peut pas ouvrir les réglages (ADR 0041 §6) : on ne lui
  // demande pas une tâche qu'il ne peut pas faire.
  if (i.canManage || i.hasLogo) {
    items.push({
      key: "logo",
      title: i.hasLogo ? "Ton logo est en place" : "Ajoute ton logo",
      hint: "Tes clients reconnaissent ta maison dans l'app, sur les QR et dans les messages.",
      done: i.hasLogo,
      href: `${i.base}/settings#charte`,
    });
  }
  items.push({
    key: "menu",
    title: i.catalogItemsWithCost >= CATALOG_READY_MIN ? "Ton menu et tes coûts sont prêts" : "Vérifie ton menu et tes coûts",
    hint: `C'est ce qui fixe le prix de chaque cadeau : jamais plus de ${pctLabel(i.budgetPct)} de ce que tes clients dépensent.`,
    done: i.catalogItemsWithCost >= CATALOG_READY_MIN,
    href: `${i.base}/menu`,
  });
  items.push({
    key: "qr",
    title: i.landings14d >= QR_SCANNED_MIN ? "Tes clients scannent ton QR" : "Affiche ton QR code",
    hint: "Au comptoir, sur les tables, dans les sacs à emporter. Les supports sont prêts à imprimer.",
    done: i.landings14d >= QR_SCANNED_MIN,
    href: `${i.base}/qr`,
  });
  items.push({
    key: "staff",
    title: i.staffCodes > 0 ? "Ton équipe en salle a son QR" : "Donne un QR à chaque personne en salle",
    hint: "Chacun montre son badge depuis son téléphone, et tu vois qui fait inscrire le plus de clients.",
    done: i.staffCodes > 0,
    href: `${i.base}/qr#equipe`,
  });
  items.push({
    key: "tickets",
    title: i.validatedTotal >= LAUNCH_TARGET ? "Tes 10 premiers tickets sont là" : "Tes 10 premiers tickets",
    hint: "À chaque client qui paie : « Photographiez votre ticket, un cadeau vous attend. »",
    done: i.validatedTotal >= LAUNCH_TARGET,
    href: `${i.base}/orders`,
    progress: { value: Math.min(i.validatedTotal, LAUNCH_TARGET), target: LAUNCH_TARGET },
  });
  return items;
}

export function pctLabel(pct: number): string {
  const v = Math.round(pct * 1000) / 10;
  return `${Number.isInteger(v) ? v : v.toLocaleString("fr-BE")} %`;
}

// ── Caps (mêmes paliers que l'e-mail « Cap franchi », ADR 0063) ────────────

export type MilestoneView = {
  kind: MilestoneKind;
  value: number;
  next: number | null;
  /** Cap franchi dans les 7 derniers jours — on le fête une semaine. */
  crossed: number | null;
};

export function milestoneView(kind: MilestoneKind, now: number, weekAgo: number): MilestoneView {
  return { kind, value: now, next: nextMilestone(kind, now), crossed: crossedMilestone(kind, weekAgo, now) };
}

/**
 * Le cap à montrer : un cap franchi cette semaine d'abord (la fête passe
 * avant la suite), sinon le prochain cap le plus avancé en proportion.
 */
export function pickMilestone(views: MilestoneView[]): MilestoneView | null {
  const crossed = views.find((v) => v.crossed !== null);
  if (crossed) return crossed;
  const withNext = views.filter((v) => v.next !== null);
  if (withNext.length === 0) return null;
  return withNext.reduce((best, v) => (v.value / v.next! > best.value / best.next! ? v : best));
}

// ── Le mois : ce que les cadeaux accompagnent ───────────────────────────────
//
// Jamais « grâce à nous » : c'est le CA des clients qui participent au
// programme, pas un CA additionnel prouvé (cadrage de lib/program-value.ts).

export type MonthView = { revenue: number; rewardsCost: number; perEuro: number | null };

export function monthView(revenue: number, rewardsCost: number): MonthView | null {
  if (!(revenue > 0)) return null;
  return {
    revenue,
    rewardsCost: Math.max(0, rewardsCost),
    perEuro: rewardsCost > 0 ? Math.round(revenue / rewardsCost) : null,
  };
}

// ── Gestes de comptoir (étape « Rythme ») ───────────────────────────────────

export const COUNTER_TIPS = [
  "Au moment d'encaisser : « Vous avez notre appli ? Photographiez votre ticket, un cadeau vous attend. »",
  "Colle le sticker QR sur la caisse, à hauteur des yeux du client qui paie.",
  "Glisse un flyer dans chaque sac à emporter : le client scanne en attendant sa commande.",
  "Au briefing, montre le classement de l'équipe en salle : qui a fait inscrire le plus de clients ?",
  "Un client hésite ? « C'est gratuit, ça prend 20 secondes, et votre premier ticket vous offre un cadeau. »",
];

/** Un geste par jour, le même toute la journée — déterministe, sans stockage. */
export function tipOfTheDay(today: string): string {
  const dayNumber = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000);
  return COUNTER_TIPS[((dayNumber % COUNTER_TIPS.length) + COUNTER_TIPS.length) % COUNTER_TIPS.length];
}

// ── Assemblage de l'accueil ─────────────────────────────────────────────────

export type SimpleHomeRaw = {
  base: string;
  today: string;
  /** Tickets reçus (validés ou en attente) par jour belge — 45 jours suffisent. */
  receivedByDay: DayCounts;
  validatedTotal: number;
  validatedWindow: number;
  validatedWeekAgo: number;
  membersTotal: number;
  membersWeekAgo: number;
  hasLogo: boolean;
  canManage: boolean;
  catalogItemsWithCost: number;
  landings14d: number;
  /** null : migration des codes salle absente (ADR 0053) — la carte se tait. */
  staff: { label: string; signups30d: number; isActive: boolean }[] | null;
  todo: { flagged: number; pending: number; claims: number; catalogGaps: number };
  month: { revenue: number; rewardsCost: number };
  budgetPct: number;
};

export type TodoItem = { key: string; title: string; hint: string; href: string; count: number; tone: "danger" | "warn" };

export type NextStep =
  | { kind: "checklist"; item: ChecklistItem }
  | { kind: "staff"; href: string }
  | { kind: "growth"; value: number; target: number; eta: number | null; tip: string }
  | { kind: "ideas"; href: string };

export type SimpleHomeView = {
  stage: Stage;
  stages: ReturnType<typeof stageStates>;
  goal: {
    today: number;
    target: number;
    remaining: number;
    met: boolean;
    /** Jours à l'objectif sur les 7 derniers, aujourd'hui compris. */
    heldDays: number;
    /** Palier suivant, atteint en tenant l'objectif GOAL_HELD_DAYS jours sur 7. */
    nextLevel: number | null;
    week: DayCell[];
    fortnight: DayCell[];
  };
  checklist: { items: ChecklistItem[]; done: number; total: number };
  next: NextStep;
  todo: TodoItem[];
  month: MonthView | null;
  milestone: MilestoneView | null;
  staffTop: { label: string; signups30d: number }[];
  hasStaffCodes: boolean;
  budgetPct: number;
};

export function buildSimpleHomeView(raw: SimpleHomeRaw): SimpleHomeView {
  const stage = stageOf(raw);
  const counts = raw.receivedByDay;
  const todayCount = countOn(counts, raw.today);
  const target = goalForDay(counts, raw.today);
  const week = recentDays(counts, raw.today, target, 7);

  const activeStaff = (raw.staff ?? []).filter((s) => s.isActive);
  const items = launchChecklist({
    base: raw.base,
    hasLogo: raw.hasLogo,
    canManage: raw.canManage,
    catalogItemsWithCost: raw.catalogItemsWithCost,
    landings14d: raw.landings14d,
    staffCodes: activeStaff.length,
    validatedTotal: raw.validatedTotal,
    budgetPct: raw.budgetPct,
  });

  let next: NextStep;
  if (stage === "lancer") {
    next = { kind: "checklist", item: items.find((it) => !it.done) ?? items[items.length - 1] };
  } else if (stage === "rythme") {
    // Le levier n° 1 constaté à Kraainem (ADR 0053) passe avant tout conseil :
    // sans QR nominatif, l'équipe en salle n'a ni outil ni mesure.
    if (raw.staff !== null && activeStaff.length === 0) {
      next = { kind: "staff", href: `${raw.base}/qr#equipe` };
    } else {
      const remaining = Math.max(0, GROWTH_TARGET - raw.validatedWindow);
      next = {
        kind: "growth",
        value: Math.min(raw.validatedWindow, GROWTH_TARGET),
        target: GROWTH_TARGET,
        eta: daysToReach(remaining, pacePerDay(counts, raw.today)),
        tip: tipOfTheDay(raw.today),
      };
    }
  } else {
    next = { kind: "ideas", href: `${raw.base}/insights` };
  }

  const todo: TodoItem[] = [];
  const t = raw.todo;
  if (t.flagged > 0) {
    todo.push({
      key: "flagged",
      title: `${t.flagged} ticket${t.flagged > 1 ? "s" : ""} à vérifier`,
      hint: "Montant inhabituel ou ticket peut-être déjà envoyé",
      href: `${raw.base}/orders?filter=flagged`,
      count: t.flagged,
      tone: "warn",
    });
  }
  const plainPending = Math.max(0, t.pending - t.flagged);
  if (plainPending > 0) {
    todo.push({
      key: "pending",
      title: `${plainPending} ticket${plainPending > 1 ? "s" : ""} en attente`,
      hint: "Un coup d'œil à la photo, puis valider ou refuser",
      href: `${raw.base}/orders?filter=pending`,
      count: plainPending,
      tone: "warn",
    });
  }
  if (t.claims > 0) {
    todo.push({
      key: "claims",
      title: `${t.claims} action${t.claims > 1 ? "s" : ""} client en attente`,
      hint: "Avis Google, abonnements — validées d'office après 4 h si tu ne les refuses pas",
      href: `${raw.base}/micro-rewards`,
      count: t.claims,
      tone: "warn",
    });
  }
  if (t.catalogGaps > 0) {
    todo.push({
      key: "catalog",
      title: `${t.catalogGaps} article${t.catalogGaps > 1 ? "s" : ""} de tes tickets à ajouter au menu`,
      hint: "Nom et prix déjà remplis — il ne manque que le prix de revient",
      href: `${raw.base}/menu#rattacher`,
      count: t.catalogGaps,
      tone: "warn",
    });
  }

  const milestone = pickMilestone(
    stage === "lancer"
      ? [milestoneView("members", raw.membersTotal, raw.membersWeekAgo), milestoneView("tickets", raw.validatedTotal, raw.validatedWeekAgo)]
      : [milestoneView("tickets", raw.validatedTotal, raw.validatedWeekAgo), milestoneView("members", raw.membersTotal, raw.membersWeekAgo)]
  );

  return {
    stage,
    stages: stageStates(stage),
    goal: {
      today: todayCount,
      target,
      remaining: Math.max(0, target - todayCount),
      met: todayCount >= target,
      heldDays: week.filter((d) => d.met).length,
      nextLevel: nextGoalLevel(target),
      week,
      fortnight: recentDays(counts, raw.today, target, 14),
    },
    checklist: { items, done: items.filter((it) => it.done).length, total: items.length },
    next,
    todo,
    month: monthView(raw.month.revenue, raw.month.rewardsCost),
    milestone,
    staffTop: activeStaff
      .filter((s) => s.signups30d > 0)
      .sort((a, b) => b.signups30d - a.signups30d)
      .slice(0, 3)
      .map(({ label, signups30d }) => ({ label, signups30d })),
    hasStaffCodes: activeStaff.length > 0,
    budgetPct: raw.budgetPct,
  };
}
