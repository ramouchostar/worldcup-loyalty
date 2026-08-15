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

export type BacklogItem = {
  id: string;
  title: string;
  details: string | null;
  area: BacklogArea;
  status: BacklogStatus;
  impact: number;
  effort: number;
  owner: string | null;
  restaurant_id: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
};

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
