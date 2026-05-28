-- ============================================================
-- M3 — Refonte micro-rewards + support multi-établissement
-- Exécuter dans Supabase : SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- ÉTAPE 1 : Ajout restaurant_id aux tables existantes
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

-- community_scores : PK passe de team_id seul à (team_id, restaurant_id)
ALTER TABLE community_scores
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT NOT NULL DEFAULT 'molenbeek';

ALTER TABLE community_scores DROP CONSTRAINT IF EXISTS community_scores_pkey;
ALTER TABLE community_scores ADD PRIMARY KEY (team_id, restaurant_id);
ALTER TABLE community_scores ALTER COLUMN restaurant_id DROP DEFAULT;

-- Insérer les scores initiaux pour anderlecht et schaerbeek
INSERT INTO community_scores (team_id, restaurant_id, member_count, total_spent)
SELECT id, 'anderlecht', 0, 0 FROM teams
ON CONFLICT DO NOTHING;

INSERT INTO community_scores (team_id, restaurant_id, member_count, total_spent)
SELECT id, 'schaerbeek', 0, 0 FROM teams
ON CONFLICT DO NOTHING;

ALTER TABLE micro_rewards
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

ALTER TABLE micro_reward_claims
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;


-- ============================================================
-- ÉTAPE 2 : Nouveau catalogue micro_rewards (jetons sociaux)
-- ============================================================

TRUNCATE TABLE micro_reward_claims;
TRUNCATE TABLE micro_rewards;

ALTER TABLE micro_rewards
  DROP CONSTRAINT IF EXISTS micro_rewards_type_check;
ALTER TABLE micro_rewards
  ADD CONSTRAINT micro_rewards_type_check
  CHECK (type IN ('google_review', 'instagram_follow', 'tiktok_follow', 'facebook_follow'));

ALTER TABLE micro_reward_claims
  DROP CONSTRAINT IF EXISTS micro_reward_claims_reward_type_check;
ALTER TABLE micro_reward_claims
  ADD CONSTRAINT micro_reward_claims_reward_type_check
  CHECK (reward_type IN ('google_review', 'instagram_follow', 'tiktok_follow', 'facebook_follow'));

DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['molenbeek', 'anderlecht', 'schaerbeek'] LOOP
    INSERT INTO micro_rewards (type, title, description, gift_item, gift_cost_euros, is_active, restaurant_id) VALUES
      ('google_review',    'Avis Google ⭐',      'Laisse un avis 5 étoiles sur notre fiche Google Maps', 'Jeton', 0, true, r),
      ('instagram_follow', 'Follow Instagram 📸', 'Suis notre compte Instagram Belchicken',                'Jeton', 0, true, r),
      ('tiktok_follow',    'Follow TikTok 🎵',    'Suis notre compte TikTok Belchicken',                   'Jeton', 0, true, r),
      ('facebook_follow',  'Follow Facebook 👍',  'Suis notre page Facebook Belchicken',                   'Jeton', 0, true, r);
  END LOOP;
END $$;


-- ============================================================
-- ÉTAPE 3 : Table referral_submissions
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_submissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restaurant_id TEXT        NOT NULL,
  referral_email TEXT       NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'validated', 'rejected')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referral_email)
);

ALTER TABLE referral_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_own_read" ON referral_submissions;
CREATE POLICY "referrals_own_read" ON referral_submissions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "referrals_own_insert" ON referral_submissions;
CREATE POLICY "referrals_own_insert" ON referral_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- ÉTAPE 4 : Mise à jour des triggers (multi-établissement)
-- ============================================================

-- Trigger 1 : orders → community_scores (filtre par restaurant_id)
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated' AND OLD.status != 'validated' THEN
    UPDATE community_scores
    SET total_spent  = total_spent + NEW.amount,
        last_updated = NOW()
    WHERE team_id       = NEW.team_id
      AND restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 2 : changement d'équipe → member_count
CREATE OR REPLACE FUNCTION update_member_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    UPDATE community_scores
    SET member_count = member_count - 1
    WHERE team_id       = OLD.team_id
      AND restaurant_id = COALESCE(OLD.restaurant_id, NEW.restaurant_id);
  END IF;
  IF NEW.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    UPDATE community_scores
    SET member_count = member_count + 1
    WHERE team_id       = NEW.team_id
      AND restaurant_id = COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 4 : premier choix d'équipe → member_count
CREATE OR REPLACE FUNCTION handle_first_team_join()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.team_id IS NULL AND NEW.team_id IS NOT NULL THEN
    UPDATE community_scores
    SET member_count = member_count + 1
    WHERE team_id       = NEW.team_id
      AND restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- ÉTAPE 5 : Index
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_restaurant
  ON profiles(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant
  ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_community_scores_restaurant
  ON community_scores(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_micro_reward_claims_restaurant
  ON micro_reward_claims(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_referral_submissions_user_restaurant
  ON referral_submissions(user_id, restaurant_id);
