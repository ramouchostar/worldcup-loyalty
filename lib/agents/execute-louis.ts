import { createAdminClient } from "../supabase";
import { LOUIS_REPLY_MAX_CHARS, LOUIS_REPLY_MIN_CHARS, type LouisReply } from "./louis";
import type { ProposalRow } from "./proposals";

// Le « Oui » de Louis (Brigade 13, ADR 0089 §5) : ce que le gérant a RELU et validé.
//
// La carte lui montre un brouillon par avis ; il peut le modifier ou écarter l'avis. Au « Oui », la carte renvoie les
// textes qu'il garde. Ce module (1) vérifie ce qui revient — rien de ce que le navigateur envoie ne dit sur quel avis
// ni avec quel texte on publie sans être recoupé avec l'idée enregistrée —, puis (2) l'inscrit dans l'idée AVANT la
// décision, pour que l'équipe qui publie lise exactement ce que le gérant a validé, pas le brouillon d'origine.
//
// Ce module ne publie rien : tant que l'accès à l'API Google n'existe pas (Brigade 12), l'équipe publie à la main
// depuis la fiche et le note « Fait » sur /platform/idees (geste « team »).

/** Une réponse validée : le texte que le gérant a gardé, et s'il l'a modifié. */
export type ApprovedReply = { ref: string; text: string; edited: boolean };

export type Approval = { ok: true; approved: ApprovedReply[] } | { ok: false; message: string };

/** Les caractères de contrôle n'ont rien à faire dans une réponse publique ; les retours à la ligne, si. */
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim();

/**
 * Recoupe ce que la carte renvoie avec l'idée enregistrée. Un avis qui n'est pas dans l'idée, un doublon, un texte
 * trop court ou trop long, ou aucune réponse gardée : refusé, avec une phrase que le gérant comprend.
 */
export function validateApproval(proposed: LouisReply[], sent: unknown): Approval {
  if (!Array.isArray(sent) || sent.length === 0) return { ok: false, message: "Garde au moins une réponse, ou dis non." };
  const byRef = new Map(proposed.map((r) => [r.ref, r]));
  const seen = new Set<string>();
  const approved: ApprovedReply[] = [];
  for (const item of sent as { ref?: unknown; text?: unknown }[]) {
    if (typeof item?.ref !== "string" || typeof item.text !== "string") return { ok: false, message: "Une réponse n'a pas pu être lue. Recharge la page." };
    const original = byRef.get(item.ref);
    if (!original) return { ok: false, message: "Ces réponses ne correspondent plus à l'idée. Recharge la page." };
    if (seen.has(item.ref)) return { ok: false, message: "Une réponse apparaît deux fois. Recharge la page." };
    seen.add(item.ref);
    const text = clean(item.text);
    if (text.length < LOUIS_REPLY_MIN_CHARS) return { ok: false, message: `Une réponse est trop courte (${LOUIS_REPLY_MIN_CHARS} caractères au moins). Écarte l'avis si tu ne veux pas y répondre.` };
    if (text.length > LOUIS_REPLY_MAX_CHARS) return { ok: false, message: `Une réponse est trop longue (${LOUIS_REPLY_MAX_CHARS} caractères au plus).` };
    approved.push({ ref: item.ref, text, edited: text !== original.text.trim() });
  }
  return { ok: true, approved };
}

/**
 * Inscrit les réponses validées dans l'idée (champ `approvedReplies`) et les avis écartés (`skippedRefs`), tant
 * qu'elle attend. Rend `null` si c'est fait, sinon la phrase à montrer. Jamais un échec silencieux.
 */
export async function saveApproval(row: Pick<ProposalRow, "id" | "restaurant_id" | "content">, approved: ApprovedReply[]): Promise<string | null> {
  const replies = ((row.content as { replies?: LouisReply[] }).replies ?? []) as LouisReply[];
  const kept = new Set(approved.map((a) => a.ref));
  const content = { ...row.content, approvedReplies: approved, skippedRefs: replies.filter((r) => !kept.has(r.ref)).map((r) => r.ref) };
  const { data, error } = await createAdminClient()
    .from("agent_proposals")
    .update({ content })
    .eq("id", row.id)
    .eq("restaurant_id", row.restaurant_id)
    .eq("status", "proposee")
    .select("id")
    .maybeSingle();
  if (error) return `Tes réponses n'ont pas pu être enregistrées : ${error.message}`;
  if (!data) return "Cette idée a déjà été décidée, peut-être depuis un autre téléphone.";
  return null;
}
