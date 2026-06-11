-- ============================================================
-- M21 : ADR 0012 — Plafond de budget cadeaux + double verrou croissance
--
-- 1. reward_budget_tracking : compteurs mensuels par établissement
--    (CA programme + coût cadeaux distribués). Pas de cron : les
--    compteurs sont incrémentés dans la même requête que la
--    validation via increment_reward_budget().
-- 2. restaurant_thresholds : baseline hebdo + cible de croissance
--    pour le double verrou basé sur la croissance (plus de montant
--    absolu).
-- ============================================================

CREATE TABLE IF NOT EXISTS reward_budget_tracking (
  id                     UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id          TEXT          NOT NULL,
  period_month           DATE          NOT NULL,            -- premier jour du mois
  program_revenue        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- CA généré via le programme
  rewards_cost           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- coût réel distribué
  budget_pct             NUMERIC(4,3)  NOT NULL DEFAULT 0.08,
  community_bonus_active BOOLEAN       NOT NULL DEFAULT true,
  UNIQUE (restaurant_id, period_month)
);

-- RLS sans policy : lecture/écriture via service role uniquement.
-- Les données budget/CA ne transitent JAMAIS vers le client (ADR 0007).
ALTER TABLE reward_budget_tracking ENABLE ROW LEVEL SECURITY;

-- Baseline CA pour le double verrou croissance (ADR 0012 garde-fou 2)
ALTER TABLE restaurant_thresholds
  ADD COLUMN IF NOT EXISTS baseline_weekly_revenue NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS growth_target_pct NUMERIC(4,3) DEFAULT 0.10;

-- Incrément atomique des compteurs du mois courant (un seul round-trip,
-- pas de course entre deux validations simultanées). Recalcule
-- community_bonus_active au passage — pas besoin de job.
CREATE OR REPLACE FUNCTION increment_reward_budget(
  p_restaurant_id TEXT,
  p_revenue NUMERIC DEFAULT 0,
  p_cost NUMERIC DEFAULT 0
) RETURNS VOID AS $$
  INSERT INTO reward_budget_tracking (restaurant_id, period_month, program_revenue, rewards_cost)
  VALUES (p_restaurant_id, date_trunc('month', CURRENT_DATE)::date, p_revenue, p_cost)
  ON CONFLICT (restaurant_id, period_month) DO UPDATE SET
    program_revenue = reward_budget_tracking.program_revenue + EXCLUDED.program_revenue,
    rewards_cost    = reward_budget_tracking.rewards_cost    + EXCLUDED.rewards_cost,
    community_bonus_active =
      (reward_budget_tracking.rewards_cost + EXCLUDED.rewards_cost)
      < (reward_budget_tracking.program_revenue + EXCLUDED.program_revenue)
        * reward_budget_tracking.budget_pct;
$$ LANGUAGE sql SECURITY DEFINER;
