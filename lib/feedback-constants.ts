import type { FeedbackDimension } from "@/types";

// ADR 0023 — constantes du canal qualité SANS dépendance serveur (pas de
// createAdminClient) → importables aussi bien côté serveur (lib/feedback.ts)
// que côté client (formulaire membre, écran resto).

// Nombre de commandes validées avant d'inviter le membre à s'exprimer.
export const FEEDBACK_ELIGIBILITY_MIN = 3;

// Axes opérationnels d'un signalement — cochés, jamais notés 1-5.
export const FEEDBACK_DIMENSIONS: FeedbackDimension[] = ["accuracy", "wait", "quality", "welcome"];

export const DIMENSION_LABELS: Record<FeedbackDimension, string> = {
  accuracy: "Précision de la commande",
  wait: "Temps d'attente",
  quality: "Qualité / température",
  welcome: "Accueil",
};
