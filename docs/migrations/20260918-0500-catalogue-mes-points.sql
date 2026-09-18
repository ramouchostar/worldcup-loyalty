-- ============================================================
-- 2026-09-18 05:00 — Le catalogue « Mes points » (ADR 0061, PR 3 sur 6)
--
-- ⚠️ À appliquer APRÈS 20260918-0420-points-par-ticket-fondations.sql
-- (vérifié en tête de fichier : la migration s'arrête sinon, sans rien toucher).
--
-- Quoi :
--   1. `bank_reward` (« Mettre de côté », encore là jusqu'à la bascule)
--      crédite des points PROPORTIONNELS (10 par euro) au lieu des points
--      courbés : la même échelle que le catalogue (ADR 0061 §1).
--   2. Conversion UNIQUE des soldes existants, à valeur égale en « tickets
--      moyens » (ADR 0061 §9) : nouveau = ancien × (10 × panier moyen)
--      ÷ points_for_order(panier moyen), par une écriture `admin_adjust`.
--      Garde-fou : marqueur `one_shot_data_migrations` — rejouer ne convertit
--      pas deux fois.
--   3. Les gros cadeaux de la réserve (`reward_tiers` couche `saver`) sont
--      désactivés : le catalogue les remplace, et leurs seuils étaient en
--      points courbés.
--   4. Photos : les articles de Houba et De Bue reprennent la photo de
--      l'article du même nom à Kraainem (même carte Belchicken, bucket public
--      `menu-images` : le fichier n'est pas dupliqué, seul le chemin l'est).
--
-- Sans cette migration : la page « Mes points » affiche le catalogue avec les
-- anciens soldes (en points courbés, donc bas) ; rien ne casse.
-- Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'personal_points_for_order') THEN
    RAISE EXCEPTION 'Appliquer d''abord 20260918-0420-points-par-ticket-fondations.sql';
  END IF;
END $$;

-- 1. Mettre de côté : points proportionnels ---------------------------------
CREATE OR REPLACE FUNCTION bank_reward(p_reward_id UUID, p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_reward  pending_rewards%ROWTYPE;
  v_amount  NUMERIC;
  v_points  INTEGER;
  v_cost    NUMERIC;
BEGIN
  UPDATE pending_rewards SET status = 'banked', banked_at = NOW()
  WHERE id = p_reward_id AND user_id = p_user_id
    AND status = 'available' AND order_id IS NOT NULL
  RETURNING * INTO v_reward;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT amount INTO v_amount FROM orders WHERE id = v_reward.order_id;
  IF v_amount IS NULL OR v_amount <= 0 THEN RETURN 0; END IF;
  v_points := personal_points_for_order(v_amount);
  IF v_points <= 0 THEN RETURN 0; END IF;

  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, reward_id, order_id)
  VALUES (p_user_id, v_reward.restaurant_id, v_points, 'bank_reward', p_reward_id, v_reward.order_id)
  ON CONFLICT (reward_id, reason) DO NOTHING;

  v_cost := COALESCE(v_reward.solo_cost, 0)
          + COALESCE(v_reward.community_cost, 0)
          + COALESCE(v_reward.advancement_cost, 0);
  IF v_cost > 0 THEN
    PERFORM increment_reward_budget(v_reward.restaurant_id, 0, -v_cost);
  END IF;

  RETURN v_points;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION bank_reward(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bank_reward(UUID, UUID) TO service_role;

-- 2. Conversion unique des soldes -------------------------------------------
CREATE TABLE IF NOT EXISTS one_shot_data_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE one_shot_data_migrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM one_shot_data_migrations WHERE name = 'adr0061_conversion_soldes') THEN
    INSERT INTO point_transactions (user_id, restaurant_id, delta, reason)
    SELECT s.user_id, s.restaurant_id, s.converted - s.balance, 'admin_adjust'
    FROM (
      SELECT b.user_id, b.restaurant_id, b.balance,
             ROUND(b.balance * (10 * average_basket(b.restaurant_id))
                   / NULLIF(points_for_order(average_basket(b.restaurant_id)), 0))::int AS converted
      FROM (
        SELECT user_id, restaurant_id, SUM(delta)::int AS balance
        FROM point_transactions
        GROUP BY user_id, restaurant_id
      ) b
      WHERE b.balance > 0
    ) s
    WHERE s.converted IS NOT NULL AND s.converted <> s.balance;

    INSERT INTO one_shot_data_migrations (name) VALUES ('adr0061_conversion_soldes');
  END IF;
END $$;

-- 3. Les gros cadeaux de la réserve cèdent la place au catalogue -------------
UPDATE reward_tiers SET is_active = false WHERE layer = 'saver' AND is_active;

-- 4. Photos de Kraainem pour Houba et De Bue ---------------------------------
UPDATE menu_items h
SET image_path = k.image_path,
    image_source = COALESCE(k.image_source, 'import') || ' · reprise de kraainem'
FROM menu_items k
WHERE k.restaurant_id = 'kraainem'
  AND h.restaurant_id IN ('houba', 'de-bue')
  AND lower(k.name) = lower(h.name)
  AND k.image_path IS NOT NULL
  AND h.image_path IS NULL;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT restaurant_id, user_id, SUM(delta) AS solde
--     FROM point_transactions GROUP BY 1, 2 ORDER BY 1;          -- soldes ≈ × 4 à 5
--   SELECT * FROM one_shot_data_migrations WHERE name = 'adr0061_conversion_soldes';
--   SELECT restaurant_id, COUNT(*) FILTER (WHERE image_path IS NOT NULL) AS photos, COUNT(*)
--     FROM menu_items WHERE restaurant_id IN ('kraainem','houba','de-bue') GROUP BY 1;
--   SELECT COUNT(*) FROM reward_tiers WHERE layer = 'saver' AND is_active;  -- 0
