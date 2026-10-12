// ============================================================
// Réserver un prestataire (ADR 0084) — du brouillon à l'envoi, sans base.
//
// Trois décisions pures, testées à part de Supabase :
//  - ce qu'on accepte d'enregistrer d'un brouillon (rien d'autre que les
//    questions du modèle, chaque réponse ramenée à sa forme) ;
//  - quel prestataire reçoit le brief ;
//  - le brief peut-il partir ? (état, complétude, prestataire disponible).
//
// Les écritures (lib/missions.ts) n'appliquent que ce que ces fonctions ont
// décidé : un seul endroit où se lit la règle.
// ============================================================

import { validateBrief, type BriefAnswers, type BriefIssue, type BriefQuestion, type BriefTemplate } from "./mission-brief";
import type { Metier } from "./mission-money";
import { canTransition, type MissionStatus } from "./mission-states";

const MAX_TEXT = 2_000;
const MAX_ITEM = 200;
const MAX_ITEMS = 30;
const MAX_BUDGET_CENTS = 10_000_000; // 100 000 €

const str = (v: unknown, max: number): string | null => (typeof v === "string" ? v.trim().slice(0, max) : null);

function strings(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .map((x) => str(x, MAX_ITEM))
    .filter((x): x is string => !!x)
    .slice(0, MAX_ITEMS);
}

/** Ramène une réponse à la forme de sa question ; `undefined` = on ne l'enregistre pas. */
function coerce(q: BriefQuestion, v: unknown): BriefAnswers[string] | undefined {
  switch (q.kind) {
    case "text":
      return str(v, MAX_TEXT) ?? undefined;
    case "choice":
    case "date":
      return str(v, MAX_ITEM) ?? undefined;
    case "multi":
    case "list":
      return strings(v) ?? undefined;
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
      return Math.min(MAX_BUDGET_CENTS, Math.round(v));
    }
    case "flag":
      return typeof v === "boolean" ? v : undefined;
    case "contact": {
      if (!v || typeof v !== "object") return undefined;
      const o = v as Record<string, unknown>;
      return { name: str(o.name, MAX_ITEM) ?? "", phone: str(o.phone, 30) ?? "" };
    }
    case "files":
      return undefined; // les pièces jointes passent par leur propre envoi
  }
}

/**
 * Les réponses qu'on accepte d'enregistrer : seulement les questions du modèle (de la phase
 * demandée), chacune ramenée à sa forme. Toute autre clé est jetée — un brouillon n'est pas un
 * fourre-tout JSON. Une réponse vidée (« ») efface l'ancienne.
 */
export function sanitizeAnswers(raw: unknown, template: BriefTemplate, phase: "brief" | "tournage" = "brief"): BriefAnswers {
  const out: BriefAnswers = {};
  if (!raw || typeof raw !== "object") return out;
  const input = raw as Record<string, unknown>;
  for (const q of template.questions) {
    if ((q.phase ?? "brief") !== phase || !(q.key in input)) continue;
    const v = coerce(q, input[q.key]);
    out[q.key] = v === undefined ? null : v;
  }
  return out;
}

/** Réponses déjà enregistrées + celles qui arrivent ; `null` efface. */
export function mergeAnswers(saved: BriefAnswers, incoming: BriefAnswers): BriefAnswers {
  const merged: BriefAnswers = { ...saved };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  return merged;
}

export type ProviderCandidate = {
  id: string;
  status: string;
  metiers: readonly string[];
  visibility_reduced: boolean;
  created_at: string;
};

/**
 * Le prestataire qui reçoit le brief : actif, du bon métier ; ceux dont la visibilité est réduite
 * (sanction, ADR 0084 §4) passent après les autres ; à égalité, le plus ancien.
 * Au départ il n'y en a qu'un par métier (pas d'appel d'offres).
 */
export function pickProvider(candidates: readonly ProviderCandidate[], metier: Metier): string | null {
  const ok = candidates
    .filter((c) => c.status === "active" && c.metiers.includes(metier))
    .sort((a, b) => Number(a.visibility_reduced) - Number(b.visibility_reduced) || a.created_at.localeCompare(b.created_at));
  return ok[0]?.id ?? null;
}

export type SendPlan =
  | { ok: true; providerId: string }
  | { ok: false; reason: "not_a_draft" | "invalid_brief" | "no_provider"; issues: BriefIssue[] };

/** Le brief peut-il être verrouillé et envoyé ? Chaque refus a sa raison nommée (la trace). */
export function planSend(input: {
  status: MissionStatus;
  metier: Metier;
  answers: BriefAnswers;
  template: BriefTemplate;
  today: string;
  providers: readonly ProviderCandidate[];
}): SendPlan {
  if (!canTransition(input.status, "envoye", "restaurant").ok) return { ok: false, reason: "not_a_draft", issues: [] };
  const verdict = validateBrief(input.answers, input.template, input.today, "brief");
  if (!verdict.ok) return { ok: false, reason: "invalid_brief", issues: verdict.issues };
  const providerId = pickProvider(input.providers, input.metier);
  if (!providerId) return { ok: false, reason: "no_provider", issues: [] };
  return { ok: true, providerId };
}
