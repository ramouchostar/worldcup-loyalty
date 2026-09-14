-- ============================================================
-- 20260914-1932 — La réserve en points courbés (ADR 0060)
--
-- QUOI
--   1. `average_basket(restaurant)` : panier moyen des 1 000 dernières
--      commandes validées (miroir de lib/avg-basket.ts, défaut 25 €).
--   2. `saver_cost_cap(restaurant, seuil, budget_pct)` : plafond de coût d'un
--      gros cadeau de réserve, le seuil (en points courbés) étant converti en
--      dépense estimée via le panier moyen (miroir de saverCostCap).
--   3. `bank_reward` crédite `points_for_order(montant)` (m47) au lieu de
--      `FLOOR(montant)`.
--   4. `exchange_points_for_gift` re-vérifie le plafond avec saver_cost_cap.
--   5. Données, une seule fois (marqueur `one_shot_data_migrations`) :
--      a) soldes : écriture de compensation `admin_adjust` par cadeau déjà
--         mis de côté (ledger append-only, jamais de modification) ;
--      b) seuils `saver` existants convertis d'euros en points courbés ;
--      c) Kraainem : trois gros cadeaux par défaut (≈ 4, 8, 12 tickets
--         moyens), article le plus généreux sous le plafond, s'il n'en a
--         aucun d'actif.
--
-- POURQUOI
--   La réserve créditait le montant du ticket (1 point = 1 €) : « +25 »
--   révélait 25 €, contraire à l'ADR 0028 (zéro euro côté client, points
--   non-inversibles). Suivi noté dès m47.
--
-- SÉCURITÉ
--   average_basket et saver_cost_cap manipulent des euros : SECURITY DEFINER,
--   EXECUTE retiré à anon / authenticated (jamais appelables côté client).
--
-- SI LA MIGRATION N'EST PAS APPLIQUÉE
--   L'app continue de fonctionner : le serveur crédite encore FLOOR(montant)
--   et vérifie l'ancien plafond. Seul l'affichage « +N » avant « Mettre de
--   côté » montre déjà les points courbés — l'écart se résorbe à
--   l'application.
--
-- Idempotente : fonctions en CREATE OR REPLACE ; données protégées par le
-- marqueur. Rejouable sans effet.
-- ============================================================

BEGIN;

-- 1. Panier moyen (euros — service role et fonctions internes uniquement)
CREATE OR REPLACE FUNCTION average_basket(p_restaurant_id TEXT)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(AVG(amount), 25)
  FROM (
    SELECT amount FROM orders
    WHERE restaurant_id = p_restaurant_id AND status = 'validated'
    ORDER BY submitted_at DESC
    LIMIT 1000
  ) recent;
$$;
REVOKE ALL ON FUNCTION average_basket(TEXT) FROM PUBLIC, anon, authenticated;

-- 2. Plafond de coût d'un gros cadeau de réserve (ADR 0017 + ADR 0060) :
--    seuil ÷ points d'un ticket moyen = nombre de tickets moyens ;
--    × panier moyen × budget % = part du budget cadeaux qu'ils ont financée.
CREATE OR REPLACE FUNCTION saver_cost_cap(p_restaurant_id TEXT, p_threshold NUMERIC, p_budget_pct NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC;
  v_pts INTEGER;
BEGIN
  v_avg := average_basket(p_restaurant_id);
  v_pts := points_for_order(v_avg);
  IF v_pts IS NULL OR v_pts <= 0 THEN RETURN 0; END IF;
  RETURN p_threshold / v_pts * v_avg * COALESCE(p_budget_pct, 0.08);
END;
$$;
REVOKE ALL ON FUNCTION saver_cost_cap(TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- 3. Mettre de côté — crédit en points courbés (reste identique à m33 sinon)
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
  v_points := points_for_order(v_amount);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Échange — plafond re-vérifié en points courbés (reste identique à m33)
CREATE OR REPLACE FUNCTION exchange_points_for_gift(
  p_user_id UUID, p_restaurant_id TEXT, p_tier_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_threshold NUMERIC;
  v_item_name TEXT;
  v_item_cost NUMERIC;
  v_budget_pct NUMERIC;
  v_balance INTEGER;
  v_reward_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_restaurant_id));

  SELECT rt.min_threshold, mi.name, mi.cost_price
    INTO v_threshold, v_item_name, v_item_cost
  FROM reward_tiers rt
  JOIN menu_items mi ON mi.id = rt.menu_item_id
  WHERE rt.id = p_tier_id AND rt.restaurant_id = p_restaurant_id
    AND rt.layer = 'saver' AND rt.is_active
    AND mi.is_active AND mi.reward_eligible;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_tier'; END IF;

  SELECT COALESCE(budget_pct, 0.08) INTO v_budget_pct
  FROM reward_budget_tracking
  WHERE restaurant_id = p_restaurant_id
  ORDER BY period_month DESC LIMIT 1;
  IF v_item_cost > saver_cost_cap(p_restaurant_id, v_threshold, v_budget_pct) THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  v_balance := get_points_balance(p_user_id, p_restaurant_id);
  IF v_balance < v_threshold THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  INSERT INTO pending_rewards (user_id, restaurant_id, order_id, solo_item, solo_cost, status, source)
  VALUES (p_user_id, p_restaurant_id, NULL, v_item_name, v_item_cost, 'available', 'saver')
  RETURNING id INTO v_reward_id;

  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, reward_id)
  VALUES (p_user_id, p_restaurant_id, -v_threshold::int, 'exchange_gift', v_reward_id);

  IF v_item_cost > 0 THEN
    PERFORM increment_reward_budget(p_restaurant_id, 0, v_item_cost);
  END IF;

  RETURN v_reward_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Données — une seule fois
CREATE TABLE IF NOT EXISTS one_shot_data_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE one_shot_data_migrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM one_shot_data_migrations WHERE name = '20260914-reserve-points-courbes') THEN
    RETURN;
  END IF;

  -- 5a. Soldes : compensation par cadeau mis de côté. Le crédit d'origine
  --     (FLOOR(montant)) reste dans le ledger ; l'écart vers les points
  --     courbés s'ajoute en `admin_adjust` (UNIQUE(reward_id, reason) :
  --     une compensation par cadeau, au plus). Les crédits sans commande
  --     (compte démo) ne sont pas recalculables : laissés tels quels.
  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, reward_id, order_id)
  SELECT pt.user_id, pt.restaurant_id, points_for_order(o.amount) - pt.delta,
         'admin_adjust', pt.reward_id, pt.order_id
  FROM point_transactions pt
  JOIN orders o ON o.id = pt.order_id
  WHERE pt.reason = 'bank_reward'
    AND pt.reward_id IS NOT NULL
    AND points_for_order(o.amount) <> pt.delta
  ON CONFLICT (reward_id, reason) DO NOTHING;

  -- 5b. Seuils de réserve existants : euros → points courbés, par
  --     établissement (seuil ÷ panier moyen × points d'un ticket moyen),
  --     arrondis à 5.
  UPDATE reward_tiers rt
  SET min_threshold = GREATEST(
    5,
    round(rt.min_threshold / average_basket(rt.restaurant_id)
          * points_for_order(average_basket(rt.restaurant_id)) / 5) * 5
  )
  WHERE rt.layer = 'saver';

  -- 5c. Kraainem : gros cadeaux par défaut s'il n'en a aucun d'actif
  --     (décision du porteur, 2026-09-14). Même règle que la génération par
  --     défaut : l'article le plus généreux (prix carte) sous le plafond, à
  --     prix égal le moins coûteux.
  IF EXISTS (SELECT 1 FROM restaurants WHERE id = 'kraainem')
     AND NOT EXISTS (
       SELECT 1 FROM reward_tiers
       WHERE restaurant_id = 'kraainem' AND layer = 'saver' AND is_active
     ) THEN
    INSERT INTO reward_tiers (restaurant_id, layer, min_threshold, menu_item_id, is_active)
    SELECT 'kraainem', 'saver', b.band,
      (
        SELECT mi.id FROM menu_items mi
        WHERE mi.restaurant_id = 'kraainem'
          AND mi.is_active AND mi.reward_eligible
          AND mi.cost_price IS NOT NULL AND mi.cost_price > 0
          AND mi.cost_price <= saver_cost_cap('kraainem', b.band, p.pct)
        ORDER BY mi.menu_price DESC NULLS LAST, mi.cost_price ASC
        LIMIT 1
      ),
      true
    FROM (
      SELECT points_for_order(average_basket('kraainem')) AS pts,
             COALESCE((SELECT budget_pct FROM reward_budget_tracking
                       WHERE restaurant_id = 'kraainem'
                       ORDER BY period_month DESC LIMIT 1), 0.08) AS pct
    ) p
    CROSS JOIN LATERAL (
      SELECT DISTINCT GREATEST(5, round(m * p.pts / 5.0) * 5) AS band
      FROM unnest(ARRAY[4, 8, 12]) AS m
    ) b
    ON CONFLICT (restaurant_id, layer, min_threshold)
    DO UPDATE SET menu_item_id = EXCLUDED.menu_item_id, is_active = true;
  END IF;

  INSERT INTO one_shot_data_migrations (name) VALUES ('20260914-reserve-points-courbes');
END;
$$;

COMMIT;
