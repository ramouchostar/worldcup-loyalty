import { createAdminClient, createServerSupabaseClient } from "./supabase";
import { normalizeZone } from "./zones";
import {
  PROMPT_SNOOZE_DAYS,
  pickPromptCandidates,
  suggestionKey,
  teamTypeEmoji,
  type SuggestionInput,
} from "./team-suggestions";
import type { TeamType } from "@/types";

// ADR 0014 — Équipes communautaires créées par les membres.
// Création / adhésion via service role (pas de policy INSERT sur teams).
// Changement d'équipe limité à 1×/30 jours (remplace le transfert lié à
// l'élimination, ADR 0004 superseded).
// ADR 0018 — les équipes portent une zone (découverte « équipes dans ta
// zone ») et sont joignables par id en plus du code d'invitation.

const VALID_TYPES: TeamType[] = ["ecole", "entreprise", "rue_quartier", "taxis", "autre"];
const CHANGE_COOLDOWN_DAYS = 30;

export function isTeamType(v: unknown): v is TeamType {
  return typeof v === "string" && (VALID_TYPES as string[]).includes(v);
}

export function teamEmoji(type: TeamType): string {
  return teamTypeEmoji(type);
}

// Code d'adhésion lisible, sans caractères ambigus (I/O/1/0)
function randomCode(len = 6): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// join_code unique (quelques tentatives en cas de collision)
async function uniqueJoinCode(admin: Admin): Promise<string> {
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await admin.from("teams").select("id").eq("join_code", code).limit(1);
    if (!clash || clash.length === 0) break;
    code = randomCode();
  }
  return code;
}

// Ligne de score : sans elle, le trigger de commande n'a rien à mettre à jour.
// `score: 0` OBLIGATOIRE — depuis m47 la colonne est régulière SANS défaut ;
// l'omettre laisse score=NULL et l'accumulation reste bloquée (NULL + points
// = NULL). Le trigger est rendu COALESCE-safe en m49, ceci en est le pendant.
async function ensureScoreRow(admin: Admin, teamId: string, restaurantId: string): Promise<void> {
  const { data: existing } = await admin
    .from("community_scores")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("restaurant_id", restaurantId)
    .limit(1);
  if (!existing || existing.length === 0) {
    await admin
      .from("community_scores")
      .insert({ team_id: teamId, restaurant_id: restaurantId, member_count: 0, total_spent: 0, score: 0 });
  }
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

  // F7 (sécurité) — l'établissement doit exister : bloque les restaurantId
  // fabriqués et la création de données orphelines (teams/community_scores).
  const { data: resto } = await admin.from("restaurants").select("id").eq("id", restaurantId).maybeSingle();
  if (!resto) return { ok: false, status: 404, error: "Établissement introuvable." };

  // F7 (sécurité) — anti-flood : au plus 3 équipes créées par membre et par
  // heure (empêche le noyage du référentiel équipes / la pollution en masse).
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recentCreated } = await admin
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .gte("created_at", oneHourAgo);
  if ((recentCreated ?? 0) >= 3) {
    return { ok: false, status: 429, error: "Trop d'équipes créées récemment. Réessaie plus tard." };
  }

  const joinCode = await uniqueJoinCode(admin);

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

  await ensureScoreRow(admin, team.id, restaurantId);

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

// ─── ADR 0031 — communautés déclarées par l'établissement ────────────────────
//
// Une suggestion n'est pas une équipe : elle ne porte ni score, ni membres, ni
// place au classement tant que personne ne s'y reconnaît. `team_id` NULL =
// non matérialisée. Le premier membre à répondre « oui » crée l'équipe et en
// devient le capitaine (created_by) — c'est ce qui préserve la viralité de
// l'ADR 0014 tout en supprimant l'attente d'un capitaine spontané.

export type TeamSuggestionRow = {
  id: string;
  name: string;
  type: TeamType;
  zone: string | null;
  team_id: string | null;
};

// Remplace la liste déclarée par l'établissement (onboarding ou réglages).
// Une suggestion retirée alors qu'elle est DÉJÀ matérialisée n'est pas
// supprimée mais désactivée : l'équipe et son historique existent, seul le
// raccourci d'adhésion disparaît.
export async function replaceTeamSuggestions(
  restaurantId: string,
  entries: SuggestionInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const { data: existingRaw } = await admin
    .from("team_suggestions")
    .select("id, name, team_id")
    .eq("restaurant_id", restaurantId);
  const existing = (existingRaw ?? []) as { id: string; name: string; team_id: string | null }[];
  const byKey = new Map(existing.map((row) => [suggestionKey(row.name), row]));

  const keptKeys = new Set<string>();
  for (const entry of entries) {
    const key = suggestionKey(entry.name);
    keptKeys.add(key);
    const match = byKey.get(key);
    if (match) {
      const { error } = await admin
        .from("team_suggestions")
        .update({ name: entry.name, type: entry.type, zone: entry.zone, is_active: true })
        .eq("id", match.id);
      if (error) return { ok: false, error: "Erreur lors de l'enregistrement des communautés." };
    } else {
      const { error } = await admin.from("team_suggestions").insert({
        restaurant_id: restaurantId,
        name: entry.name,
        type: entry.type,
        zone: entry.zone,
      });
      if (error) return { ok: false, error: "Erreur lors de l'enregistrement des communautés." };
    }
  }

  const removed = existing.filter((row) => !keptKeys.has(suggestionKey(row.name)));
  const toDeactivate = removed.filter((row) => row.team_id).map((row) => row.id);
  const toDelete = removed.filter((row) => !row.team_id).map((row) => row.id);
  if (toDeactivate.length > 0) {
    await admin.from("team_suggestions").update({ is_active: false }).in("id", toDeactivate);
  }
  if (toDelete.length > 0) {
    await admin.from("team_suggestions").delete().in("id", toDelete);
  }

  return { ok: true };
}

// Liste complète pour la console restaurateur (ordre stable = ordre de saisie).
export async function listTeamSuggestions(restaurantId: string): Promise<TeamSuggestionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_suggestions")
    .select("id, name, type, zone, team_id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("created_at");
  return (data ?? []) as TeamSuggestionRow[];
}

// Communautés proposables sur la page équipe (membre sans équipe, ou en
// changement) — matérialisées ou non, l'adhésion passe par le même chemin.
export async function listDiscoverySuggestions(
  restaurantId: string,
  currentTeamId: string | null
): Promise<TeamSuggestionRow[]> {
  const rows = await listTeamSuggestions(restaurantId);
  return currentTeamId ? rows.filter((row) => row.team_id !== currentTeamId) : rows;
}

export type TeamPrompt = { suggestions: TeamSuggestionRow[] };

// « Te reconnais-tu dans une de ces équipes ? » — décide si la question est due
// et choisit les propositions. Renvoie null si : pas d'adhésion, déjà une
// équipe, relance pas encore échue, ou plus rien à proposer.
export async function getTeamPrompt(userId: string, restaurantId: string): Promise<TeamPrompt | null> {
  const admin = createAdminClient();

  const { data: membershipRaw } = await admin
    .from("memberships")
    .select("team_id, team_prompt_next_at, team_prompt_declined")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const membership = membershipRaw as {
    team_id: string | null;
    team_prompt_next_at: string | null;
    team_prompt_declined: string[] | null;
  } | null;

  if (!membership || membership.team_id) return null;
  if (membership.team_prompt_next_at && new Date(membership.team_prompt_next_at) > new Date()) {
    return null;
  }

  const [{ data: profileRaw }, candidates] = await Promise.all([
    admin.from("profiles").select("zones").eq("id", userId).maybeSingle(),
    listTeamSuggestions(restaurantId),
  ]);
  const zones = ((profileRaw as { zones?: string[] } | null)?.zones ?? []) as string[];

  const picked = pickPromptCandidates(
    candidates.map(({ id, name, type, zone }) => ({ id, name, type, zone })),
    zones,
    membership.team_prompt_declined ?? []
  );
  if (picked.length === 0) return null;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  return { suggestions: picked.map((p) => byId.get(p.id)!).filter(Boolean) };
}

function snoozeDate(): string {
  return new Date(Date.now() + PROMPT_SNOOZE_DAYS * 86_400_000).toISOString();
}

// « Plus tard » / sortie du questionnaire → on n'en reparle qu'une semaine après.
export async function snoozeTeamPrompt(
  restaurantId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, status: 401, error: "Non authentifié." };

  const { error } = await createAdminClient()
    .from("memberships")
    .update({ team_prompt_next_at: snoozeDate() })
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);
  if (error) return { ok: false, status: 500, error: "Erreur. Réessaie." };
  return { ok: true };
}

// « Aucune de ces équipes » : les propositions affichées sont mémorisées comme
// refusées, pour que la relance en présente d'AUTRES et non les mêmes. La
// relance est armée dans tous les cas — le membre a répondu, on ne le
// resollicite pas avant une semaine même s'il reste des communautés en stock.
export async function declineTeamSuggestions(
  suggestionIds: string[],
  restaurantId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, status: 401, error: "Non authentifié." };

  const admin = createAdminClient();
  const { data: membershipRaw } = await admin
    .from("memberships")
    .select("team_prompt_declined")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!membershipRaw) return { ok: false, status: 404, error: "Adhésion introuvable." };

  const declined = new Set(
    ((membershipRaw as { team_prompt_declined: string[] | null }).team_prompt_declined ?? []) as string[]
  );
  for (const id of suggestionIds) declined.add(id);

  const { error } = await admin
    .from("memberships")
    .update({
      team_prompt_declined: Array.from(declined),
      team_prompt_next_at: snoozeDate(),
    })
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);
  if (error) return { ok: false, status: 500, error: "Erreur. Réessaie." };

  return { ok: true };
}

export type SuggestionJoinResult =
  | { ok: true; team: TeamSummary; becameCaptain: boolean }
  | { ok: false; status: number; error: string };

// « Oui, c'est moi » — matérialise l'équipe si elle n'existe pas encore et y
// affecte le membre. Le premier arrivé devient capitaine.
export async function joinTeamBySuggestion(
  suggestionId: string,
  restaurantId: string
): Promise<SuggestionJoinResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, status: 401, error: "Non authentifié." };

  const admin = createAdminClient();
  const { data: found } = await admin
    .from("team_suggestions")
    .select("id, name, type, zone, team_id, restaurant_id, is_active")
    .eq("id", suggestionId)
    .maybeSingle();

  const suggestion = found as
    | (TeamSuggestionRow & { restaurant_id: string; is_active: boolean })
    | null;
  if (!suggestion) return { ok: false, status: 404, error: "Communauté introuvable." };
  if (suggestion.restaurant_id !== restaurantId) {
    return { ok: false, status: 422, error: "Cette communauté appartient à un autre établissement." };
  }
  if (!suggestion.is_active) {
    return { ok: false, status: 422, error: "Cette communauté n'est plus proposée." };
  }

  // Déjà matérialisée → adhésion normale (le premier « oui » est passé).
  if (suggestion.team_id) {
    const joined = await joinTeamById(suggestion.team_id, restaurantId);
    if (!joined.ok) return joined;
    return { ok: true, team: joined.team, becameCaptain: false };
  }

  const joinCode = await uniqueJoinCode(admin);
  const { data: inserted, error: insErr } = await admin
    .from("teams")
    .insert({
      name: suggestion.name,
      type: suggestion.type,
      restaurant_id: restaurantId,
      created_by: userId,
      join_code: joinCode,
      flag_emoji: teamEmoji(suggestion.type),
      is_active: true,
      zone: suggestion.zone,
    })
    .select("id, name, type, join_code")
    .single();
  if (insErr || !inserted) {
    return { ok: false, status: 500, error: "Erreur lors de la création de l'équipe." };
  }
  const team = inserted as TeamSummary;

  // Verrou optimiste : deux membres peuvent répondre « oui » en même temps.
  // Seul celui dont l'UPDATE trouve encore team_id NULL garde son équipe ;
  // le perdant supprime la sienne (aucun membre, aucun score) et rejoint
  // l'équipe gagnante. Sans ça, une même communauté produirait des doublons.
  const { data: claimed } = await admin
    .from("team_suggestions")
    .update({ team_id: team.id })
    .eq("id", suggestion.id)
    .is("team_id", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    await admin.from("teams").delete().eq("id", team.id);
    const { data: winnerRaw } = await admin
      .from("team_suggestions")
      .select("team_id")
      .eq("id", suggestion.id)
      .maybeSingle();
    const winnerId = (winnerRaw as { team_id: string | null } | null)?.team_id;
    if (!winnerId) return { ok: false, status: 500, error: "Erreur lors de la création de l'équipe." };
    const joined = await joinTeamById(winnerId, restaurantId);
    if (!joined.ok) return joined;
    return { ok: true, team: joined.team, becameCaptain: false };
  }

  await ensureScoreRow(admin, team.id, restaurantId);

  const assigned = await assignTeam(admin, userId, restaurantId, team.id);
  if (!assigned.ok) return assigned;

  return { ok: true, team, becameCaptain: true };
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
