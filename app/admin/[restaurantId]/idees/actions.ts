"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, isEstablishmentAdmin } from "@/lib/admin-guard";
import { todayInBrussels } from "@/lib/broadcast";
import { decideIdea, getIdea, type Decision } from "@/lib/agents/proposals";
import { executeIdea } from "@/lib/agents/execute";
import { REFUSAL_REASONS, type RefusalReason } from "@/lib/agents/types";

// Les gestes du gérant sur ses idées (ADR 0089 §5, Brigade 03). Une Server
// Action est une route publique : chaque appel se re-garde (membre de la
// console de CET établissement), et l'idée est relue côté serveur — rien de ce
// que le navigateur envoie ne dit ce qu'il faut exécuter, seulement l'id.

export type DecideInput =
  | { kind: "oui"; termsAccepted?: boolean }
  | { kind: "non"; reason: string; note?: string | null }
  | { kind: "plus_tard" };

export type DecideOutcome = {
  ok: boolean;
  /** Ce que la carte affiche juste après le geste. */
  message: string;
  /** Un écran à ouvrir (geste « ouvrir », pub créée). */
  redirect?: string;
  /** Le « Oui » a échoué : la carte le dit, l'idée reste visible avec son erreur. */
  failed?: boolean;
};

const REFUSED_TEXT = {
  introuvable: "Cette idée n'existe plus.",
  deja_decidee: "Cette idée a déjà été décidée, peut-être depuis un autre téléphone.",
  echue: "Cette idée a expiré.",
  indisponible: "Les idées sont indisponibles pour le moment. Réessaie dans quelques minutes.",
} as const;

export async function decide(restaurantId: string, id: string, input: DecideInput): Promise<DecideOutcome> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Connecte-toi pour continuer." };
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) return { ok: false, message: "Accès refusé." };

  let decision: Decision;
  if (input?.kind === "oui") decision = { kind: "oui" };
  else if (input?.kind === "plus_tard") decision = { kind: "plus_tard" };
  else if (input?.kind === "non" && (REFUSAL_REASONS as string[]).includes(input.reason)) {
    decision = { kind: "non", reason: input.reason as RefusalReason, note: typeof input.note === "string" ? input.note : null };
  } else return { ok: false, message: "Choisis une raison." };

  // Une pub ne se crée jamais sans la case des conditions cochée par le gérant (ADR 0086 §4) :
  // vérifié AVANT de décider, pour qu'un « Oui » sans la case ne laisse pas une idée acceptée orpheline.
  if (decision.kind === "oui") {
    const row = await getIdea(restaurantId, id);
    if (row && !("unavailable" in row) && row.content.action.kind === "create_ad_request" && input.kind === "oui" && input.termsAccepted !== true) {
      return { ok: false, message: "Coche les conditions de la Pub pour continuer." };
    }
  }

  const res = await decideIdea(restaurantId, id, decision, { userId: user.id });
  if (!res.ok) return { ok: false, message: REFUSED_TEXT[res.reason] };

  revalidatePath(`/admin/${restaurantId}/idees`);
  if (decision.kind === "non") return { ok: true, message: res.learned ?? "C'est noté." };
  if (decision.kind === "plus_tard") return { ok: true, message: "On t'en reparle demain matin." };

  const access = await getAdminAccess(user.id, restaurantId);
  const out = await executeIdea(res.row, {
    userId: user.id,
    isSuperAdmin: access.isSuperAdmin,
    todayISO: todayInBrussels(),
    termsAccepted: input.kind === "oui" && input.termsAccepted === true,
  });
  revalidatePath(`/admin/${restaurantId}/idees`);
  if (out.kind === "failed") return { ok: true, failed: true, message: out.message };
  return { ok: true, message: out.message, ...(out.kind === "done" && out.redirect ? { redirect: out.redirect } : {}) };
}
