// ADR 0102 (suite) — la caisse déclarée par le restaurateur à l'inscription
// (étape « tickets »). Réponse libre, gardée telle quelle : on regroupe à la
// lecture, jamais en réécrivant ce qu'il a tapé.

export const POS_QUESTION = "Quelle caisse utilisez-vous ?";
export const POS_UNKNOWN = "Je ne sais pas";

/** Suggestions de saisie seulement : aucune n'est une promesse de connexion. */
export const POS_SUGGESTIONS = ["Lightspeed", "Vectron", "SumUp", "Square", "Zettle", "Zelty", "Restomax", "Tiller"] as const;

export const POS_MAX_LENGTH = 60;

/** Valeur à enregistrer : texte nettoyé, « Je ne sais pas », ou null (rien répondu). */
export function posSystemAnswer(raw: FormDataEntryValue | string | null | undefined, unknown: boolean): string | null {
  if (unknown) return POS_UNKNOWN;
  const s = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, POS_MAX_LENGTH);
  return s || null;
}

/**
 * Regroupe les réponses du réseau (« lightspeed » = « Lightspeed »), la plus
 * fréquente d'abord. Les non-réponses (null) sont comptées à part.
 */
export function groupPosAnswers(answers: (string | null)[]): { groups: { label: string; count: number }[]; unanswered: number } {
  const byKey = new Map<string, { label: string; count: number }>();
  let unanswered = 0;
  for (const a of answers) {
    const s = (a ?? "").trim();
    if (!s) {
      unanswered += 1;
      continue;
    }
    const key = s.toLowerCase();
    const g = byKey.get(key) ?? { label: s, count: 0 };
    g.count += 1;
    byKey.set(key, g);
  }
  return { groups: [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr")), unanswered };
}
