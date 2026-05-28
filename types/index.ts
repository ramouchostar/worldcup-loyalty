export type Team = {
  id: string;
  name: string;
  flag_emoji: string;
  country_code: string;
  is_active: boolean;
  eliminated_at: string | null;
  round_reached: string;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  team_id: string | null;
  is_admin: boolean;
  joined_at: string;
};

export type OrderStatus = "pending" | "validated" | "rejected";

export type Order = {
  id: string;
  user_id: string;
  team_id: string;
  amount: number;
  order_date: string;
  order_time: string;
  duplicate_key: string;
  status: OrderStatus;
  rejection_reason: string | null;
  validated_at: string | null;
  submitted_at: string;
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
  gift_item: string;
  gift_cost_euros: number;
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

export type ReferralStatus = "pending" | "validated" | "rejected";

export type ReferralSubmission = {
  id: string;
  user_id: string;
  restaurant_id: string;
  referral_email: string;
  status: ReferralStatus;
  submitted_at: string;
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
  created_at: string;
};
