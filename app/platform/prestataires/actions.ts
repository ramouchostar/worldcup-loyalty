"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createProvider, createProviderInvite, setProviderStatus } from "@/lib/providers";
import { acceptQuoteByPlatform } from "@/lib/missions-dates";
import { cancelByPlatform, settleCancellation } from "@/lib/missions-cancel";
import type { Fault } from "@/lib/mission-cancel-rules";
import { markPaidOut, openDispute, resolveDispute } from "@/lib/missions-superadmin";
import { RESOLVE_ISSUE_TEXT } from "@/lib/mission-dispute";
import { SETTINGS_ISSUE_TEXT, saveTerms, validateSettings } from "@/lib/marketplace-settings";
import { BUDGET_ISSUE_TEXT, saveBudgetConfig, validateBudgets, formatsOf } from "@/lib/marketplace-budgets";
import { VIDEO_TEMPLATE } from "@/lib/mission-brief";

// ADR 0084 — la plateforme invite, relance et suspend les prestataires. Réservé au super-admin :
// chaque action se re-garde (une Server Action est une route publique).
async function requireSuperAdmin(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");
  return user.id;
}

export type InviteActionResult = { error?: string; url?: string; emailed?: boolean; name?: string };

/** Crée le prestataire ET son lien d'invitation (lié à son adresse), envoie l'e-mail si possible. */
export async function inviteProvider(_prev: InviteActionResult | null, formData: FormData): Promise<InviteActionResult> {
  const userId = await requireSuperAdmin();
  const created = await createProvider({
    email: String(formData.get("email") ?? ""),
    displayName: String(formData.get("name") ?? ""),
    metiers: formData.getAll("metiers").map(String),
    createdBy: userId,
  });
  if (!created.ok) return { error: created.error };

  const invite = await createProviderInvite(created.provider.id, userId);
  revalidatePath("/platform/prestataires");
  if (!invite.ok) return { error: `Prestataire créé, mais le lien n'a pas pu l'être : ${invite.error}` };
  return { url: invite.invite.url, emailed: invite.emailed, name: created.provider.display_name };
}

/** Un nouveau lien (l'ancien est révoqué) — pour un lien perdu, expiré, ou une adresse corrigée. */
export async function reissueInvite(providerId: string): Promise<InviteActionResult> {
  const userId = await requireSuperAdmin();
  const invite = await createProviderInvite(providerId, userId);
  revalidatePath("/platform/prestataires");
  if (!invite.ok) return { error: invite.error };
  return { url: invite.invite.url, emailed: invite.emailed };
}

export async function toggleProviderStatus(providerId: string, status: "active" | "suspended"): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const ok = await setProviderStatus(providerId, status);
  revalidatePath("/platform/prestataires");
  return ok ? {} : { error: "Changement impossible : le prestataire n'a pas encore activé son compte, ou le service est indisponible." };
}

/**
 * Pilote, avant Stripe : le restaurateur a dit oui au devis et l'acompte est convenu hors plateforme.
 * La plateforme enregistre l'acceptation ; les montants sont figés avec le plan du restaurateur à cet instant.
 */
export async function acceptQuote(missionId: string): Promise<{ error?: string }> {
  const userId = await requireSuperAdmin();
  const r = await acceptQuoteByPlatform(missionId, userId);
  revalidatePath("/platform/prestataires");
  if (r.ok) return {};
  return { error: r.reason === "not_a_quote" ? "Ce devis n'attend plus de réponse (déjà accepté, décliné ou annulé)." : r.reason === "not_found" ? "Mission introuvable." : "Enregistrement impossible pour le moment." };
}

/**
 * La plateforme tranche un tournage qui n'a pas eu lieu (absence) ou une annulation contestée : la faute décide du
 * barème, la force majeure rembourse tout sans sanction. La raison est obligatoire : elle reste dans la trace.
 */
export async function cancelAsPlatform(missionId: string, fault: Fault, reason: string, noShow: boolean): Promise<{ error?: string; summary?: string }> {
  const userId = await requireSuperAdmin();
  const r = await cancelByPlatform(missionId, userId, fault, reason, noShow);
  revalidatePath("/platform/prestataires");
  if (r.ok) return { summary: r.band === "free" ? "Annulée sans frais." : r.band === "half" ? "Annulée : la moitié est due." : "Annulée : tout est dû." };
  switch (r.reason) {
    case "invalid":
      return { error: "Explique ta décision en quelques mots (5 caractères au moins)." };
    case "already_cancelled":
      return { error: "Cette mission est déjà annulée." };
    case "not_cancellable":
      return { error: "Cette mission ne peut pas s'annuler dans son état actuel." };
    case "not_found":
      return { error: "Mission introuvable." };
    default:
      return { error: "Enregistrement impossible pour le moment." };
  }
}

/** Le remboursement ou le règlement a été fait à la main : la ligne quitte la liste. */
export async function settleCancellationAction(missionId: string): Promise<{ error?: string }> {
  const userId = await requireSuperAdmin();
  const ok = await settleCancellation(missionId, userId);
  revalidatePath("/platform/prestataires");
  return ok ? {} : { error: "Déjà réglée, ou service indisponible." };
}

// ── Litiges, versements, réglages ────────────────────────────

export async function openDisputeAction(missionId: string, reason: string): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireSuperAdmin();
  const r = await openDispute(missionId, userId, reason);
  revalidatePath("/platform/prestataires", "layout");
  if (r.ok) return { ok: true };
  switch (r.reason) {
    case "invalid":
      return { error: "Explique pourquoi en quelques mots (10 caractères au moins) : c'est le début du dossier." };
    case "not_openable":
      return { error: "Un litige ne s'ouvre pas dans l'état actuel de cette mission (déjà ouvert, validée, annulée ou payée)." };
    case "not_found":
      return { error: "Mission introuvable." };
    default:
      return { error: "Enregistrement impossible pour le moment." };
  }
}

export async function resolveDisputeAction(missionId: string, payload: { decision: string; providerPct: string; sanction: string; note: string }): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireSuperAdmin();
  const r = await resolveDispute(missionId, userId, payload);
  revalidatePath("/platform/prestataires", "layout");
  if (r.ok) return { ok: true };
  switch (r.reason) {
    case "invalid":
      return { error: r.issue ? RESOLVE_ISSUE_TEXT[r.issue] : "Décision non valable." };
    case "not_in_dispute":
      return { error: "Ce litige est déjà tranché." };
    case "not_found":
      return { error: "Mission introuvable." };
    default:
      return { error: "Enregistrement impossible pour le moment." };
  }
}

export async function markPaidOutAction(missionId: string): Promise<{ error?: string }> {
  const userId = await requireSuperAdmin();
  const r = await markPaidOut(missionId, userId);
  revalidatePath("/platform/prestataires", "layout");
  if (r.ok) return {};
  return { error: r.reason === "not_validated" ? "Déjà payé, ou la livraison n'est pas validée." : r.reason === "not_found" ? "Mission introuvable." : "Enregistrement impossible pour le moment." };
}

export async function saveSettingsAction(payload: { commissionPct: string; proCommissionPct: string; depositPct: string }): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireSuperAdmin();
  const v = validateSettings(payload);
  if (!v.ok) return { error: v.issues.map((i) => SETTINGS_ISSUE_TEXT[i]).join(" ") };
  const ok = await saveTerms(v.terms, userId);
  revalidatePath("/platform/prestataires", "layout");
  return ok ? { ok: true } : { error: "Enregistrement impossible pour le moment : la migration du module est-elle appliquée ?" };
}

export async function saveBudgetsAction(payload: { floorEuros: string; ambitionEuros: Record<string, string> }): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireSuperAdmin();
  const v = validateBudgets(payload, formatsOf(VIDEO_TEMPLATE));
  if (!v.ok) return { error: v.issues.map((i) => `${i.field === "floor" ? "Plancher" : i.field} : ${BUDGET_ISSUE_TEXT[i.code]}`).join(" ") };
  const ok = await saveBudgetConfig("video", v.floorCents, v.ambitionCents, userId);
  revalidatePath("/platform/prestataires", "layout");
  return ok ? { ok: true } : { error: "Enregistrement impossible pour le moment : la migration du module est-elle appliquée ?" };
}
