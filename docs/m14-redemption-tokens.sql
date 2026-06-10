-- ============================================================
-- M14 — Coupon de récupération anti-fraude (ADR 0011)
-- 1. Étend le CHECK status à 'available'
-- 2. Migre les 'pending' existants → 'available' (1 par membre) ou 'expired'
-- 3. Crée la table redemption_tokens
-- 4. Index partiel unique : un seul cadeau 'available' par membre/resto
-- 5. Met à jour le trigger : status='available' + ON CONFLICT DO NOTHING
-- ============================================================


-- 1. Étendre le CHECK statut (M6 avait ajouté 'expired', on ajoute 'available')
ALTER TABLE pending_rewards DROP CONSTRAINT IF EXISTS pending_rewards_status_check;
ALTER TABLE pending_rewards ADD CONSTRAINT pending_rewards_status_check
  CHECK (status IN ('pending', 'redeemed', 'expired', 'available'));


-- 2. Migration : le plus récent 'pending' par (user_id, restaurant_id) → 'available'
--    Les autres → 'expired' (fenêtre 48h probablement dépassée)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, restaurant_id
           ORDER BY created_at DESC
         ) AS rn
  FROM pending_rewards
  WHERE status = 'pending'
)
UPDATE pending_rewards
SET status = CASE WHEN ranked.rn = 1 THEN 'available' ELSE 'expired' END
FROM ranked
WHERE pending_rewards.id = ranked.id;


-- 3. Table redemption_tokens
CREATE TABLE IF NOT EXISTS redemption_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reward_id     UUID REFERENCES pending_rewards(id) ON DELETE CASCADE NOT NULL,
  restaurant_id TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,   -- created_at + 10 minutes
  redeemed_at   TIMESTAMPTZ            -- NULL jusqu'à validation cashier
);

ALTER TABLE redemption_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "redemption_tokens_own_read" ON redemption_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_redemption_tokens_token
  ON redemption_tokens (token);


-- 4. Index partiel unique : un seul cadeau 'available' par membre/restaurant
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_reward_per_member
  ON pending_rewards (user_id, restaurant_id)
  WHERE status = 'available';


-- 5. Mise à jour du trigger : insert avec status='available' + ON CONFLICT DO NOTHING
--    (ON CONFLICT sans cible gère à la fois l'unicité order_id et l'index partiel)
CREATE OR REPLACE FUNCTION calculate_pending_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id             UUID;
  v_restaurant_id       TEXT;
  v_team_score          NUMERIC;
  v_round_reached       TEXT;
  v_team_active         BOOLEAN;
  v_restaurant_unlocked BOOLEAN;
  v_solo_item           TEXT;
  v_solo_cost           NUMERIC(6,2);
  v_community_item      TEXT;
  v_community_cost      NUMERIC(6,2);
  v_advancement_item    TEXT;
  v_advancement_cost    NUMERIC(6,2);
BEGIN
  IF NEW.status != 'validated' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'validated' THEN RETURN NEW; END IF;

  v_restaurant_id := NEW.restaurant_id;

  SELECT team_id INTO v_team_id
    FROM profiles WHERE id = NEW.user_id;

  IF v_team_id IS NULL THEN RETURN NEW; END IF;

  SELECT t_item, t_cost INTO v_solo_item, v_solo_cost
    FROM (VALUES
      (60::numeric, 'Chef''s Combo',  1.92::numeric),
      (40::numeric, 'Menu 4 Tenders', 1.93::numeric),
      (25::numeric, 'Finest burger',  0.94::numeric),
      (15::numeric, 'Churros 6 pcs',  0.31::numeric)
    ) AS t(t_threshold, t_item, t_cost)
    WHERE NEW.amount >= t_threshold
    ORDER BY t_threshold DESC
    LIMIT 1;

  SELECT cs.score, tm.round_reached, tm.is_active
    INTO v_team_score, v_round_reached, v_team_active
    FROM community_scores cs
    JOIN teams tm ON tm.id = v_team_id
    WHERE cs.team_id       = v_team_id
      AND cs.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    (SELECT is_unlocked FROM restaurant_thresholds
      WHERE restaurant_id = v_restaurant_id
      ORDER BY created_at DESC LIMIT 1),
    false
  ) INTO v_restaurant_unlocked;

  IF v_restaurant_unlocked THEN
    SELECT t_item, t_cost INTO v_community_item, v_community_cost
      FROM (VALUES
        (10000::numeric, 'Menu 4 Tenders', 1.93::numeric),
        ( 6000::numeric, 'Finest burger',  0.94::numeric),
        ( 3000::numeric, 'Churros 12 pcs', 0.63::numeric),
        ( 1000::numeric, 'Frites Medium',  0.24::numeric)
      ) AS t(t_threshold, t_item, t_cost)
      WHERE v_team_score >= t_threshold
      ORDER BY t_threshold DESC
      LIMIT 1;
  END IF;

  IF v_team_active THEN
    SELECT t_item, t_cost INTO v_advancement_item, v_advancement_cost
      FROM (VALUES
        ('final',         'Chef''s Combo',  1.92::numeric),
        ('semi_final',    'Menu 4 Tenders', 1.93::numeric),
        ('quarter_final', 'Finest burger',  0.94::numeric),
        ('round_of_16',   'Churros 6 pcs',  0.31::numeric)
      ) AS t(t_round, t_item, t_cost)
      WHERE v_round_reached = t_round
      LIMIT 1;
  END IF;

  IF v_solo_item IS NOT NULL
  OR v_community_item IS NOT NULL
  OR v_advancement_item IS NOT NULL
  THEN
    INSERT INTO pending_rewards (
      user_id, order_id, restaurant_id,
      solo_item,        solo_cost,
      community_item,   community_cost,
      advancement_item, advancement_cost,
      status
    ) VALUES (
      NEW.user_id, NEW.id, v_restaurant_id,
      v_solo_item,        v_solo_cost,
      v_community_item,   v_community_cost,
      v_advancement_item, v_advancement_cost,
      'available'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
