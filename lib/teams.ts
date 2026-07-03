import { createAdminClient, createServerSupabaseClient } from "./supabase";
import { normalizeZone } from "./zones";
import type { TeamType } from "@/types";

// ADR 0014 — Équipes communautaires créées par les membres.
// Création / adhésion via service role (pas de policy INSERT sur teams).
// Changement d'équipe limité à 1×/30 jours (remplace le transfert lié à
// l'élimination, ADR 0004 superseded).
// ADR 0018 — les équipes portent une zone (découverte « équipes dans ta
// zone ») et sont joignables par id en plus du code d'invitation.

const VALID_TYPES: TeamType[] = ["ecole", "entreprise", "rue_quartier", "taxis", "autre"];
const CHANGE_COOLDOWN_DAYS = 30;

const TYPE_EMOJI: Record<TeamType, string> = {
  ecole: "🎓",
  entreprise: "🏢",
  rue_quartier: "🏘️",
  taxis: "🚕",
  autre: "👥",
};

export function isTeamType(v: unknown): v is TeamType {
  return typeof v === "string" && (VALID_TYPES as string[]).includes(v);
}

export function teamEmoji(type: TeamType): string {
  return TYPE_EMOJI[type] ?? "👥";
}

// Code d'adhésion lisible, sans caractères ambigus (I/O/1/0)
function randomCode(len = 6): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export type TeamSummary = { id: string; name: string; type: TeamType; join_code: string };
export type TeamActionResult =
  | { ok: true; team: TeamSummary }
  | { ok: false; status: number; error: string };

type Admin = ReturnType<typeof createAdminClient>;

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Affecte une équipe au membre pour UN établissement donné (ADR 0015 §2).
// 1re affectation = libre ; changement = 1×/30j, scopé par établissement (§5).
async function assignTeam(
  admin: Admin,
  userId: string,
  restaurantId: string,
  newTeamId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: membership } = await admin
    .from("memberships")
    .select("team_id")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const currentTeamId = (membership as { team_id: string | null } | null)?.team_id ?? null;
  if (currentTeamId === newTeamId) {
    return { ok: false, status: 409, error: "Tu es déjà dans cette équipe." };
  }

  if (currentTeamId) {
    const since = new Date(Date.now() - CHANGE_COOLDOWN_DAYS * 86_400_000).toISOString();
    const { data: recent } = await admin
      .from("transfers")
      .select("id")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .gte("transferred_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: false, status: 429, error: "Tu ne peux changer d'équipe qu'une fois par mois." };
    }
    await admin.from("transfers").insert({
      user_id: userId,
      restaurant_id: restaurantId,
      from_team_id: currentTeamId,
      to_team_id: newTeamId,
    });
  }

  const { error } = await admin
    .from("memberships")
    .upsert(
      { user_id: userId, restaurant_id: restaurantId, team_id: newTeamId },
      { onConflict: "user_id,restaurant_id" }
    );
  if (error) return { ok: false, status: 500, error: "Erreur lors de l'affectation à l'équipe." };
  return { ok: true };
}

export async function createTeam(
  name: string,
  type: TeamType,
  restaurantId: string,
  zone?: string | null
): Promise<TeamActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, status: 401, error: "Non authentifié." };

  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 60) {
    return { ok: false, status: 400, error: "Nom d'équipe invalide (2 à 60 caractères)." };
  }
  // Zone facultative (ADR 0018) : NULL = pas déclarée, joignable par code seulement
  const cleanZone = zone ? normalizeZone(zone) || null : null;

  const admin = createAdminClient();

  // join_code unique (quelques tentatives en cas de collision)
  let joinCode = randomCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await admin.from("teams").select("id").eq("join_code", joinCode).limit(1);
    if (!clash || clash.length === 0) break;
    joinCode = randomCode();
  }

  const { data: inserted, error: insErr } = await admin
    .from("teams")
    .insert({
      name: cleanName,
      type,
      restaurant_id: restaurantId,
      created_by: userId,
      join_code: joinCode,
      flag_emoji: teamEmoji(type),
      is_active: true,
      zone: cleanZone,
    })
    .select("id, name, type, join_code")
    .single();

  if (insErr || !inserted) {
    return { ok: false, status: 500, error: "Erreur lors de la création de l'équipe." };
  }
  const team = inserted as TeamSummary;

  // Ligne de score : sans elle, le trigger de commande n'a rien à mettre à jour
  const { data: existingScore } = await admin
    .from("community_scores")
    .select("team_id")
    .eq("team_id", team.id)
    .eq("restaurant_id", restaurantId)
    .limit(1);
  if (!existingScore || existingScore.length === 0) {
    await admin
      .from("community_scores")
      .insert({ team_id: team.id, restaurant_id: restaurantId, member_count: 0, total_spent: 0 });
  }

  const assigned = await assignTeam(admin, userId, restaurantId, team.id);
  if (!assigned.ok) return assigned;

  return { ok: true, team };
}

// ADR 0018 — rejoindre une équipe découverte (liste « équipes dans ta zone »).
// Même garde-fou 1 changement/30 jours que le code d'invitation.
export async function joinTeamById(teamId: string, restaurantId: string): Promise<TeamActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, status: 401, error: "Non authentifié." };

  const admin = createAdminClient();
  const { data: found } = await admin
    .from("teams")
    .select("id, name, type, join_code, restaurant_id, is_active")
    .eq("id", teamId)
    .maybeSingle();

  const team = found as (TeamSummary & { restaurant_id: string | null; is_active: boolean }) | null;
  if (!team) return { ok: false, status: 404, error: "Équipe introuvable." };
  if (team.restaurant_id !== restaurantId) {
    return { ok: false, status: 422, error: "Cette équipe appartient à un autre établissement." };
  }
  if (!team.is_active) return { ok: false, status: 422, error: "Cette équipe n'est plus active." };

  const assigned = await assignTeam(admin, userId, restaurantId, team.id);
  if (!assigned.ok) return assigned;

  return { ok: true, team: { id: team.id, name: team.name, type: team.type, join_code: team.join_code } };
}

export async function joinTeamByCode(code: string, restaurantId: string): Promise<TeamActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, status: 401, error: "Non authentifié." };

  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(clean)) return { ok: false, status: 400, error: "Code invalide." };

  const admin = createAdminClient();

  const { data: found } = await admin
    .from("teams")
    .select("id, name, type, join_code, restaurant_id, is_active")
    .eq("join_code", clean)
    .single();

  const team = found as
    | (TeamSummary & { restaurant_id: string | null; is_active: boolean })
    | null;
  if (!team) return { ok: false, status: 404, error: "Aucune équipe ne correspond à ce code." };
  if (team.restaurant_id !== restaurantId) {
    return { ok: false, status: 422, error: "Cette équipe appartient à un autre établissement." };
  }
  if (!team.is_active) return { ok: false, status: 422, error: "Cette équipe n'est plus active." };

  const assigned = await assignTeam(admin, userId, restaurantId, team.id);
  if (!assigned.ok) return assigned;

  return { ok: true, team: { id: team.id, name: team.name, type: team.type, join_code: team.join_code } };
}
