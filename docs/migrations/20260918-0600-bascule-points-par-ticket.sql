-- ============================================================
-- 2026-09-18 06:00 — LA BASCULE : chaque ticket validé rapporte ses points
-- (ADR 0061, PR 4 sur 6)
--
-- ⚠️ À appliquer APRÈS 20260918-0420 (fondations) et 20260918-0500
-- (catalogue) — vérifié en tête de fichier.
-- ⚠️ À appliquer JUSTE APRÈS la fusion de la PR « bascule » : c'est le code de
-- cette PR qui arrête le cadeau imposé par ticket ; sans ce déclencheur, les
-- tickets validés entre les deux ne rapporteraient ni cadeau ni points.
--
-- Quoi :
--   1. Déclencheur `on_order_validated_points` : au passage d'une commande à
--      `validated` — quel que soit le chemin (envoi membre, validation admin
--      unitaire ou groupée, sauvetage plateforme, bac à sable) — la base
--      crédite ses points personnels (10 par euro), disponibles 4 h après
--      (`credit_order_points`, idempotent : un crédit par commande au plus).
--      Même garde que le score d'équipe (`on_order_validated`, m59).
--   2. `refund_catalog_reward` : un cadeau choisi avec ses points (catalogue,
--      ou ancien gros cadeau de réserve) qui expire sans avoir été récupéré
--      REND ses points au membre (et son coût au budget) — appelé par le
--      balayage horaire d'expiration. Sans lui, le client perdait ses points.
--
-- Sans cette migration : les tickets ne rapportent pas de points (seul le
-- cadeau d'accueil du premier ticket est créé). Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'credit_order_points') THEN
    RAISE EXCEPTION 'Appliquer d''abord 20260918-0420-points-par-ticket-fondations.sql';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM one_shot_data_migrations WHERE name = 'adr0061_conversion_soldes') THEN
    RAISE EXCEPTION 'Appliquer d''abord 20260918-0500-catalogue-mes-points.sql';
  END IF;
END $$;

-- 1. Crédit des points à la validation ---------------------------------------
CREATE OR REPLACE FUNCTION credit_points_on_validation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN
    PERFORM credit_order_points(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION credit_points_on_validation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_order_validated_points ON orders;
CREATE TRIGGER on_order_validated_points
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION credit_points_on_validation();

-- 2. Un cadeau choisi avec ses points et jamais récupéré rend ses points -----
CREATE OR REPLACE FUNCTION refund_catalog_reward(p_reward_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_user_id UUID;
  v_restaurant_id TEXT;
  v_cost NUMERIC;
  v_debit INTEGER;
  v_inserted INTEGER;
BEGIN
  SELECT user_id, restaurant_id, solo_cost INTO v_user_id, v_restaurant_id, v_cost
  FROM pending_rewards
  WHERE id = p_reward_id AND status = 'expired' AND source IN ('catalog', 'saver');
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT -delta INTO v_debit
  FROM point_transactions
  WHERE reward_id = p_reward_id AND reason = 'exchange_gift';
  IF v_debit IS NULL OR v_debit <= 0 THEN RETURN 0; END IF;

  -- UNIQUE (reward_id, reason) : un seul remboursement par cadeau.
  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, reward_id)
  VALUES (v_user_id, v_restaurant_id, v_debit, 'admin_adjust', p_reward_id)
  ON CONFLICT (reward_id, reason) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 AND COALESCE(v_cost, 0) > 0 THEN
    PERFORM increment_reward_budget(v_restaurant_id, 0, -v_cost);
  END IF;
  RETURN CASE WHEN v_inserted > 0 THEN v_debit ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION refund_catalog_reward(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refund_catalog_reward(UUID) TO service_role;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger WHERE tgname = 'on_order_validated_points';  -- 1 ligne
--   Après le prochain ticket validé :
--   SELECT reason, delta, available_at FROM point_transactions
--    WHERE reason = 'order_points' ORDER BY created_at DESC LIMIT 5;
