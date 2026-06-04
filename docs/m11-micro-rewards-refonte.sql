-- ============================================================
-- M11 — Micro-rewards refonte (jetons sans preuve)
-- Idempotente : sûre à relancer
-- ============================================================

-- 1. restaurant_id sur micro_rewards (isolation multi-établissement)
ALTER TABLE micro_rewards
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

-- 2. restaurant_id sur micro_reward_claims
ALTER TABLE micro_reward_claims
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

-- 3. Mettre à jour la contrainte CHECK micro_rewards
--    Retire social_share, ajoute instagram_follow / tiktok_follow / facebook_follow
ALTER TABLE micro_rewards
  DROP CONSTRAINT IF EXISTS micro_rewards_type_check;

ALTER TABLE micro_rewards
  ADD CONSTRAINT micro_rewards_type_check
  CHECK (type IN ('google_review', 'instagram_follow', 'tiktok_follow', 'facebook_follow'));

-- 4. Supprimer les anciennes lignes obsolètes (social_share, referral, social_follow)
DELETE FROM micro_rewards
  WHERE type IN ('social_share', 'referral', 'social_follow');

-- 5. Insérer / mettre à jour les 4 actions sociales (idempotent via ON CONFLICT)
--    Si la table est vide ou manque des types, on les insère
INSERT INTO micro_rewards (type, title, description, gift_item, gift_cost_euros, is_active)
VALUES
  ('google_review',   'Avis Google 5 ⭐',     'Laisse un avis 5 étoiles sur Google Maps', 'Churros 12 pcs', 0.63, true),
  ('instagram_follow','Suivre sur Instagram',  'Abonne-toi à notre compte Instagram',       'Churros 12 pcs', 0.63, true),
  ('tiktok_follow',   'Suivre sur TikTok',     'Abonne-toi à notre compte TikTok',          'Churros 12 pcs', 0.63, true),
  ('facebook_follow', 'Suivre sur Facebook',   'Abonne-toi à notre page Facebook',          'Churros 12 pcs', 0.63, true)
ON CONFLICT DO NOTHING;

-- 6. Vérification finale
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'micro_rewards' AND column_name = 'restaurant_id')       AS micro_rewards_restaurant_id,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'micro_reward_claims' AND column_name = 'restaurant_id') AS claims_restaurant_id,
  (SELECT COUNT(*) FROM micro_rewards WHERE is_active = true)                    AS active_rewards;
