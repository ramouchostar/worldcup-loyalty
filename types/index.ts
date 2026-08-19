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

// ADR 0031 — communauté déclarée par l'établissement (école, entreprise,
// quartier). Ce n'est PAS une équipe : ni score, ni membres, ni classement
// tant que `team_id` est NULL. Le premier membre qui s'y reconnaît matérialise
// l'équipe et en devient le capitaine.
export type TeamSuggestion = {
  id: string;
  restaurant_id: string;
  name: string;
  type: TeamType;
  zone: string | null;
  team_id: string | null;
  is_active: boolean;
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
  // ADR 0022 — RGPD : contrôle d'âge / mineurs + anonymisation
  birth_date: string | null;
  is_minor: boolean | null;
  parental_consent_status: ParentalConsentStatus;
  parental_email: string | null;
  anonymized_at: string | null;
};

export type OrderStatus = "pending" | "validated" | "rejected";

export type Order = {
  id: string;
  user_id: string;
  // ADR 0034 — NULL tant que le membre n'a pas d'équipe : la commande compte
  // pour lui (couche 1, points personnels), pas pour un score communautaire.
  team_id: string | null;
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

export type PendingRewardStatus = "pending" | "redeemed" | "expired" | "available" | "banked";

export type PendingReward = {
  id: string;
  user_id: string;
  order_id: string | null; // NULL = cadeau échangé depuis la réserve (ADR 0021)
  restaurant_id: string;
  solo_item: string | null;
  solo_cost: number | null;
  community_item: string | null;
  community_cost: number | null;
  advancement_item: string | null;
  advancement_cost: number | null;
  status: PendingRewardStatus;
  source: "order" | "saver";
  created_at: string;
  redeemed_at: string | null;
  banked_at: string | null;
};

// ADR 0021 — mouvement de la réserve de points personnelle (deltas en
// points, jamais d'euros côté membre)
export type PointTransaction = {
  id: string;
  delta: number;
  reason: "bank_reward" | "exchange_gift" | "admin_adjust";
  created_at: string;
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

export type RewardLayer = "solo" | "community" | "saver";

// Palier → article du catalogue (remplace les grilles codées en dur)
export type RewardTier = {
  id: string;
  restaurant_id: string;
  layer: RewardLayer;
  min_threshold: number; // montant de commande (solo), score équipe (community) ou points de réserve (saver)
  menu_item_id: string | null;
  is_active: boolean;
};

// ─── Conformité RGPD (ADR 0022) ──────────────────────────────────────────────

export type ConsentPurpose =
  | "programme"
  | "marketing_push"
  | "marketing_whatsapp"
  | "insights_commerciaux"
  | "zones";

export type Consent = {
  id: string;
  user_id: string;
  purpose: ConsentPurpose;
  granted: boolean;
  policy_version: string;
  source: string | null;
  created_at: string;
};

export type ParentalConsentStatus = "none" | "pending" | "granted";

export type DataRequest = {
  id: string;
  user_id: string | null;
  type: "export" | "deletion";
  status: "pending" | "completed" | "failed";
  requested_at: string;
  completed_at: string | null;
};

// ─── Canal qualité privé — « note inversée » (ADR 0023) ───────────────────────

// Intention d'abord (jamais mitigé) : encouragement (positif, prénom visible)
// vs incident (négatif, anonyme par défaut).
export type FeedbackSentiment = "encouragement" | "incident";

// Axes opérationnels d'un signalement — cochés, jamais notés 1-5.
export type FeedbackDimension = "accuracy" | "wait" | "quality" | "welcome";

export type FeedbackStatus = "new" | "acknowledged" | "resolved";

export type QualityFeedback = {
  id: string;
  user_id: string;
  restaurant_id: string;
  order_id: string | null;
  sentiment: FeedbackSentiment;
  dimensions: FeedbackDimension[];
  comment: string | null;
  is_anonymous: boolean;
  contact_opt_in: boolean;
  occurred_at: string | null;
  status: FeedbackStatus;
  moderation_status: "visible" | "flagged" | "hidden";
  created_at: string;
};

// Fil de service recovery médié par la plateforme (le resto n'a jamais le contact brut).
export type FeedbackMessage = {
  id: string;
  feedback_id: string;
  restaurant_id: string;
  sender: "member" | "establishment";
  body: string;
  channel: string;
  created_at: string;
};

// Baromètre de confiance (ADR 0023 §8) — état + tendance + décomposition,
// JAMAIS une note chiffrée. Réservé au restaurateur (miroir ADR 0007).
export type BarometerState = "insufficient" | "good" | "watch" | "tense";
export type BarometerTrend = "up" | "flat" | "down" | "na"; // up = s'améliore (moins d'incidents)

export type BarometerDimensionCount = { dimension: FeedbackDimension; count: number };

export type Barometer = {
  state: BarometerState;
  trend: BarometerTrend;
  encouragements: number;
  incidents: number;
  unresolved: number;
  topDimensions: BarometerDimensionCount[];
  totalFeedback: number;
};

// Vue resto d'un retour — contexte GROSSI, JAMAIS d'identifiant, de contact,
// de Bestelnummer ni d'heure à la minute (ADR 0023 §4-§5). authorName = prénom
// uniquement pour un encouragement non anonyme ; null sinon.
export type AdminFeedbackItem = {
  id: string;
  sentiment: FeedbackSentiment;
  dimensions: FeedbackDimension[];
  comment: string | null;
  status: FeedbackStatus;
  contactOptIn: boolean;
  createdAt: string;
  weekday: string;
  slot: string;
  authorName: string | null;
  messages: FeedbackMessage[];
};
