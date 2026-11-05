import { REFUSAL_REASON_LABELS, type IdeaStatus, type RefusalReason } from "./types";

// L'affichage des idées (Brigade 03) — pur, importable côté client, testé dans
// ideas-view.test.ts. Aucun euro n'est formaté ici : les montants sont déjà
// écrits par l'assistant dans les trois lignes de la carte (côté gérant).

const brusselsDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

/** « Ce soir », « Demain », ou « Jusqu'au 11 nov. ». */
export function deadlineLabel(decideByIso: string, nowMs: number): string {
  const by = Date.parse(decideByIso);
  const day = brusselsDay(by);
  if (day === brusselsDay(nowMs)) return "Ce soir";
  if (day === brusselsDay(nowMs + 86_400_000)) return "Demain";
  const d = new Date(by).toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });
  return `Jusqu'au ${d}`;
}

/** Le sous-titre de l'écran. */
export function ideasSummary(toDecide: number): string {
  if (toDecide === 0) return "Tout est décidé pour aujourd'hui.";
  return `${toDecide} ${toDecide > 1 ? "idées" : "idée"} · environ 5 minutes`;
}

/** Le résultat d'une idée passée, en deux ou trois mots (« Décidé cette semaine »). */
export function outcomeLabel(status: IdeaStatus, refusal: RefusalReason | null): string {
  if (status === "executee") return "Oui";
  if (status === "refusee") return refusal ? `Non · ${REFUSAL_REASON_LABELS[refusal].toLowerCase()}` : "Non";
  if (status === "expiree") return "Expirée";
  return "";
}
