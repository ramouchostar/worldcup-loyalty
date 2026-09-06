// ADR 0033 §3 — vocabulaire et arithmétique du backlog plateforme.
//
// Module PUR, sans accès base : il est importé par le tableau de bord côté
// client (app/platform/backlog/BacklogBoard.tsx). `lib/backlog.ts` — qui, lui,
// ouvre un client service-role — ne doit jamais entrer dans un bundle client
// (il tire `next/headers` par transitivité). D'où la séparation modèle / accès.
//
// La priorité n'est pas saisie, elle est CALCULÉE (impact ÷ effort). Saisir
// « P1 » ne force aucune comparaison et dérive en trois semaines ; noter un
// impact et un effort oblige à situer chaque item par rapport aux autres.

export const BACKLOG_STATUSES = ["idee", "a_faire", "en_cours", "bloque", "fait", "abandonne"] as const;
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

export const BACKLOG_AREAS = ["produit", "tech", "vente", "marketing", "ops", "legal"] as const;
export type BacklogArea = (typeof BACKLOG_AREAS)[number];

// Colonnes vivantes vs archivées — la vue par défaut du tableau.
export const OPEN_STATUSES: BacklogStatus[] = ["idee", "a_faire", "en_cours", "bloque"];
export const CLOSED_STATUSES: BacklogStatus[] = ["fait", "abandonne"];

export const STATUS_LABEL: Record<BacklogStatus, string> = {
  idee: "Idée",
  a_faire: "À faire",
  en_cours: "En cours",
  bloque: "Bloqué",
  fait: "Fait",
  abandonne: "Abandonné",
};

export const AREA_LABEL: Record<BacklogArea, string> = {
  produit: "Produit",
  tech: "Tech",
  vente: "Vente",
  marketing: "Marketing",
  ops: "Ops",
  legal: "Légal",
};

// Les deux associés de la plateforme. Liste CLOSE et nominative, pas un
// annuaire de comptes : le backlog se répartit entre nous deux, et `owners`
// reste un tableau de TEXT libre en base — un ancien nom saisi à la main
// continue de s'afficher et de se filtrer, il n'est simplement plus proposé.
export const BACKLOG_PEOPLE = ["Mehdi", "Omar"] as const;
export type BacklogPerson = (typeof BACKLOG_PEOPLE)[number];

// Couleur d'identité par personne. Fixes (jamais `brand-*`, qui change selon
// la charte de l'établissement affiché) et choisies pour que le blanc passe
// le contraste 4,5:1 dessus — les initiales sont du texte, pas une décoration.
const PERSON_COLORS: Record<string, string> = {
  Mehdi: "#3F6C8F", // bleu ardoise — contraste 5,6:1
  Omar: "#677A33", // moss foncé — contraste 4,8:1
};
const UNKNOWN_PERSON_COLOR = "#5C5C56";

export function personColor(name: string): string {
  return PERSON_COLORS[name] ?? UNKNOWN_PERSON_COLOR;
}

/** Deux lettres : « Mehdi » → « ME », « Omar » → « OM ». */
export function personInitials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Trace d'une validation individuelle : quand, et par quel compte le clic a
 * été fait. `by` sert d'audit (on est deux à partager la console, rien
 * n'empêche de valider à la place de l'autre) — l'écran, lui, montre le
 * prénom attribué, pas l'uuid.
 */
export type BacklogValidation = { at: string; by: string | null };

export type BacklogItem = {
  id: string;
  title: string;
  details: string | null;
  area: BacklogArea;
  status: BacklogStatus;
  impact: number;
  effort: number;
  // Co-attribution : une même action peut revenir à plusieurs personnes qui
  // la font CHACUNE de son côté (tester le parcours sur iPhone ET Android,
  // relancer chacun ses restos…). Une seule personne reste le cas courant,
  // c'est juste un tableau à un élément.
  owners: string[];
  // Validations par prénom attribué. Une clé absente = part non validée ;
  // les clés qui ne sont plus dans `owners` sont ignorées partout (on ne les
  // efface pas : si la personne est ré-attribuée, sa validation revient).
  validations: Record<string, BacklogValidation>;
  restaurant_id: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
};

/**
 * Liste d'attribution propre : trim, dédoublonnage, ordre stable (les
 * associés d'abord, puis les noms hérités par ordre alphabétique). Sert
 * autant à la lecture (colonne `owners` en base, ou `owner` legacy) qu'à
 * l'écriture (formulaire, menu d'attribution).
 */
export function normalizeOwners(list: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const raw of list) {
    const name = (raw ?? "").trim();
    if (name) seen.add(name);
  }
  const known = BACKLOG_PEOPLE.filter((p) => seen.has(p));
  const others = [...seen].filter((n) => !BACKLOG_PEOPLE.includes(n as BacklogPerson)).sort();
  return [...known, ...others];
}

/** Personnes attribuées qui ont validé leur part (les validations orphelines ne comptent pas). */
export function validatedOwners(item: Pick<BacklogItem, "owners" | "validations">): string[] {
  return item.owners.filter((o) => !!item.validations[o]);
}

/** Personnes attribuées dont on attend encore le « Fait ». */
export function pendingOwners(item: Pick<BacklogItem, "owners" | "validations">): string[] {
  return item.owners.filter((o) => !item.validations[o]);
}

/**
 * Statut recalculé après un changement d'attribution ou de validation.
 *
 * Règle unique, écrite ici une seule fois : une action co-attribuée est
 * « faite » quand TOUTES les personnes attribuées ont validé leur part — ni
 * avant, ni autrement. Conséquences assumées :
 *   - retirer sa validation (ou ajouter quelqu'un à une action déjà close)
 *     rouvre l'action en « en cours » : le tableau ne peut pas afficher
 *     « fait » alors qu'il reste une part à faire ;
 *   - sans personne attribuée, le statut reste piloté à la main (bouton
 *     « ✓ Fait » et sélecteur d'état) — rien à co-valider ;
 *   - « abandonné » n'est jamais ressuscité par un clic de validation : on
 *     ne rouvre pas une action qu'on a décidé d'enterrer.
 */
export function statusAfterValidation(
  current: BacklogStatus,
  owners: string[],
  validations: Record<string, BacklogValidation>
): BacklogStatus {
  if (owners.length === 0 || current === "abandonne") return current;
  const everyone = owners.every((o) => !!validations[o]);
  if (everyone) return "fait";
  return current === "fait" ? "en_cours" : current;
}

/**
 * Vrai si l'erreur Supabase vient de l'absence des colonnes de co-attribution
 * (migration 20260906-2225 pas encore appliquée). Même repli que
 * `isMissingSchoolCalendarsColumn` (lib/school-calendar.ts) : PostgREST
 * répond 42703 en LECTURE mais PGRST204 « … in the schema cache » en
 * ÉCRITURE — il faut reconnaître les deux, sinon le repli ne se déclenche
 * que d'un côté et les formulaires cassent le temps d'appliquer la migration.
 */
export function isMissingCoAssignationColumn(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message ?? "";
  return /owners|validations/.test(message) && /column|schema cache/i.test(message);
}

/** Rentabilité d'un item : impact ÷ effort, sur [0,2 ; 5]. Plus haut = à faire d'abord. */
export function priorityScore(item: Pick<BacklogItem, "impact" | "effort">): number {
  return item.impact / Math.max(1, item.effort);
}

/**
 * Étiquette de décision, dérivée du couple (impact, effort) — pas du score seul :
 * « gros chantier » (fort impact, gros effort) et « à trancher » (faible impact,
 * faible effort) partagent un score de 1 mais n'appellent pas la même décision.
 */
export function priorityLabel(item: Pick<BacklogItem, "impact" | "effort">): string {
  const strongImpact = item.impact >= 4;
  const lowEffort = item.effort <= 2;
  if (strongImpact && lowEffort) return "Coup facile";
  if (strongImpact) return "Gros chantier";
  if (lowEffort) return "Bouche-trou";
  return "À trancher";
}

/** Ordre de travail : score décroissant, puis impact, puis les plus anciens d'abord. */
export function sortByPriority(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort(
    (a, b) =>
      priorityScore(b) - priorityScore(a) ||
      b.impact - a.impact ||
      a.created_at.localeCompare(b.created_at)
  );
}

// Les échelles 1–5 sont contraintes en base (CHECK m56) : on borne côté app
// pour renvoyer une erreur de formulaire lisible plutôt qu'une 23514 Postgres.
export function clampScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value as number)));
}
