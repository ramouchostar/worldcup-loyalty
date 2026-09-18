-- ============================================================
-- 2026-09-18 04:20 — Points par ticket et catalogue : les fondations
-- (ADR 0061, PR 2 sur 6)
--
-- Quoi : prépare la base du modèle « les cadeaux se choisissent avec ses
-- points », SANS rien changer au service :
--   1. registre `point_transactions` : raison `order_points` (points d'un
--      ticket), colonne `available_at` (points en attente 4 h, ADR 0061 §2),
--      un seul crédit par commande (index unique partiel) ;
--   2. `pending_rewards.source` accepte `catalog` (cadeau choisi au catalogue) ;
--   3. `personal_points_for_order` : 10 points par euro (ADR 0061 §1) ;
--   4. `get_points_balance` ne compte plus les points encore en attente, et
--      `get_points_summary` rend disponible / en attente / prochaine échéance ;
--   5. `credit_order_points` : crédite une commande validée (idempotent) —
--      appelée par le déclencheur de la PR « bascule », pas encore posé ici ;
--   6. `catalog_price_points` : prix en points calculé depuis le prix de
--      revient (arrondi au 5 supérieur de coût ÷ 8 % × 10, ADR 0061 §3) ;
--   7. `catalog_items` : le catalogue d'un établissement (nom, catégorie,
--      photo, prix en points — jamais le prix de revient, ADR 0007) ;
--   8. `exchange_points_for_item` : échanger ses points contre n'importe quel
--      article du catalogue (mêmes garde-fous que exchange_points_for_gift :
--      verrou par membre, un cadeau à la fois, budget ADR 0012).
--
-- Rien n'appelle encore ces fonctions et aucun déclencheur n'est posé : le
-- service est inchangé. Aucune ligne existante n'a de `available_at`, donc
-- les soldes actuels ne bougent pas.
--
-- Sécurité (constat du 2026-09-18) : toutes les fonctions SECURITY DEFINER de
-- ce fichier sont réservées au rôle serveur et fixent leur search_path.
--
-- Sans cette migration : rien ne casse (code tolérant). Idempotente.
-- ============================================================

-- 1. Registre des points ------------------------------------------------------
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

ALTER TABLE point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
ALTER TABLE point_transactions ADD CONSTRAINT point_transactions_reason_check
  CHECK (reason IN ('bank_reward', 'exchange_gift', 'admin_adjust', 'order_points'));

-- Un seul crédit de points par commande, quel que soit le chemin de validation.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_point_tx_order_points
  ON point_transactions (order_id)
  WHERE reason = 'order_points';

-- 2. Cadeau choisi au catalogue ----------------------------------------------
ALTER TABLE pending_rewards DROP CONSTRAINT IF EXISTS pending_rewards_source_check;
ALTER TABLE pending_rewards ADD CONSTRAINT pending_rewards_source_check
  CHECK (source IN ('order', 'saver', 'birthday', 'catalog'));

-- 3. Points personnels d'une commande : proportionnels, 10 par euro ----------
--    (les points d'équipe restent courbés : points_for_order, m47)
CREATE OR REPLACE FUNCTION personal_points_for_order(p_amount NUMERIC)
RETURNS INTEGER AS $$
  SELECT GREATEST(0, ROUND(COALESCE(p_amount, 0) * 10))::int;
$$ LANGUAGE sql IMMUTABLE;

-- 4. Solde disponible et résumé ----------------------------------------------
CREATE OR REPLACE FUNCTION get_points_balance(p_user_id UUID, p_restaurant_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE(SUM(delta), 0)::int FROM point_transactions
  WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id
    AND (available_at IS NULL OR available_at <= NOW());
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION get_points_summary(p_user_id UUID, p_restaurant_id TEXT)
RETURNS TABLE (available INTEGER, pending INTEGER, next_available_at TIMESTAMPTZ) AS $$
  SELECT
    COALESCE(SUM(pt.delta) FILTER (WHERE pt.available_at IS NULL OR pt.available_at <= NOW()), 0)::int,
    COALESCE(SUM(pt.delta) FILTER (WHERE pt.available_at > NOW()), 0)::int,
    MIN(pt.available_at) FILTER (WHERE pt.available_at > NOW())
  FROM point_transactions pt
  WHERE pt.user_id = p_user_id AND pt.restaurant_id = p_restaurant_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- 5. Crédit d'une commande validée -------------------------------------------
--    Idempotent (index unique partiel) ; points disponibles 4 h après la
--    validation (ADR 0061 §2, même règle que l'ADR 0011 amendé).
CREATE OR REPLACE FUNCTION credit_order_points(p_order_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_user_id UUID;
  v_restaurant_id TEXT;
  v_amount NUMERIC;
  v_status TEXT;
  v_validated_at TIMESTAMPTZ;
  v_points INTEGER;
  v_inserted INTEGER;
BEGIN
  SELECT user_id, restaurant_id, amount, status, validated_at
    INTO v_user_id, v_restaurant_id, v_amount, v_status, v_validated_at
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR v_status <> 'validated' THEN RETURN 0; END IF;

  v_points := personal_points_for_order(v_amount);
  IF v_points <= 0 THEN RETURN 0; END IF;

  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, order_id, available_at)
  VALUES (v_user_id, v_restaurant_id, v_points, 'order_points', p_order_id,
          COALESCE(v_validated_at, NOW()) + INTERVAL '4 hours')
  ON CONFLICT (order_id) WHERE reason = 'order_points' DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN CASE WHEN v_inserted > 0 THEN v_points ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 6. Prix en points d'un article (calculé, jamais saisi) ---------------------
--    arrondi au 5 supérieur de : prix de revient ÷ taux budget × 10.
--    Arrondi vers le haut : le coût reste ≤ 8 % des dépenses qui ont produit
--    les points. NULL si le coût est inconnu ou nul (hors catalogue).
CREATE OR REPLACE FUNCTION catalog_price_points(p_restaurant_id TEXT, p_cost NUMERIC)
RETURNS INTEGER AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN RETURN NULL; END IF;
  SELECT budget_pct INTO v_pct
  FROM reward_budget_tracking
  WHERE restaurant_id = p_restaurant_id
  ORDER BY period_month DESC LIMIT 1;
  v_pct := COALESCE(NULLIF(v_pct, 0), 0.08);
  RETURN (CEIL(p_cost / v_pct * 10 / 5) * 5)::int;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

-- 7. Le catalogue d'un établissement -----------------------------------------
--    Articles actifs, « cadeau possible », au coût connu. Jamais le coût.
CREATE OR REPLACE FUNCTION catalog_items(p_restaurant_id TEXT)
RETURNS TABLE (item_id UUID, item_name TEXT, category TEXT, image_path TEXT, price_points INTEGER) AS $$
  SELECT mi.id, mi.name, mi.category, mi.image_path, catalog_price_points(p_restaurant_id, mi.cost_price)
  FROM menu_items mi
  WHERE mi.restaurant_id = p_restaurant_id
    AND mi.is_active AND mi.reward_eligible
    AND mi.cost_price IS NOT NULL AND mi.cost_price > 0
  ORDER BY 5, 2;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- 8. Échanger ses points contre un article du catalogue ----------------------
CREATE OR REPLACE FUNCTION exchange_points_for_item(
  p_user_id UUID, p_restaurant_id TEXT, p_item_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_item_name TEXT;
  v_item_cost NUMERIC;
  v_price INTEGER;
  v_balance INTEGER;
  v_reward_id UUID;
BEGIN
  -- Même verrou que exchange_points_for_gift : deux échanges simultanés du
  -- même membre ne peuvent pas dépenser deux fois le même solde.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_restaurant_id));

  SELECT mi.name, mi.cost_price INTO v_item_name, v_item_cost
  FROM menu_items mi
  WHERE mi.id = p_item_id AND mi.restaurant_id = p_restaurant_id
    AND mi.is_active AND mi.reward_eligible
    AND mi.cost_price IS NOT NULL AND mi.cost_price > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_item'; END IF;

  v_price := catalog_price_points(p_restaurant_id, v_item_cost);
  v_balance := get_points_balance(p_user_id, p_restaurant_id);
  IF v_balance < v_price THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  -- Un cadeau à la fois (ADR 0011) : l'index un-seul-actif lève 23505 et
  -- annule toute la transaction, débit compris.
  INSERT INTO pending_rewards (user_id, restaurant_id, order_id, solo_item, solo_cost, status, source)
  VALUES (p_user_id, p_restaurant_id, NULL, v_item_name, v_item_cost, 'available', 'catalog')
  RETURNING id INTO v_reward_id;

  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, reward_id)
  VALUES (p_user_id, p_restaurant_id, -v_price, 'exchange_gift', v_reward_id);

  PERFORM increment_reward_budget(p_restaurant_id, 0, v_item_cost);

  RETURN v_reward_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 9. Réservé au rôle serveur -------------------------------------------------
REVOKE ALL ON FUNCTION get_points_balance(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_points_summary(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION credit_order_points(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_price_points(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_items(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION exchange_points_for_item(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_points_balance(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_points_summary(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION credit_order_points(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_price_points(TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_items(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION exchange_points_for_item(UUID, TEXT, UUID) TO service_role;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT personal_points_for_order(18.44);                 -- 184
--   SELECT catalog_price_points('kraainem', 4.33);           -- 545
--   SELECT catalog_price_points('kraainem', 0.25);           -- 35
--   SELECT item_name, price_points FROM catalog_items('kraainem') LIMIT 10;
--   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
--     FROM pg_proc p
--    WHERE p.proname IN ('get_points_summary','credit_order_points','catalog_items','exchange_points_for_item');
--   → anon = false partout.
