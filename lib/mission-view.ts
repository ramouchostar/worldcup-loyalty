// ============================================================
// Réserver un prestataire (ADR 0084) — ce que le restaurateur lit d'une mission.
//
// Libellés en mots de restaurateur, frise d'avancement et résumé du brief.
// Fonctions PURES, sans accès aux données : l'écran et les tests partagent
// le même vocabulaire (un état n'a qu'un nom à l'écran).
//
// Surface restaurateur / prestataire / plateforme : les euros sont permis
// (B2B), jamais côté membre (ADR 0007).
// ============================================================

import { formatEuros, type Metier } from "./mission-money";
import type { BriefAnswers, BriefIssueCode, BriefQuestion, BriefTemplate } from "./mission-brief";
import type { MissionStatus } from "./mission-states";

export const METIER_LABELS: Record<Metier, string> = {
  video: "Vidéo",
  photo: "Photo",
  design: "Design",
  impression: "Impression",
};

export type StatusTone = "neutral" | "good" | "warn" | "danger";

/** Le nom d'un état à l'écran du restaurateur. */
export const STATUS_VIEW: Record<MissionStatus, { label: string; tone: StatusTone }> = {
  brief: { label: "Brouillon", tone: "neutral" },
  envoye: { label: "Envoyé", tone: "neutral" },
  devis: { label: "Devis reçu", tone: "good" },
  accepte: { label: "Devis accepté", tone: "good" },
  date_bloquee: { label: "Date réservée", tone: "good" },
  production: { label: "En cours", tone: "neutral" },
  livre: { label: "Livré", tone: "good" },
  retouche: { label: "Retouche demandée", tone: "warn" },
  valide: { label: "Validé", tone: "good" },
  verse: { label: "Terminé", tone: "neutral" },
  annule: { label: "Annulé", tone: "danger" },
  litige: { label: "En médiation", tone: "warn" },
  suspendu: { label: "Paiement à régulariser", tone: "warn" },
};

// ── La frise ─────────────────────────────────────────────────

export const TIMELINE_STEPS = [
  { key: "envoye", label: "Brief envoyé" },
  { key: "devis", label: "Devis" },
  { key: "date", label: "Date réservée" },
  { key: "production", label: "Tournage et montage" },
  { key: "livre", label: "Livraison" },
  { key: "valide", label: "Validé" },
] as const;

/** Étape courante (index dans TIMELINE_STEPS) de chaque état ; -1 = pas encore commencé. */
const STEP_OF: Partial<Record<MissionStatus, number>> = {
  brief: -1,
  envoye: 0,
  devis: 1,
  accepte: 2,
  date_bloquee: 2,
  suspendu: 2,
  production: 3,
  livre: 4,
  retouche: 4,
  valide: 5,
  verse: 5,
};

export type StepState = "done" | "current" | "todo";

export function timeline(status: MissionStatus): { steps: { key: string; label: string; state: StepState }[]; stopped: boolean } {
  // Annulée ou en médiation : la frise s'arrête, l'écran le dit au lieu de mentir sur l'avancement.
  const stopped = status === "annule" || status === "litige";
  const cur = STEP_OF[status] ?? -1;
  const finished = status === "verse";
  return {
    stopped,
    steps: TIMELINE_STEPS.map((s, i) => ({
      key: s.key,
      label: s.label,
      state: stopped ? (i < cur ? "done" : "todo") : finished || i < cur ? "done" : i === cur ? "current" : "todo",
    })),
  };
}

// ── Le résumé du brief ───────────────────────────────────────

function renderValue(q: BriefQuestion, v: BriefAnswers[string]): string | null {
  if (v === null || v === undefined) return null;
  if (q.kind === "files") return null; // les pièces jointes ont leur propre zone
  if (q.kind === "flag") return v === true ? "Oui" : null;
  if (q.key === "budget_cents" && typeof v === "number") return formatEuros(v);
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (typeof v === "object") return [v.name, v.phone].filter(Boolean).join(" · ") || null;
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}

/** Les réponses du brief sous forme de lignes « question → réponse », dans l'ordre du questionnaire. */
export function briefRows(answers: BriefAnswers, template: BriefTemplate, phase: "brief" | "tournage" = "brief"): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const q of template.questions) {
    if ((q.phase ?? "brief") !== phase) continue;
    const value = renderValue(q, answers[q.key]);
    if (value) rows.push({ label: q.label, value });
  }
  return rows;
}

// ── Les euros que le restaurateur tape ───────────────────────

/** « 800 », « 1 200 », « 1200,50 » → centimes ; tout le reste → null. */
export function eurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function centsToEurosInput(cents: number | null | undefined): string {
  if (typeof cents !== "number") return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

// ── Ce qui manque, en mots de restaurateur ───────────────────

const ISSUE_MESSAGES: Record<BriefIssueCode, string> = {
  missing: "À remplir",
  too_short: "Un peu plus développé, s'il te plaît",
  too_soon: "Il faut au moins 7 jours pour prévenir ton équipe",
  past: "Cette date est passée",
  bad_option: "Choisis une des propositions",
  bad_phone: "Numéro de téléphone incomplet",
  not_attested: "Coche cette case pour continuer",
  budget_below_floor: "Ce budget est trop bas pour ce service",
};

export function issueMessage(code: BriefIssueCode): string {
  return ISSUE_MESSAGES[code] ?? "À vérifier";
}
