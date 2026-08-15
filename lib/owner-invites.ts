import { randomBytes } from "crypto";
import { createAdminClient } from "./supabase";
import { OWNER_INVITE_COOKIE, isValidInviteToken } from "./owner-invite-token";

// ADR 0032 — invitation restaurateur par lien. Le super-admin génère un lien depuis
// /platform, l'envoie au restaurateur (WhatsApp / email), et c'est le clic du
// restaurateur qui pose `restaurants.owner_id` — il peut s'inscrire APRÈS
// avoir reçu le lien, ce que `assignOwner` (rattachement par email d'un compte
// existant) ne permettait pas.
//
// Même famille que `redemption_tokens` (ADR 0011) : secret URL-safe, durée de
// vie bornée, consommable une seule fois, compare-and-swap à l'acceptation.
// Table service-role only (m55) — jamais lisible par la clé anon.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

// 14 jours : un restaurateur démarché sur le terrain ne s'inscrit pas le soir
// même. Assez long pour survivre à une relance, assez court pour qu'un lien
// oublié dans une conversation ne reste pas une porte d'entrée indéfinie.
const INVITE_TTL_DAYS = 14;

// Cookie httpOnly posé par le middleware quand un visiteur non connecté ouvre
// /invite/[token] — même mécanique que `belchicken_ref` (parrainage) et
// `pending_restaurant_id` (QR d'établissement) : il ramène le restaurateur sur
// son invitation après l'inscription ou la connexion. Défini dans
// lib/owner-invite-token.ts (partagé avec le middleware), ré-exporté ici pour
// que les appelants n'aient qu'un seul module à importer.
export { OWNER_INVITE_COOKIE, isValidInviteToken };

export type OwnerInviteState = "valid" | "not-found" | "expired" | "accepted" | "revoked";

export type OwnerInvite = {
  id: string;
  token: string;
  restaurantId: string;
  restaurantName: string;
  email: string | null;
  expiresAt: string;
};

export type ActiveInvite = {
  id: string;
  token: string;
  url: string;
  restaurantId: string;
  email: string | null;
  expiresAt: string;
};

export function ownerInviteUrl(token: string): string {
  return `${APP_URL}/invite/${token}`;
}

// Génère un lien et révoque le précédent lien actif du même établissement
// (index unique partiel uq_owner_invites_active, m55) : un seul lien vivant à
// la fois, celui qu'on vient d'envoyer.
export async function createOwnerInvite(params: {
  restaurantId: string;
  email?: string | null;
  createdBy: string;
}): Promise<{ ok: true; invite: ActiveInvite } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const now = new Date();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id")
    .eq("id", params.restaurantId)
    .maybeSingle();
  if (!restaurant) return { ok: false, error: "Établissement introuvable." };

  await admin
    .from("owner_invites")
    .update({ revoked_at: now.toISOString() })
    .eq("restaurant_id", params.restaurantId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = randomBytes(24).toString("base64url"); // 32 caractères URL-safe
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await admin
    .from("owner_invites")
    .insert({
      token,
      restaurant_id: params.restaurantId,
      email: params.email?.trim().toLowerCase() || null,
      created_by: params.createdBy,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token, restaurant_id, email, expires_at")
    .single();

  if (error || !data) return { ok: false, error: "Erreur lors de la création du lien." };

  return {
    ok: true,
    invite: {
      id: data.id,
      token: data.token,
      url: ownerInviteUrl(data.token),
      restaurantId: data.restaurant_id,
      email: data.email,
      expiresAt: data.expires_at,
    },
  };
}

export async function revokeOwnerInvite(inviteId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("owner_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null);
}

// Liens encore vivants, indexés par établissement — la console plateforme
// réaffiche le lien déjà envoyé plutôt que d'en générer un nouveau à chaque
// consultation (sinon le lien parti en WhatsApp serait révoqué).
export async function getActiveInvitesByRestaurant(): Promise<Map<string, ActiveInvite>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("owner_invites")
    .select("id, token, restaurant_id, email, expires_at")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  const rows = (data ?? []) as {
    id: string;
    token: string;
    restaurant_id: string;
    email: string | null;
    expires_at: string;
  }[];

  return new Map(
    rows.map((r) => [
      r.restaurant_id,
      {
        id: r.id,
        token: r.token,
        url: ownerInviteUrl(r.token),
        restaurantId: r.restaurant_id,
        email: r.email,
        expiresAt: r.expires_at,
      },
    ])
  );
}

// Lecture SANS effet de bord (la page /invite/[token] est un GET : elle
// affiche, elle n'attribue rien — l'attribution passe par une Server Action,
// même principe anti-CSRF que POST /api/auth/bootstrap-admin).
export async function loadOwnerInvite(
  token: string
): Promise<{ state: OwnerInviteState; invite?: OwnerInvite }> {
  if (!isValidInviteToken(token)) return { state: "not-found" };

  const admin = createAdminClient();
  const { data } = await admin
    .from("owner_invites")
    .select("id, token, restaurant_id, email, expires_at, accepted_at, revoked_at, restaurants(name)")
    .eq("token", token)
    .maybeSingle();

  if (!data) return { state: "not-found" };

  const row = data as unknown as {
    id: string;
    token: string;
    restaurant_id: string;
    email: string | null;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    restaurants: { name: string } | null;
  };

  const invite: OwnerInvite = {
    id: row.id,
    token: row.token,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurants?.name ?? row.restaurant_id,
    email: row.email,
    expiresAt: row.expires_at,
  };

  if (row.revoked_at) return { state: "revoked", invite };
  if (row.accepted_at) return { state: "accepted", invite };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { state: "expired", invite };
  return { state: "valid", invite };
}

export type ClaimResult =
  | { ok: true; restaurantId: string; restaurantName: string }
  | { ok: false; state: Exclude<OwnerInviteState, "valid"> | "error" };

// Consommation du lien : compare-and-swap sur `accepted_at` (UPDATE ... WHERE
// accepted_at IS NULL est atomique au niveau ligne) AVANT d'écrire owner_id.
// Deux clics concurrents → un seul gagne, jamais deux restaurateurs attribués.
export async function claimOwnerInvite(token: string, userId: string): Promise<ClaimResult> {
  if (!isValidInviteToken(token)) return { ok: false, state: "not-found" };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: claimed } = await admin
    .from("owner_invites")
    .update({ accepted_at: now, accepted_by: userId })
    .eq("token", token)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id, restaurant_id");

  if (!claimed || claimed.length === 0) {
    // Rien réservé : on relit pour dire POURQUOI (expiré, déjà utilisé, révoqué).
    const { state } = await loadOwnerInvite(token);
    return { ok: false, state: state === "valid" ? "error" : state };
  }

  const restaurantId = (claimed[0] as { restaurant_id: string }).restaurant_id;

  const { data: updated, error } = await admin
    .from("restaurants")
    .update({ owner_id: userId })
    .eq("id", restaurantId)
    .select("id, name");

  if (error || !updated || updated.length === 0) {
    // L'écriture du restaurateur a échoué : on relâche la réservation pour que le
    // lien reste utilisable (sinon il serait grillé sans rien avoir attribué).
    await admin
      .from("owner_invites")
      .update({ accepted_at: null, accepted_by: null })
      .eq("id", (claimed[0] as { id: string }).id);
    return { ok: false, state: "error" };
  }

  return { ok: true, restaurantId, restaurantName: (updated[0] as { name: string }).name };
}
