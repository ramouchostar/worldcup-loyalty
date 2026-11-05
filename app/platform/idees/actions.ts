"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { getPlan } from "@/lib/entitlements";
import { todayInBrussels } from "@/lib/broadcast";
import { getIdea, markExecuted, recordIdeas } from "@/lib/agents/proposals";
import { buildTeamIdea, type TeamIdeaInput } from "@/lib/agents/team-ideas";
import type { DiscardReason } from "@/lib/agents/types";
import { runMorningIdeas, type MorningRestaurantResult } from "@/lib/agents/morning";

// /platform/idees (ADR 0089 §6, Brigade 04) — les gestes de l'équipe : déposer
// une idée préparée à la main chez un établissement, et noter « Fait » quand le
// travail promis sur un « Oui » est fait. Réservé au super-admin ; chaque action
// se re-garde (une Server Action est une route publique).

async function superAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("profiles").select("is_super_admin").eq("id", user.id).single();
  return (data as { is_super_admin: boolean } | null)?.is_super_admin ? user.id : null;
}

const DISCARD_TEXT: Record<DiscardReason, string> = {
  forfait: "Le forfait de l'établissement ne couvre pas cet assistant : choisis-en un autre, ou change de forfait.",
  deja_proposee: "La même idée attend déjà une décision chez cet établissement.",
  refusee_recemment: "Le gérant a refusé cette idée récemment : elle ne peut pas revenir tout de suite.",
  appris: "Le gérant a mis ce genre d'idée en pause (refus répétés).",
  plafond_du_jour: "L'établissement a déjà ses 3 idées du jour : réessaie demain, ou attends qu'une idée soit décidée.",
};

export type CreateResult = { ok: true; message: string } | { ok: false; errors: string[] };

export async function createTeamIdea(restaurantId: string, input: TeamIdeaInput): Promise<CreateResult> {
  const userId = await superAdminId();
  if (!userId) return { ok: false, errors: ["Accès réservé à la plateforme."] };

  const { data: resto } = await createAdminClient().from("restaurants").select("id, name").eq("id", restaurantId).maybeSingle();
  if (!resto) return { ok: false, errors: ["Choisis un établissement."] };

  const built = buildTeamIdea(input, todayInBrussels());
  if (!built.idea) return { ok: false, errors: built.errors };

  // Mêmes règles que les idées des assistants (forfait, doublon, refus récent, plafond du jour) :
  // une idée écartée est enregistrée avec sa raison, et l'équipe la lit ici, en clair.
  const rec = await recordIdeas(restaurantId, [built.idea], { plan: await getPlan(restaurantId), origin: "equipe", createdBy: userId });
  if (rec.unavailable) return { ok: false, errors: ["La table des idées est indisponible (migration agent_proposals ?)."] };
  revalidatePath("/platform/idees");
  if (rec.shown.length === 0) {
    const reason = rec.discarded[0]?.reason;
    return { ok: false, errors: [reason ? DISCARD_TEXT[reason] : "L'idée n'a pas été montrée (date limite déjà passée ?)."] };
  }
  return { ok: true, message: `Déposée chez ${(resto as { name: string }).name} : elle est dans ses Idées du jour.` };
}

export async function markTeamDone(restaurantId: string, id: string, note: string): Promise<{ ok: boolean; message: string }> {
  const userId = await superAdminId();
  if (!userId) return { ok: false, message: "Accès réservé à la plateforme." };
  const row = await getIdea(restaurantId, id);
  if (!row || "unavailable" in row) return { ok: false, message: "Idée introuvable." };
  if (row.status !== "acceptee") return { ok: false, message: "Cette idée n'attend plus l'équipe." };
  const done = await markExecuted(id, { doneBy: userId, note: note.replace(/\s+/g, " ").trim().slice(0, 500) || null, byTeam: true });
  revalidatePath("/platform/idees");
  return done ? { ok: true, message: "Noté : le gérant voit l'idée comme faite." } : { ok: false, message: "Elle a changé entre-temps : recharge la page." };
}

/**
 * Faire passer la brigade maintenant pour UN établissement (essai, démo comprise) :
 * même passage que celui de 9 h — génération, enregistrement, message si l'établissement
 * est ouvert au message du matin et ne l'a pas déjà reçu aujourd'hui.
 */
export async function runBrigadeNow(restaurantId: string): Promise<{ ok: boolean; message?: string; result?: MorningRestaurantResult }> {
  const userId = await superAdminId();
  if (!userId) return { ok: false, message: "Accès réservé à la plateforme." };
  if (!restaurantId) return { ok: false, message: "Choisis un établissement." };
  const run = await runMorningIdeas(new Date(), { only: restaurantId });
  revalidatePath("/platform/idees");
  const result = run.restaurants[0];
  if (!result) return { ok: false, message: "Établissement introuvable." };
  return { ok: true, result };
}
