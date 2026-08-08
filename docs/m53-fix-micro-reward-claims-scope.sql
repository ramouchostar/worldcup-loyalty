-- m53 — Corrige la fuite multi-établissement de la Carte Actions.
--
-- Bug : UNIQUE(user_id, reward_type) posée en m2, jamais mise à jour après
-- l'ajout de restaurant_id (m3/m11). Un membre qui avait déjà réclamé une
-- action (avis Google, follow Instagram/TikTok/Facebook) dans un restaurant
-- se voyait bloqué par cette contrainte — et les lectures API/notifications
-- non filtrées par restaurant_id (app/api/micro-rewards/route.ts,
-- lib/member-strategies.ts) affichaient ces actions comme déjà validées
-- dans TOUS les autres restaurants, y compris un nouveau restaurant où le
-- membre n'a jamais rien soumis.

-- Rows créées avant m11 (restaurant_id ajouté après coup) appartiennent au
-- seul restaurant qui existait à l'époque (LEGACY_RESTAURANT_ID, lib/rewards.ts).
UPDATE micro_reward_claims SET restaurant_id = 'kraainem' WHERE restaurant_id IS NULL;

ALTER TABLE micro_reward_claims
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE micro_reward_claims
  DROP CONSTRAINT IF EXISTS micro_reward_claims_user_id_reward_type_key;

ALTER TABLE micro_reward_claims
  ADD CONSTRAINT micro_reward_claims_user_id_restaurant_id_reward_type_key
  UNIQUE (user_id, restaurant_id, reward_type);
