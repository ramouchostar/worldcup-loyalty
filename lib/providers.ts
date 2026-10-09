import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createAdminClient, createServerSupabaseClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { sendProviderInviteEmail } from "./email";
import { isValidInviteToken } from "./provider-invite-token";
import { judgeInvite, normalizeEmail, type InviteVerdict } from "./provider-invite-rules";
import type { Metier } from "./mission-money";
import { SITE_ORIGIN } from "@/lib/site";

// ============================================================
// Réserver un prestataire (ADR 0084, PR D) — le prestataire, son accès, son invitation.
//
// Même famille que les invitations restaurateur (lib/owner-invites.ts, ADR 0032) :
// secret URL-safe, 14 jours, consommable une seule fois (compare-and-swap),
// tables service-role only. Différence voulue : le lien est LIÉ À UNE ADRESSE
// (lib/provider-invite-rules.ts) — un prestataire voit les brefs des
// restaurateurs et sera payé, le lien ne se transmet pas.
//
// FAIL-OPEN : migrations 20261009-1030 / -1500 absentes → les lectures
// répondent « indisponible », jamais un crash.
// ============================================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_ORIGIN;
const INVITE_TTL_DAYS = 14;
const METIERS: readonly Metier[] = ["video", "photo", "design", "impression"];

export type ProviderStatus = "invited" | "active" | "suspended" | "excluded";

export type ProviderRow = {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  metiers: Metier[];
  status: ProviderStatus;
  warnings: number;
  visibility_reduced: boolean;
  created_at: string;
  activated_at: string | null;
};

const PROVIDER_COLUMNS = "id, user_id, email, display_name, metiers, status, warnings, visibility_reduced, created_at, activated_at";

export function providerMissionUrl(missionId: string): string {
  return `${APP_URL}/prestataire/mission/${missionId}`;
}

export function providerInviteUrl(token: string): string {
  return `${APP_URL}/prestataire/invitation/${token}`;
}

// ── Accès ────────────────────────────────────────────────────

export async function getProviderByUserId(userId: string): Promise<ProviderRow | null> {
  try {
    const { data, error } = await createAdminClient().from("providers").select(PROVIDER_COLUMNS).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return (data as ProviderRow | null) ?? null;
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string })) console.error("[providers] getProviderByUserId failed:", (e as Error).message);
    return null;
  }
}

/** Garde d'une PAGE du prestataire : compte connecté ET prestataire actif, sinon refus parlant (jamais silencieux). */
export async function requireProviderPage(): Promise<{ userId: string; provider: ProviderRow }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");
  const provider = await getProviderByUserId(user.id);
  if (!provider || provider.status !== "active") redirect("/join?reason=provider-required");
  return { userId: user.id, provider };
}

/** Garde d'une ROUTE du prestataire (même règle, réponse JSON). */
export async function requireProvider(): Promise<{ ok: true; userId: string; provider: ProviderRow } | { ok: false; response: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  const provider = await getProviderByUserId(user.id);
  if (!provider || provider.status !== "active") return { ok: false, response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  return { ok: true, userId: user.id, provider };
}

// ── Plateforme : créer, inviter, suspendre ───────────────────

export type InviteInfo = { id: string; token: string; url: string; email: string; expiresAt: string };

export async function listProviders(): Promise<{ ok: true; providers: (ProviderRow & { invite: InviteInfo | null })[] } | { ok: false }> {
  try {
    const admin = createAdminClient();
    const [{ data: rows, error }, { data: invites, error: e2 }] = await Promise.all([
      admin.from("providers").select(PROVIDER_COLUMNS).order("created_at", { ascending: true }),
      admin
        .from("provider_invites")
        .select("id, token, provider_id, email, expires_at")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString()),
    ]);
    if (error) throw error;
    // Table des invitations absente (migration -1500 pas appliquée) : la liste reste lisible, sans liens.
    if (e2 && !isMissingTable(e2)) throw e2;
    const byProvider = new Map(
      ((invites ?? []) as { id: string; token: string; provider_id: string; email: string; expires_at: string }[]).map((i) => [
        i.provider_id,
        { id: i.id, token: i.token, url: providerInviteUrl(i.token), email: i.email, expiresAt: i.expires_at } satisfies InviteInfo,
      ])
    );
    return { ok: true, providers: ((rows ?? []) as ProviderRow[]).map((p) => ({ ...p, invite: byProvider.get(p.id) ?? null })) };
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string })) console.error("[providers] listProviders failed:", (e as Error).message);
    return { ok: false };
  }
}

/** Un nouveau lien pour ce prestataire ; l'ancien lien vivant est révoqué (un seul à la fois). */
export async function createProviderInvite(providerId: string, createdBy: string): Promise<{ ok: true; invite: InviteInfo; emailed: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: provider } = await admin.from("providers").select("id, email, display_name, status").eq("id", providerId).maybeSingle();
  const p = provider as { id: string; email: string; display_name: string; status: ProviderStatus } | null;
  if (!p) return { ok: false, error: "Prestataire introuvable." };
  if (p.status !== "invited") return { ok: false, error: "Ce prestataire a déjà un compte actif : pas de nouveau lien à envoyer." };

  const now = new Date();
  await admin.from("provider_invites").update({ revoked_at: now.toISOString() }).eq("provider_id", providerId).is("accepted_at", null).is("revoked_at", null);

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("provider_invites")
    .insert({ token, provider_id: providerId, email: normalizeEmail(p.email), created_by: createdBy, expires_at: expiresAt })
    .select("id, token, email, expires_at")
    .single();
  if (error || !data) return { ok: false, error: "Erreur lors de la création du lien." };

  const row = data as { id: string; token: string; email: string; expires_at: string };
  const invite: InviteInfo = { id: row.id, token: row.token, url: providerInviteUrl(row.token), email: row.email, expiresAt: row.expires_at };
  // Best-effort comme tout e-mail du module : sans RESEND_API_KEY l'envoi est journalisé « failed » et la plateforme partage le lien à la main.
  const emailed = await sendProviderInviteEmail(p.email, p.display_name, invite.url, invite.expiresAt);
  return { ok: true, invite, emailed };
}

export async function createProvider(input: {
  email: string;
  displayName: string;
  metiers: string[];
  createdBy: string;
}): Promise<{ ok: true; provider: ProviderRow } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim().slice(0, 120);
  const metiers = [...new Set(input.metiers.filter((m): m is Metier => (METIERS as readonly string[]).includes(m)))];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Adresse e-mail invalide." };
  if (displayName.length < 2) return { ok: false, error: "Donne un nom au prestataire." };
  if (metiers.length === 0) return { ok: false, error: "Choisis au moins un métier." };
  try {
    const { data, error } = await createAdminClient()
      .from("providers")
      .insert({ email, display_name: displayName, metiers, invited_by: input.createdBy })
      .select(PROVIDER_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Un prestataire existe déjà avec cette adresse." };
      if (isMissingTable(error)) return { ok: false, error: "Le module n'est pas encore disponible : applique d'abord les migrations." };
      throw error;
    }
    return { ok: true, provider: data as ProviderRow };
  } catch (e) {
    console.error("[providers] createProvider failed:", (e as Error).message);
    return { ok: false, error: "Création impossible pour le moment." };
  }
}

export async function setProviderStatus(providerId: string, status: "active" | "suspended"): Promise<boolean> {
  try {
    const admin = createAdminClient();
    // On ne suspend / réactive qu'un compte DÉJÀ lié : un prestataire encore « invité » n'a rien à suspendre.
    const { data, error } = await admin.from("providers").update({ status }).eq("id", providerId).not("user_id", "is", null).select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.error("[providers] setProviderStatus failed:", (e as Error).message);
    return false;
  }
}

// ── Page d'invitation ────────────────────────────────────────

export type LoadedInvite = {
  state: InviteVerdict | "not-found";
  invite?: { id: string; providerId: string; providerName: string; email: string; expiresAt: string };
};

/** Lecture SANS effet de bord (la page est un GET : elle affiche, elle n'attribue rien). */
export async function loadProviderInvite(token: string, userEmail?: string | null): Promise<LoadedInvite> {
  if (!isValidInviteToken(token)) return { state: "not-found" };
  try {
    const { data } = await createAdminClient()
      .from("provider_invites")
      .select("id, provider_id, email, expires_at, accepted_at, revoked_at, providers(display_name)")
      .eq("token", token)
      .maybeSingle();
    if (!data) return { state: "not-found" };
    const row = data as unknown as {
      id: string;
      provider_id: string;
      email: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
      providers: { display_name: string } | null;
    };
    return {
      state: judgeInvite(row, new Date(), userEmail),
      invite: { id: row.id, providerId: row.provider_id, providerName: row.providers?.display_name ?? "", email: row.email, expiresAt: row.expires_at },
    };
  } catch (e) {
    console.error("[providers] loadProviderInvite failed:", (e as Error).message);
    return { state: "not-found" };
  }
}

export type ClaimResult = { ok: true; providerName: string } | { ok: false; state: Exclude<InviteVerdict, "valid"> | "not-found" | "already-provider" | "error" };

/**
 * Accepte l'invitation : compare-and-swap sur `accepted_at` AVANT de lier le compte (deux clics → un
 * seul gagne). Un compte qui est déjà prestataire ne peut pas en devenir un deuxième.
 */
export async function claimProviderInvite(token: string, userId: string, userEmail: string | null | undefined): Promise<ClaimResult> {
  if (!isValidInviteToken(token)) return { ok: false, state: "not-found" };
  const loaded = await loadProviderInvite(token, userEmail ?? "");
  if (loaded.state === "not-found" || !loaded.invite) return { ok: false, state: "not-found" };
  if (loaded.state !== "valid") return { ok: false, state: loaded.state };

  const admin = createAdminClient();
  if (await getProviderByUserId(userId)) return { ok: false, state: "already-provider" };

  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("provider_invites")
    .update({ accepted_at: now, accepted_by: userId })
    .eq("token", token)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id, provider_id");
  if (!claimed || claimed.length === 0) {
    const again = await loadProviderInvite(token, userEmail ?? "");
    return { ok: false, state: again.state === "valid" || again.state === "not-found" ? "error" : again.state };
  }

  const { id: inviteId, provider_id: providerId } = claimed[0] as { id: string; provider_id: string };
  const { data: linked, error } = await admin
    .from("providers")
    .update({ user_id: userId, status: "active", activated_at: now })
    .eq("id", providerId)
    .eq("status", "invited")
    .select("id");
  if (error || !linked || linked.length === 0) {
    // Le compte n'a pas pu être lié : on relâche la réservation, le lien reste utilisable.
    await admin.from("provider_invites").update({ accepted_at: null, accepted_by: null }).eq("id", inviteId);
    console.error("[providers] claimProviderInvite link failed:", error?.message ?? "aucune ligne liée");
    return { ok: false, state: "error" };
  }
  return { ok: true, providerName: loaded.invite.providerName };
}
