-- ============================================================
-- 2026-09-19 09:00 — Taux du catalogue « Mes points » par établissement ;
-- Kraainem à 4 % (ADR 0061 amendé)
--
-- Demande du propriétaire de Kraainem : le Magnifique Beef Menu à 51 € de
-- tickets est trop généreux, il veut que les clients dépensent 2 fois plus.
-- Prix d'un article = coût ÷ taux × 10 : doubler la dépense = DIVISER le taux
-- par 2 → 4 % (16 % aurait fait l'inverse : Beef Menu à 25 €).
--
-- Quoi :
--   1. Table `restaurant_reward_settings` (service role uniquement) :
--      `catalogue_budget_pct` = part des dépenses rendue en cadeaux du
--      CATALOGUE. Durable (le `budget_pct` de `reward_budget_tracking` est
--      par mois et repart à 8 % chaque 1er du mois). Ne touche ni le plafond
--      mensuel du budget cadeaux (ADR 0012) ni la couverture des cadeaux
--      d'équipe (ADR 0017) : ils restent sur `budget_pct`.
--   2. `catalog_price_points` lit ce taux d'abord, puis `budget_pct`, puis 8 %.
--      `exchange_points_for_item` s'en sert déjà : le débit suit le prix affiché.
--   3. Kraainem : taux 4 %.
--   4. Kraainem : les soldes existants sont DOUBLÉS une fois (choix du
--      porteur) — personne ne perd ce qu'il a déjà gagné ; seuls les
--      prochains tickets suivent le nouveau taux. Écriture `admin_adjust`
--      par membre, marqueur `one_shot_data_migrations` (rejouer ne double pas
--      deux fois). Au 2026-09-19 : 9 membres, 2 392 points → 4 784.
--
-- Sans cette migration : le catalogue reste à 8 % partout. Idempotente.
-- ============================================================

-- 1. Réglage durable -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_reward_settings (
  restaurant_id        TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  catalogue_budget_pct NUMERIC(4,3)
    CHECK (catalogue_budget_pct IS NULL OR (catalogue_budget_pct > 0 AND catalogue_budget_pct <= 0.2)),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE restaurant_reward_settings ENABLE ROW LEVEL SECURITY; -- service-role only

-- 2. Le prix en points lit le taux du catalogue d'abord -------------------------
CREATE OR REPLACE FUNCTION catalog_price_points(p_restaurant_id TEXT, p_cost NUMERIC)
RETURNS INTEGER AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN RETURN NULL; END IF;
  SELECT catalogue_budget_pct INTO v_pct
  FROM restaurant_reward_settings
  WHERE restaurant_id = p_restaurant_id;
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
  IF NOT EXISTS (SELECT 1 FROM one_shot_data_migrations WHERE name = 'kraainem_catalogue_4pct') THEN
    INSERT INTO restaurant_reward_settings (restaurant_id, catalogue_budget_pct)
    VALUES ('kraainem', 0.04)
    ON CONFLICT (restaurant_id) DO UPDATE SET catalogue_budget_pct = 0.04, updated_at = NOW();

    INSERT INTO point_transactions (user_id, restaurant_id, delta, reason)
    SELECT user_id, restaurant_id, SUM(delta), 'admin_adjust'
    FROM point_transactions
    WHERE restaurant_id = 'kraainem'
    GROUP BY user_id, restaurant_id
    HAVING SUM(delta) > 0;

    INSERT INTO one_shot_data_migrations (name) VALUES ('kraainem_catalogue_4pct');
  END IF;
END $$;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT catalogue_budget_pct FROM restaurant_reward_settings WHERE restaurant_id = 'kraainem';  -- 0.040
--   SELECT item_name, price_points FROM catalog_items('kraainem') WHERE item_name = 'Magnifique Beef Menu';  -- 1020
--   SELECT SUM(delta) FROM point_transactions WHERE restaurant_id = 'kraainem';  -- ≈ 4 784 (+ tickets depuis)
