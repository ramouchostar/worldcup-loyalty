-- ============================================================
-- 2026-09-19 09:00 — Taux cadeaux par établissement ; Kraainem à 4 %
-- (ADR 0012 / 0017 / 0061 amendés)
--
-- Demande du propriétaire de Kraainem : le Magnifique Beef Menu à 51 € de
-- tickets est trop généreux, il veut que les clients dépensent 2 fois plus.
-- Prix d'un cadeau = coût ÷ taux × 10 : doubler la dépense = DIVISER le taux
-- par 2 → 4 % (16 % aurait fait l'inverse : Beef Menu à 25 €). Décision du
-- porteur : TOUTE la logique de Kraainem passe à 4 %.
--
-- Quoi :
--   1. Table `restaurant_reward_settings` (service role uniquement) :
--      `budget_pct` = part des dépenses rendue en cadeaux, propre à
--      l'établissement et durable (le `budget_pct` de `reward_budget_tracking`
--      est par mois et repartait à 8 % chaque 1er du mois).
--   2. Il pilote tout : prix du catalogue (`catalog_price_points`), plafond
--      mensuel (ADR 0012, `reward_budget_tracking.budget_pct` recopié sur le
--      mois en cours et les suivants, y compris les mois créés plus tard),
--      couverture des cadeaux d'équipe (ADR 0017), plafonds de paliers, cadeau
--      4 jetons, anniversaire (côté code : `getRestaurantBudgetPct`).
--   3. Kraainem : 4 %.
--   4. Kraainem : les soldes existants sont DOUBLÉS une fois (choix du
--      porteur) — personne ne perd ce qu'il a déjà gagné ; seuls les
--      prochains tickets suivent le nouveau taux. Écriture `admin_adjust`
--      par membre, marqueur `one_shot_data_migrations` (rejouer ne double pas
--      deux fois). Au 2026-09-19 : 9 membres, 2 392 points → 4 784.
--
-- Sans cette migration : 8 % partout, comme avant. Idempotente.
-- ============================================================

-- 1. Réglage durable -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_reward_settings (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  budget_pct    NUMERIC(4,3) CHECK (budget_pct IS NULL OR (budget_pct > 0 AND budget_pct <= 0.2)),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE restaurant_reward_settings ENABLE ROW LEVEL SECURITY; -- service-role only

-- 2a. Un mois de budget créé plus tard prend le taux de l'établissement ------
CREATE OR REPLACE FUNCTION apply_restaurant_budget_pct()
RETURNS TRIGGER AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  SELECT budget_pct INTO v_pct FROM restaurant_reward_settings WHERE restaurant_id = NEW.restaurant_id;
  IF v_pct IS NOT NULL THEN NEW.budget_pct := v_pct; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS on_budget_month_insert ON reward_budget_tracking;
CREATE TRIGGER on_budget_month_insert
  BEFORE INSERT ON reward_budget_tracking
  FOR EACH ROW EXECUTE FUNCTION apply_restaurant_budget_pct();

-- 2b. Un changement de taux s'applique au mois en cours et aux suivants ------
CREATE OR REPLACE FUNCTION sync_restaurant_budget_pct()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.budget_pct IS NOT NULL THEN
    UPDATE reward_budget_tracking
       SET budget_pct = NEW.budget_pct,
           community_bonus_active = rewards_cost < program_revenue * NEW.budget_pct
     WHERE restaurant_id = NEW.restaurant_id
       AND period_month >= date_trunc('month', CURRENT_DATE)::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS on_restaurant_budget_pct_change ON restaurant_reward_settings;
CREATE TRIGGER on_restaurant_budget_pct_change
  AFTER INSERT OR UPDATE OF budget_pct ON restaurant_reward_settings
  FOR EACH ROW EXECUTE FUNCTION sync_restaurant_budget_pct();

REVOKE ALL ON FUNCTION apply_restaurant_budget_pct() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_restaurant_budget_pct() FROM PUBLIC, anon, authenticated;

-- 2c. Le prix en points lit le taux de l'établissement d'abord ---------------
CREATE OR REPLACE FUNCTION catalog_price_points(p_restaurant_id TEXT, p_cost NUMERIC)
RETURNS INTEGER AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN RETURN NULL; END IF;
  SELECT budget_pct INTO v_pct FROM restaurant_reward_settings WHERE restaurant_id = p_restaurant_id;
  IF v_pct IS NULL THEN
    SELECT budget_pct INTO v_pct
    FROM reward_budget_tracking
    WHERE restaurant_id = p_restaurant_id
    ORDER BY period_month DESC LIMIT 1;
  END IF;
  v_pct := COALESCE(NULLIF(v_pct, 0), 0.08);
  RETURN (CEIL(p_cost / v_pct * 10 / 5) * 5)::int;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION catalog_price_points(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_price_points(TEXT, NUMERIC) TO service_role;

-- 3 et 4. Kraainem : 4 %, soldes doublés une fois -------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM one_shot_data_migrations WHERE name = 'kraainem_budget_4pct') THEN
    INSERT INTO restaurant_reward_settings (restaurant_id, budget_pct)
    VALUES ('kraainem', 0.04)
    ON CONFLICT (restaurant_id) DO UPDATE SET budget_pct = 0.04, updated_at = NOW();

    INSERT INTO point_transactions (user_id, restaurant_id, delta, reason)
    SELECT user_id, restaurant_id, SUM(delta), 'admin_adjust'
    FROM point_transactions
    WHERE restaurant_id = 'kraainem'
    GROUP BY user_id, restaurant_id
    HAVING SUM(delta) > 0;

    INSERT INTO one_shot_data_migrations (name) VALUES ('kraainem_budget_4pct');
  END IF;
END $$;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT budget_pct FROM restaurant_reward_settings WHERE restaurant_id = 'kraainem';            -- 0.040
--   SELECT period_month, budget_pct, community_bonus_active FROM reward_budget_tracking
--    WHERE restaurant_id = 'kraainem' ORDER BY period_month DESC LIMIT 2;                          -- septembre : 0.040
--   SELECT item_name, price_points FROM catalog_items('kraainem') WHERE item_name = 'Magnifique Beef Menu';  -- 1020
--   SELECT SUM(delta) FROM point_transactions WHERE restaurant_id = 'kraainem';                    -- ≈ 4 784 (+ tickets depuis)
