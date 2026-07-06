-- ============================================================
-- M33 : ADR 0021 — réserve de points personnelle
-- Le membre peut « mettre de côté » son cadeau disponible : il est
-- converti en points personnels (1 pt = 1 € du montant de la
-- commande), le slot « un seul cadeau actif » (ADR 0011) est libéré,
-- et les points s'échangent plus tard contre un gros cadeau
-- (paliers reward_tiers layer='saver', plafond ADR 0017).
-- Le score communautaire n'est PAS touché : il est crédité à la
-- validation de la commande, avant tout choix du membre.
-- ============================================================

-- 1. pending_rewards : statut 'banked', traçabilité, cadeaux 'saver'
--    sans commande (order_id nullable).
ALTER TABLE pending_rewards ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE pending_rewards DROP CONSTRAINT IF EXISTS pending_rewards_status_check;
ALTER TABLE pending_rewards ADD CONSTRAINT pending_rewards_status_check
  CHECK (status IN ('pending', 'redeemed', 'expired', 'available', 'banked'));
ALTER TABLE pending_rewards
  ADD COLUMN IF NOT EXISTS banked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'order'
    CHECK (source IN ('order', 'saver'));
-- NB : l'index partiel idx_one_active_reward_per_member (m14,
-- WHERE status = 'available') reste inchangé — 'banked' libère le
-- slot par construction.

-- 2. reward_tiers : couche 'saver' (min_threshold en POINTS)
ALTER TABLE reward_tiers DROP CONSTRAINT IF EXISTS reward_tiers_layer_check;
ALTER TABLE reward_tiers ADD CONSTRAINT reward_tiers_layer_check
  CHECK (layer IN ('solo', 'community', 'saver'));

-- 3. Ledger de points personnels — append-only, jamais d'UPDATE.
--    UNIQUE(reward_id, reason) = idempotence structurelle : un cadeau
--    ne peut être crédité qu'une fois ni débité qu'une fois.
CREATE TABLE IF NOT EXISTS point_transactions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  delta         INTEGER NOT NULL,      -- +floor(montant) au bank, -seuil à l'échange
  reason        TEXT NOT NULL CHECK (reason IN ('bank_reward', 'exchange_gift', 'admin_adjust')),
  reward_id     UUID REFERENCES pending_rewards(id) ON DELETE SET NULL,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reward_id, reason)
);
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
-- Lecture : le membre voit ses propres mouvements (deltas en points,
-- jamais d'euros — ADR 0007). Écritures : RPC SECURITY DEFINER uniquement.
CREATE POLICY "point_transactions_own_read" ON point_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_point_tx_user
  ON point_transactions (user_id, restaurant_id);

-- 4. Solde = somme du ledger (volumétrie minuscule, SUM instantané)
CREATE OR REPLACE FUNCTION get_points_balance(p_user_id UUID, p_restaurant_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE(SUM(delta), 0)::int FROM point_transactions
  WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Mettre de côté — atomique + idempotent (double-clic = no-op).
--    Retourne les points crédités, 0 si rien à banker.
--    Un cadeau 'saver' (order_id NULL) n'est PAS bankable : pas de
--    boucle points → cadeau → points.
--    ADR 0012 : le coût du cadeau non distribué est re-crédité au
--    budget du mois (increment_reward_budget accepte un coût négatif).
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
  v_points := FLOOR(COALESCE(v_amount, 0));
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

-- 6. Échange points → gros cadeau. Sérialisé par (membre, resto) via
--    advisory lock. Crée un pending_rewards 'available' standard
--    (cycle coupon 10 min / cashier inchangé, ADR 0011) : un 23505 sur
--    l'index partiel un-seul-actif fait rollback TOUT (pas de débit
--    orphelin). Le plafond ADR 0017 est re-vérifié au moment de
--    l'échange sur le cost_price réel de l'article.
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

  -- Plafond ADR 0017 : 1 pt = 1 € dépensé → coût ≤ seuil × budget_pct
  SELECT COALESCE(budget_pct, 0.08) INTO v_budget_pct
  FROM reward_budget_tracking
  WHERE restaurant_id = p_restaurant_id
  ORDER BY period_month DESC LIMIT 1;
  IF v_item_cost > v_threshold * COALESCE(v_budget_pct, 0.08) THEN
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
