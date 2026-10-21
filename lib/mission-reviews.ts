// ============================================================
// Réserver un prestataire (ADR 0084 §5 decies) — les avis, après une mission validée.
//
// Deux sens, deux sorts :
//   restaurant → prestataire : une note de 1 à 5 et un commentaire facultatif. La MOYENNE s'affiche sur le profil du prestataire,
//                              à partir de trois avis (avant, rien : un seul avis n'est pas une moyenne). Les commentaires
//                              s'affichent sans nom de restaurant.
//   prestataire → restaurant : une note privée, lue par la plateforme seule (le dossier de litige, la page des avis). Jamais
//                              montrée aux restaurateurs ni au restaurateur concerné : elle sert à repérer les clients difficiles.
// Un avis par mission et par sens, définitif (pas de modification : on ne réécrit pas après une dispute), masquable par la
// plateforme. Le commentaire ne porte ni numéro, ni e-mail, ni lien de messagerie (même règle que la messagerie).
// Fonctions PURES.
// ============================================================

import { maskContacts } from "./mission-messages";

export type ReviewDirection = "restaurant_to_provider" | "provider_to_restaurant";

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const COMMENT_MAX = 600;
export const COMMENT_MIN_IF_LOW = 15;
/** Moyenne affichée à partir de ce nombre d'avis visibles. */
export const MIN_REVIEWS_FOR_AVERAGE = 3;
/** Commentaires montrés sur le profil. */
export const COMMENTS_SHOWN = 3;

export const DIRECTION_LABEL: Record<ReviewDirection, string> = {
  restaurant_to_provider: "Le restaurateur a noté le prestataire",
  provider_to_restaurant: "Le prestataire a noté le restaurateur (privé)",
};

/** Un avis se donne quand le travail est terminé et accepté : validé, ou versé. Pas avant, pas après une annulation ou un litige ouvert. */
export function canReview(status: string): boolean {
  return status === "valide" || status === "verse";
}

export type ReviewInput = { rating: number; comment: string };
export type ReviewIssueCode = "rating" | "comment_too_long" | "comment_needed" | "contact_in_comment";
export type ReviewIssue = { code: ReviewIssueCode };

export function sanitizeReview(raw: unknown): ReviewInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rating = typeof o.rating === "number" ? o.rating : Number.NaN;
  // Un commentaire dépassant la limite reste visible (un caractère de trop) pour que la validation le refuse.
  const comment = typeof o.comment === "string" ? o.comment.replace(/\s+/g, " ").trim().slice(0, COMMENT_MAX + 1) : "";
  return { rating, comment };
}

export function validateReview(i: ReviewInput): { ok: boolean; issues: ReviewIssue[] } {
  const issues: ReviewIssue[] = [];
  if (!Number.isInteger(i.rating) || i.rating < RATING_MIN || i.rating > RATING_MAX) issues.push({ code: "rating" });
  if (i.comment.length > COMMENT_MAX) issues.push({ code: "comment_too_long" });
  // Une note basse sans explication ne sert à personne : le prestataire ne saurait pas quoi améliorer.
  else if (Number.isInteger(i.rating) && i.rating >= RATING_MIN && i.rating <= 2 && i.comment.length < COMMENT_MIN_IF_LOW) issues.push({ code: "comment_needed" });
  if (i.comment && maskContacts(i.comment).masked) issues.push({ code: "contact_in_comment" });
  return { ok: issues.length === 0, issues };
}

export const REVIEW_ISSUE_TEXT: Record<ReviewIssueCode, string> = {
  rating: "Choisis une note de 1 à 5.",
  comment_too_long: "Ton commentaire est trop long (600 caractères au plus).",
  comment_needed: "Pour une note de 1 ou 2, explique en une phrase ce qui n'a pas été (15 caractères au moins).",
  contact_in_comment: "Retire les numéros, e-mails et liens de messagerie : tout passe par la plateforme.",
};

export type ReviewVerdict = "ok" | "not_finished" | "already_reviewed";

export function judgeReview(status: string, alreadyDone: boolean): ReviewVerdict {
  if (!canReview(status)) return "not_finished";
  return alreadyDone ? "already_reviewed" : "ok";
}

export type PublicReview = { rating: number; comment: string; at: string };
export type ReviewSummary = { count: number; average: number | null; shownAverage: boolean; comments: PublicReview[] };

/** Ce que voit un restaurateur sur le profil : la moyenne seulement à partir de trois avis, les derniers commentaires sans nom. */
export function summarize(reviews: readonly PublicReview[]): ReviewSummary {
  const count = reviews.length;
  const average = count === 0 ? null : Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10;
  const comments = [...reviews]
    .filter((r) => r.comment.length > 0)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, COMMENTS_SHOWN);
  return { count, average, shownAverage: count >= MIN_REVIEWS_FOR_AVERAGE, comments };
}

/** Les invites affichées sur la page de la mission, par côté. */
export const REVIEW_PROMPT = {
  restaurant: { title: "Note ton prestataire", hint: "Ta note et ton commentaire aident les autres restaurateurs. Ils sont affichés sans ton nom, et ne se modifient pas." },
  provider: { title: "Note ce restaurateur", hint: "Ta note est privée : seul Boosteats la lit. Elle ne se modifie pas." },
} as const;
