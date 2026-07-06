// Type d'équipe communautaire (ADR 0014) — sert au ciblage des broadcasts
export type TeamType = "ecole" | "entreprise" | "rue_quartier" | "taxis" | "autre";

export type Team = {
  id: string;
  name: string;
  restaurant_id: string | null; // NULL = ancienne équipe nationale globale (WC)
  type: TeamType;
  created_by: string | null;
  join_code: string | null;
  flag_emoji: string; // avatar de l'équipe (emoji par type)
  is_active: boolean;
  zone: string | null; // ville/quartier de l'équipe — découverte par zone (ADR 0018)
  created_at: string;
};

// Couche 3 — palier de dépense cumulée d'équipe (ADR 0014)
export type TeamRewardKind = "percent" | "free_item";

export type TeamTier = {
  id: string;
  restaurant_id: string;
  threshold_spent: number;
  reward_kind: TeamRewardKind;
  percent_value: number | null; // si percent
  menu_item_id: string | null;  // si free_item (catalogue, ADR 0013)
  is_active: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  team_id: string | null;
  is_admin: boolean;
  zones: string[]; // 1 à 3 zones (vie/travail/école) — découverte d'équipes (ADR 0018)
  joined_at: string;
};

export type OrderStatus = "pending" | "validated" | "rejected";

export type Order = {
  id: string;
  user_id: string;
  team_id: string;
  amount: number;
  order_number: string | null;
  order_date: string;
  order_time: string | null;
  duplicate_key: string;
  receipt_url: string | null;
  status: OrderStatus;
  rejection_reason: string | null;
  validated_at: string | null;
  submitted_at: string;
};

// ADR 0020 — ligne d'article lue sur le ticket (best effort). Données perso
// du membre : unit_price en euros autorisé, comme "Mes stats" (ADR 0007).
export type OrderItem = {
  id: string;
  order_id: string;
  line_index: number;
  raw_name: string;
  quantity: number;
  unit_price: number | null;
  menu_item_id: string | null;
  created_at: string;
};

export type CommunityScore = {
  team_id: string;
  member_count: number;
  total_spent: number;
  score: number;
  last_updated: string;
};

export type Reward = {
  id: string;
  level: number;
  score_threshold: number;
  title: string;
  description: string;
  gift_details: string | null;
  cost_euros: number;
  requires_purchase: boolean;
  is_active: boolean;
  restaurant_id: string;
  min_member_count: number;
  created_at: string;
  updated_at: string;
};

export type MicroRewardType =
  | "google_review"
  | "instagram_follow"
  | "tiktok_follow"
  | "facebook_follow";

export type MicroReward = {
  id: string;
  type: MicroRewardType;
  title: string;
  description: string;
  // Champs coûts : surfaces admin uniquement, jamais renvoyés côté membre (ADR 0007/0017)
  gift_item?: string;
  gift_cost_euros?: number;
  is_active: boolean;
};

export type ClaimStatus = "pending" | "validated" | "rejected";

export type MicroRewardClaim = {
  id: string;
  user_id: string;
  reward_type: MicroRewardType;
  proof_url: string | null;
  status: ClaimStatus;
  claimed_at: string;
};

export type Referral = {
  id: string;
  referrer_id: string;
  referee_id: string;
  restaurant_id: string;
  referred_at: string;
};

export type ReferralLinkData = {
  code: string;
  conversions: number;
  referrals: Referral[];
  validatedCount: number;
};

export type Transfer = {
  id: string;
  user_id: string;
  from_team_id: string | null;
  to_team_id: string;
  transferred_at: string;
};

export type RestaurantThreshold = {
  id: string;
  period_label: string;
  target_revenue: number;
  current_revenue: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
  restaurant_id: string;
  created_at: string;
  baseline_weekly_revenue: number | null;
  growth_target_pct: number | null;
};

export type PendingRewardStatus = "pending" | "redeemed" | "expired" | "available";

export type PendingReward = {
  id: string;
  user_id: string;
  order_id: string;
  restaurant_id: string;
  solo_item: string | null;
  solo_cost: number | null;
  community_item: string | null;
  community_cost: number | null;
  advancement_item: string | null;
  advancement_cost: number | null;
  status: PendingRewardStatus;
  created_at: string;
  redeemed_at: string | null;
};

// ─── Catalogue menu & coûts (ADR 0013) ───────────────────────────────────────

export type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  category: string;
  menu_price: number;   // prix de vente carte (valeur perçue)
  cost_price: number;   // prix de revient réel
  is_active: boolean;
  reward_eligible: boolean;
  created_at: string;
  updated_at: string;
};

export type RewardLayer = "solo" | "community";

// Palier → article du catalogue (remplace les grilles codées en dur)
export type RewardTier = {
  id: string;
  restaurant_id: string;
  layer: RewardLayer;
  min_threshold: number; // montant de commande (solo) ou score équipe (community)
  menu_item_id: string | null;
  is_active: boolean;
};
