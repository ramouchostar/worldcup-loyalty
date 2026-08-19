import { createAdminClient } from "./supabase";
import { normalizeSuggestionName } from "./team-suggestions";

// ADR 0035 — gestion des équipes depuis la console restaurateur.
// Service role : `teams`, `memberships` et `community_scores` n'ont pas de
// policy de lecture croisée (même convention que lib/teams.ts). La garde
// d'accès est faite par l'appelant (layout admin ou requireAdmin).

export type AdminTeamMember = {
  userId: string;
  // ADR 0025 / 0030 §7 — nom d'affichage seulement. Jamais d'email ni de
  // téléphone dans une surface restaurateur : l'éditeur reste l'unique
  // responsable de traitement, le resto agit via le ciblage broadcast.
  name: string;
  joinedAt: string | null;
  orderCount: number;
  totalSpent: number;
};

export type AdminTeam = {
  id: string;
  name: string;
  type: string;
  emoji: string;
  joinCode: string | null;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
  totalSpent: number;
  orderCount: number;
  // Une équipe née d'une communauté déclarée (ADR 0031) : la retirer ferait
  // aussi sauter le raccourci d'adhésion, on le signale dans l'écran.
  fromSuggestion: string | null;
  // Faux dès qu'un historique existe : on archive au lieu de supprimer.
  canDelete: boolean;
  members: AdminTeamMember[];
};

export async function listTeamsForAdmin(restaurantId: string): Promise<AdminTeam[]> {
  const admin = createAdminClient();

  const [{ data: teamsRaw }, { data: memsRaw }, { data: ordersRaw }, { data: scoresRaw }, { data: suggRaw }] =
    await Promise.all([
      admin
        .from("teams")
        .select("id, name, type, flag_emoji, join_code, is_active, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at"),
      admin
        .from("memberships")
        .select("user_id, team_id, joined_at, profiles!inner(display_name)")
        .eq("restaurant_id", restaurantId),
      admin
        .from("orders")
        .select("user_id, team_id, amount, status")
        .eq("restaurant_id", restaurantId)
        .limit(10000),
      admin.from("community_scores").select("team_id, member_count, total_spent").eq("restaurant_id", restaurantId),
      admin.from("team_suggestions").select("name, team_id").eq("restaurant_id", restaurantId).eq("is_active", true),
    ]);

  const teams = (teamsRaw ?? []) as {
    id: string; name: string; type: string; flag_emoji: string | null;
    join_code: string | null; is_active: boolean; created_at: string;
  }[];
  const mems = (memsRaw ?? []) as unknown as {
    user_id: string; team_id: string | null; joined_at: string | null;
    profiles: { display_name: string | null } | null;
  }[];
  const orders = (ordersRaw ?? []) as { user_id: string; team_id: string | null; amount: number; status: string }[];
  const scores = (scoresRaw ?? []) as { team_id: string; member_count: number; total_spent: number }[];
  const suggestions = (suggRaw ?? []) as { name: string; team_id: string | null }[];

  const scoreByTeam = new Map(scores.map((s) => [s.team_id, s]));
  const suggByTeam = new Map(suggestions.filter((s) => s.team_id).map((s) => [s.team_id as string, s.name]));

  // Dépense par membre (commandes validées) — sert à situer chaque membre
  // dans son équipe, indépendamment du score stocké.
  const perUser = new Map<string, { count: number; spent: number }>();
  for (const o of orders) {
    if (o.status !== "validated") continue;
    const agg = perUser.get(o.user_id) ?? { count: 0, spent: 0 };
    agg.count += 1;
    agg.spent += Number(o.amount);
    perUser.set(o.user_id, agg);
  }

  // Commandes RATTACHÉES à l'équipe (orders.team_id) : c'est ce lien, et lui
  // seul, qui empêche une suppression — la FK orders → teams est en RESTRICT.
  const ordersByTeam = new Map<string, number>();
  for (const o of orders) {
    if (!o.team_id) continue;
    ordersByTeam.set(o.team_id, (ordersByTeam.get(o.team_id) ?? 0) + 1);
  }

  return teams.map((t) => {
    const members = mems
      .filter((m) => m.team_id === t.id)
      .map((m) => {
        const agg = perUser.get(m.user_id) ?? { count: 0, spent: 0 };
        return {
          userId: m.user_id,
          name: m.profiles?.display_name?.trim() || "Membre",
          joinedAt: m.joined_at,
          orderCount: agg.count,
          totalSpent: agg.spent,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);

    const orderCount = ordersByTeam.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      emoji: t.flag_emoji ?? "👥",
      joinCode: t.join_code,
      isActive: t.is_active,
      createdAt: t.created_at,
      memberCount: members.length,
      totalSpent: Number(scoreByTeam.get(t.id)?.total_spent ?? 0),
      orderCount,
      fromSuggestion: suggByTeam.get(t.id) ?? null,
      canDelete: orderCount === 0,
      members,
    };
  });
}

type Result = { ok: true } | { ok: false; error: string };

async function teamBelongsTo(teamId: string, restaurantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("teams").select("restaurant_id").eq("id", teamId).maybeSingle();
  return (data as { restaurant_id: string } | null)?.restaurant_id === restaurantId;
}

export async function renameTeam(restaurantId: string, teamId: string, rawName: string): Promise<Result> {
  const name = normalizeSuggestionName(rawName);
  if (!name) return { ok: false, error: "Nom invalide (2 à 60 caractères)." };
  if (!(await teamBelongsTo(teamId, restaurantId))) return { ok: false, error: "Équipe introuvable." };

  const admin = createAdminClient();
  const { error } = await admin.from("teams").update({ name }).eq("id", teamId);
  if (error) return { ok: false, error: "Erreur lors du renommage." };

  // La communauté déclarée qui a matérialisé l'équipe porte le même nom côté
  // membre : sans ça, le raccourci d'adhésion afficherait l'ancien libellé.
  await admin.from("team_suggestions").update({ name }).eq("restaurant_id", restaurantId).eq("team_id", teamId);
  return { ok: true };
}

// Archiver : l'équipe et son historique restent, elle n'est plus proposée ni
// classée. Réversible — c'est la voie normale dès qu'une commande existe.
export async function setTeamActive(restaurantId: string, teamId: string, isActive: boolean): Promise<Result> {
  if (!(await teamBelongsTo(teamId, restaurantId))) return { ok: false, error: "Équipe introuvable." };
  const admin = createAdminClient();
  const { error } = await admin.from("teams").update({ is_active: isActive }).eq("id", teamId);
  return error ? { ok: false, error: "Erreur lors de la mise à jour." } : { ok: true };
}

// Supprimer : réservé aux équipes SANS commande rattachée (typiquement une
// équipe de test, ou créée par erreur). Les membres redeviennent sans équipe
// — ils gardent leur compte, leur adhésion à l'établissement et leurs points
// personnels ; depuis l'ADR 0034 ils peuvent continuer à envoyer des tickets.
export async function deleteTeam(restaurantId: string, teamId: string): Promise<Result> {
  if (!(await teamBelongsTo(teamId, restaurantId))) return { ok: false, error: "Équipe introuvable." };
  const admin = createAdminClient();

  const { count: orderCount } = await admin
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId);
  if ((orderCount ?? 0) > 0) {
    return { ok: false, error: "Des commandes sont rattachées à cette équipe : archive-la plutôt que de la supprimer." };
  }

  const { data: transfers } = await admin
    .from("transfers")
    .select("id")
    .or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`);
  if ((transfers ?? []).length > 0) {
    return { ok: false, error: "Des changements d'équipe pointent vers celle-ci : archive-la plutôt que de la supprimer." };
  }

  // Les FK vers teams sont en RESTRICT (memberships, profiles) : on libère
  // avant de supprimer, jamais de cascade silencieuse sur les adhésions.
  await admin.from("memberships").update({ team_id: null }).eq("team_id", teamId).eq("restaurant_id", restaurantId);
  await admin.from("profiles").update({ team_id: null }).eq("team_id", teamId);
  await admin.from("community_scores").delete().eq("team_id", teamId);

  // team_suggestions.team_id est en ON DELETE SET NULL : la communauté
  // déclarée survit et redeviendra matérialisable au prochain « oui ».
  const { error } = await admin.from("teams").delete().eq("id", teamId);
  return error ? { ok: false, error: "Suppression impossible : des données y sont encore rattachées." } : { ok: true };
}
