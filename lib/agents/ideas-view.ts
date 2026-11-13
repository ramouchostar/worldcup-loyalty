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

/** Une réponse de Louis telle que la carte la montre : l'avis (extrait) et le brouillon à relire (Brigade 13). */
export type ReplyCard = { ref: string; rating: number; when: string; excerpt: string; text: string; careful: boolean };

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);

/** « Aujourd'hui », « hier », « il y a 4 jours », puis la date au-delà de deux semaines. */
export function reviewWhen(day: string, nowMs: number): string {
  const n = dayNumber(brusselsDay(nowMs)) - dayNumber(day);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return "hier";
  if (n < 14) return `il y a ${n} jours`;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" });
}

/** Les réponses d'une idée de Louis, lues dans son contenu enregistré ; une idée qui n'en a pas rend une liste vide. */
export function replyCards(content: unknown, nowMs: number): ReplyCard[] {
  const replies = (content as { replies?: unknown } | null)?.replies;
  if (!Array.isArray(replies)) return [];
  const out: ReplyCard[] = [];
  for (const r of replies as Record<string, unknown>[]) {
    if (typeof r?.ref !== "string" || typeof r.text !== "string" || typeof r.date !== "string") continue;
    out.push({
      ref: r.ref,
      rating: typeof r.rating === "number" ? r.rating : 0,
      when: reviewWhen(r.date, nowMs),
      excerpt: typeof r.excerpt === "string" ? r.excerpt : "",
      text: r.text,
      careful: r.careful === true,
    });
  }
  return out;
}

/** Ce que l'équipe publie pour une idée de Louis : le texte que le gérant a validé, avec l'avis auquel il répond. */
export type ApprovedForTeam = { ref: string; rating: number; date: string; excerpt: string; text: string; edited: boolean };

/**
 * Les réponses validées par le gérant, jointes à leur avis (extrait, note, date) — l'équipe retrouve l'avis par sa date
 * et son texte, car aucune identité ni aucun identifiant d'avis n'est conservé (ADR 0025). Vide tant que le gérant n'a pas dit oui.
 */
export function approvedForTeam(content: unknown): ApprovedForTeam[] {
  const c = content as { replies?: unknown; approvedReplies?: unknown } | null;
  if (!Array.isArray(c?.approvedReplies) || !Array.isArray(c?.replies)) return [];
  const byRef = new Map<string, Record<string, unknown>>();
  for (const r of c.replies as Record<string, unknown>[]) if (typeof r?.ref === "string") byRef.set(r.ref, r);
  const out: ApprovedForTeam[] = [];
  for (const a of c.approvedReplies as Record<string, unknown>[]) {
    if (typeof a?.ref !== "string" || typeof a.text !== "string") continue;
    const original = byRef.get(a.ref);
    if (!original) continue;
    out.push({
      ref: a.ref,
      rating: typeof original.rating === "number" ? original.rating : 0,
      date: typeof original.date === "string" ? original.date : "",
      excerpt: typeof original.excerpt === "string" ? original.excerpt : "",
      text: a.text,
      edited: a.edited === true,
    });
  }
  return out;
}

/** Le texte du bouton « Oui » d'une idée qui porte des réponses : il dit combien seront publiées. */
export function repliesYesLabel(kept: number): string {
  if (kept <= 0) return "Aucune réponse à publier";
  return kept === 1 ? "Oui, publier cette réponse" : `Oui, publier ${kept} réponses`;
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
