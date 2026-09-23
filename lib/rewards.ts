import { createServerSupabaseClient, createAdminClient } from "./supabase";
import { incrementRewardsCost } from "./budget";
import { awardCrossedTeamTiers } from "./team-gifts";
import { displayItemName } from "./menu-quantity";

// Active member = at least 1 validated order
export async function isMemberActive(userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "validated");

  return (count ?? 0) > 0;
}

// ─── Grilles de cadeaux (ADR 0006, remplacé par l’ADR 0061) ─────────────

type RewardItem = { item: string | null; cost: number };

// Seul établissement autorisé à retomber sur les grilles héritées Belchicken :
// pour tout autre resto, une grille non configurée ne promet RIEN plutôt que
// des articles qui n'existent pas chez lui (et que le cashier devrait honorer,
// puisque pending_rewards fige le snapshot).
export const LEGACY_RESTAURANT_ID = "kraainem";

// Grilles héritées Belchicken (pré-ADR 0013) — injectées par loadRewardGrid
// uniquement pour LEGACY_RESTAURANT_ID quand le catalogue n'a pas de paliers.
const LEGACY_SOLO_TIERS: GridTier[] = [
  { min: 15, item: "Churros 6 pcs",   cost: 0.31 },
  { min: 25, item: "Finest burger",   cost: 0.94 },
  { min: 40, item: "Menu 4 Tenders",  cost: 1.93 },
  { min: 60, item: "Chef's Combo",    cost: 1.92 },
];
// Seuils en SCORE d'équipe — recalibrés à l'échelle « points courbés »
// (ADR 0028, ~48 pts/commande) ; anciens seuils membres×euros obsolètes.
const LEGACY_COMMUNITY_TIERS: GridTier[] = [
  { min: 500,  item: "Frites Medium",  cost: 0.24 },
  { min: 1500, item: "Churros 12 pcs", cost: 0.63 },
  { min: 3000, item: "Finest burger",  cost: 0.94 },
  { min: 6000, item: "Menu 4 Tenders", cost: 1.93 },
];

// Couches 2 et 3 : un cadeau d'équipe par palier franchi, pour chaque membre
// (ADR 0061 §7, lib/team-gifts.ts) — plus rien à résoudre ticket par ticket.

// ─── Grille pilotée par le catalogue (ADR 0013) ─────────────────────────────
// Les couches solo & communautaire lisent reward_tiers + menu_items. Le
// fallback grille héritée est réservé à LEGACY_RESTAURANT_ID (migration
// non-cassante) — partout ailleurs, couche non configurée = pas de cadeau.

export type GridTier = { min: number; item: string; cost: number };
export type RewardGrid = { solo: GridTier[]; community: GridTier[] };

type MenuItemEmbed = {
  name: string;
  cost_price: number | null; // NULL = coût inconnu (ADR 0046), jamais un cadeau
  is_active: boolean;
  reward_eligible: boolean;
};
type RewardTierRow = {
  layer: "solo" | "community" | "saver";
  min_threshold: number;
  menu_items: MenuItemEmbed | MenuItemEmbed[] | null;
};

export async function loadRewardGrid(restaurantId: string): Promise<RewardGrid> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("reward_tiers")
    .select("layer, min_threshold, menu_items(name, cost_price, is_active, reward_eligible)")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("min_threshold", { ascending: true });

  const grid: RewardGrid = { solo: [], community: [] };
  for (const r of (data ?? []) as unknown as RewardTierRow[]) {
    const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
    // Article retiré / hors cadeau — et jamais de cadeau au coût inconnu
    // (ADR 0046 : coût NULL admis au catalogue, exclu des récompenses,
    // sinon Number(null)=0 passerait tous les plafonds ADR 0017).
    if (!mi || !mi.is_active || !mi.reward_eligible || mi.cost_price == null) continue;
    // Filtre explicite par couche : les paliers 'saver' (ADR 0021, seuils en
    // POINTS de réserve) ne doivent jamais fuir dans la grille communautaire
    // (seuils en score d'équipe).
    if (r.layer !== "solo" && r.layer !== "community") continue;
    // ADR 0067 — le nom montré au membre (et figé dans son cadeau) : « 6 Churros ».
    const tier: GridTier = { min: Number(r.min_threshold), item: displayItemName(mi.name), cost: Number(mi.cost_price) };
    (r.layer === "solo" ? grid.solo : grid.community).push(tier);
  }

  // Fallback hérité Belchicken — uniquement pour l'établissement historique
  if (restaurantId === LEGACY_RESTAURANT_ID) {
    if (grid.solo.length === 0) grid.solo = LEGACY_SOLO_TIERS;
    if (grid.community.length === 0) grid.community = LEGACY_COMMUNITY_TIERS;
  }

  return grid;
}

// ADR 0061 §4 — le cadeau d'accueil du premier ticket : le premier cadeau de
// la grille solo (le plus petit palier), quel que soit le montant. Grille vide
// = pas de cadeau d'accueil (le ticket rapporte quand même ses points).
export function welcomeReward(grid: RewardGrid): RewardItem {
  const first = [...grid.solo].sort((a, b) => a.min - b.min)[0];
  return first ? { item: first.item, cost: first.cost } : { item: null, cost: 0 };
}

// Cadeau créé à la validation d'un ticket (ADR 0061).
// Plus de cadeau imposé par ticket : les points du ticket sont crédités par la
// base (déclencheur on_order_validated_points). Seul le PREMIER ticket validé
// d'un membre dans l'établissement reçoit un cadeau d'accueil : le premier
// cadeau de la grille solo. Les cadeaux d'équipe ne s'ajoutent plus à chaque
// ticket : un palier franchi offre un cadeau à chaque membre, une fois
// (ADR 0061 §7, lib/team-gifts.ts) — vérifié ici, à chaque validation.
// Idempotent: upsert ON CONFLICT (order_id) DO NOTHING; a 23505 on the
// partial index (one personal 'available' reward per member — ADR 0011) is
// also an expected no-op.
// ADR 0034 — `teamId` peut être null : un membre sans équipe envoie ses
// tickets comme les autres.
export async function createPendingReward(
  orderId: string,
  userId: string,
  teamId: string | null,
  restaurantId: string,
  amount: number
  // Retour : ce qui a RÉELLEMENT été créé — l'écran de succès (étape 07) titre
  // sur le cadeau obtenu, et ne doit jamais l'annoncer quand l'insert est un
  // no-op (cadeau déjà actif, ADR 0011, ou rien d'atteint).
): Promise<{ soloItem: string | null; created: boolean }> {
  const adminClient = createAdminClient();
  void amount; // le montant ne choisit plus le cadeau ; il fait les points (SQL)

  // Commande envoyée sans équipe puis validée après que le membre en a
  // rejoint une (file admin) : elle relève de cette équipe — même règle que
  // le trigger de score (m57). Une seule requête, et seulement dans ce cas.
  let effectiveTeamId = teamId;
  if (!effectiveTeamId) {
    const { data: membership } = await adminClient
      .from("memberships")
      .select("team_id")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    effectiveTeamId = (membership as { team_id: string | null } | null)?.team_id ?? null;
  }

  // Le score de l'équipe vient d'augmenter (déclencheur SQL) : palier franchi ?
  // Best-effort, ne bloque jamais la validation (le cron de 18 h rattrape).
  if (effectiveTeamId) await awardCrossedTeamTiers(restaurantId, effectiveTeamId);

  const [grid, { count: validatedCount }] = await Promise.all([
    loadRewardGrid(restaurantId),
    adminClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated"),
  ]);
  const solo = (validatedCount ?? 0) <= 1 ? welcomeReward(grid) : { item: null, cost: 0 };
  if (!solo.item) return { soloItem: null, created: false };

  const { data: inserted, error } = await adminClient.from("pending_rewards").upsert(
    {
      user_id: userId,
      restaurant_id: restaurantId,
      order_id: orderId,
      solo_item: solo.item,
      solo_cost: solo.cost > 0 ? solo.cost : null,
      status: "available",
    },
    { onConflict: "order_id", ignoreDuplicates: true }
  ).select("id");

  if (error) {
    // 23505 hors order_id = index partiel ADR 0011 (un seul cadeau personnel
    // 'available' par membre) — no-op attendu, pas une erreur
    if (error.code === "23505") return { soloItem: solo.item, created: false };
    throw new Error(`pending_rewards insert failed: ${error.message}`);
  }

  // Compteur budget : uniquement si une récompense a réellement été créée
  // (liste vide = conflit ignoré, rien distribué)
  const created = !!(inserted && inserted.length > 0);
  if (created) await incrementRewardsCost(restaurantId, solo.cost);
  return { soloItem: solo.item, created };
}
