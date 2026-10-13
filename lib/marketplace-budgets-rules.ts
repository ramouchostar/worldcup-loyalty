// ============================================================
// Réserver un prestataire (ADR 0084 §3 règles 3 et 4) — les budgets planchers et l'ambition réaliste.
//
// Règle 3 : un budget plancher par type de prestation (« on ne descend pas sous X »). Règle 4 : le brief demande
// la taille du projet ; un budget très inférieur à l'ambition déclarée est SIGNALÉ avant l'envoi (jamais refusé).
// Le code de validation (lib/mission-brief.ts) lit déjà ces deux valeurs dans `brief_templates` ; ce fichier est
// ce qui permet à la plateforme de les RÉGLER, et l'assistant du restaurateur de les AFFICHER.
// Fichier PUR (aucun accès à la base) : il est importé aussi par l'assistant du restaurateur, dans le navigateur. La
// lecture/écriture est dans lib/marketplace-budgets.ts.
// ============================================================

import type { BriefTemplate } from "./mission-brief";
import { centsToEurosInput, eurosToCents } from "./mission-view";

export const MAX_BUDGET_CENTS = 10_000_000; // 100 000 €, comme le brief

export type BudgetInput = { floorEuros: string; ambitionEuros: Record<string, string> };
export type BudgetIssue = { field: "floor" | string; code: "invalid" | "too_high" | "below_floor" };
export type BudgetVerdict = { ok: true; floorCents: number | null; ambitionCents: Record<string, number> } | { ok: false; issues: BudgetIssue[] };

/** Vide = « pas de seuil ». Un montant illisible, nul, négatif ou énorme est refusé avec son champ. */
function parseOne(raw: string, field: string, issues: BudgetIssue[]): number | null {
  const t = String(raw ?? "").trim();
  if (t === "") return null;
  const cents = eurosToCents(t);
  if (cents === null) {
    issues.push({ field, code: "invalid" });
    return null;
  }
  if (cents > MAX_BUDGET_CENTS) {
    issues.push({ field, code: "too_high" });
    return null;
  }
  return cents;
}

export function validateBudgets(input: BudgetInput, formats: readonly string[]): BudgetVerdict {
  const issues: BudgetIssue[] = [];
  const floor = parseOne(input.floorEuros, "floor", issues);
  const ambition: Record<string, number> = {};
  for (const f of formats) {
    const c = parseOne(input.ambitionEuros[f] ?? "", f, issues);
    if (c === null) continue;
    // Un seuil d'ambition sous le plancher ne signalerait jamais rien : le plancher refuse déjà.
    if (floor !== null && c < floor) issues.push({ field: f, code: "below_floor" });
    else ambition[f] = c;
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, floorCents: floor, ambitionCents: ambition };
}

export const BUDGET_ISSUE_TEXT: Record<BudgetIssue["code"], string> = {
  invalid: "Écris un montant en euros, par exemple 400. Laisse vide pour « pas de seuil ».",
  too_high: "Plus de 100 000 € : c'est sûrement une erreur de saisie.",
  below_floor: "Ce seuil est sous le plancher : il ne signalerait jamais rien. Mets-le au-dessus, ou vide.",
};

/** Les formats d'un métier, lus dans le modèle de questions (jamais écrits deux fois). */
export function formatsOf(template: BriefTemplate): string[] {
  return [...(template.questions.find((q) => q.key === "format")?.options ?? [])];
}

export function budgetInputFrom(floorCents: number | null | undefined, ambition: Record<string, number> | null | undefined, formats: readonly string[]): BudgetInput {
  return { floorEuros: centsToEurosInput(floorCents ?? null), ambitionEuros: Object.fromEntries(formats.map((f) => [f, centsToEurosInput(ambition?.[f] ?? null)])) };
}

// ── Ce que lit le restaurateur ───────────────────────────────

/** La phrase affichée sous le budget quand il est sous le plancher (le refus est dit AVANT, pas seulement au clic). */
export function floorHint(floorCents: number | undefined, euros: (c: number) => string): string | null {
  return floorCents ? `Budget minimum pour ce service : ${euros(floorCents)}.` : null;
}

/** L'avertissement (jamais un refus) quand le projet décrit coûte plus que le budget prévu. */
export function ambitionHint(format: string, euros: (c: number) => string, needCents: number): string {
  return `Un projet « ${format} » demande en général au moins ${euros(needCents)}. Tu peux envoyer ton brief tel quel : le prestataire te dira ce qui est possible, ou te proposera plus petit.`;
}

