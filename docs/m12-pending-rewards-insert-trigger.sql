-- ============================================================
-- M12 : Correction trigger pending_rewards
-- 1. Étend le trigger à AFTER INSERT OR UPDATE
--    (les commandes auto-validées sont des INSERTs directs avec status='validated'
--     et ne déclenchaient pas l'ancien trigger AFTER UPDATE)
-- 2. Corrige le nom de l'article : '4 Tenders Menu' → 'Menu 4 Tenders'
-- ============================================================

-- 1. Mettre à jour les lignes existantes avec l'ancien nom
UPDATE pending_rewards
  SET solo_item        = 'Menu 4 Tenders' WHERE solo_item        = '4 Tenders Menu';
UPDATE pending_rewards
  SET community_item   = 'Menu 4 Tenders' WHERE community_item   = '4 Tenders Menu';
UPDATE pending_rewards
  SET advancement_item = 'Menu 4 Tenders' WHERE advancement_item = '4 Tenders Menu';


-- 2. Nouvelle version de la fonction trigger (INSERT + UPDATE, noms corrects)
CREATE OR REPLACE FUNCTION calculate_pending_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id             UUID;
  v_restaurant_id       TEXT;
  v_team_score          NUMERIC;
  v_round_reached       TEXT;
  v_team_active         BOOLEAN;
  v_restaurant_unlocked BOOLEAN;
  v_solo_item           TEXT;
  v_solo_cost           NUMERIC(6,2);
  v_community_item      TEXT;
  v_community_cost      NUMERIC(6,2);
  v_advancement_item    TEXT;
  v_advancement_cost    NUMERIC(6,2);
BEGIN
  -- Déclencher uniquement quand status devient 'validated'
  IF NEW.status != 'validated' THEN RETURN NEW; END IF;
  -- Pour les UPDATE : ignorer si status était déjà 'validated'
  IF TG_OP = 'UPDATE' AND OLD.status = 'validated' THEN RETURN NEW; END IF;

  v_restaurant_id := NEW.restaurant_id;

  SELECT team_id INTO v_team_id
    FROM profiles WHERE id = NEW.user_id;

  IF v_team_id IS NULL THEN RETURN NEW; END IF;

  -- ── Couche 1 : Palier solo (pas de verrou) ──────────────────
  SELECT t_item, t_cost INTO v_solo_item, v_solo_cost
    FROM (VALUES
      (60::numeric, 'Chef''s Combo',  1.92::numeric),
      (40::numeric, 'Menu 4 Tenders', 1.93::numeric),
      (25::numeric, 'Finest burger',  0.94::numeric),
      (15::numeric, 'Churros 6 pcs',  0.31::numeric)
    ) AS t(t_threshold, t_item, t_cost)
    WHERE NEW.amount >= t_threshold
    ORDER BY t_threshold DESC
    LIMIT 1;

  -- ── Couche 2 : Bonus communautaire (double verrou) ──────────
  SELECT cs.score, tm.round_reached, tm.is_active
    INTO v_team_score, v_round_reached, v_team_active
    FROM community_scores cs
    JOIN teams tm ON tm.id = v_team_id
    WHERE cs.team_id       = v_team_id
      AND cs.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    (SELECT is_unlocked FROM restaurant_thresholds
      WHERE restaurant_id = v_restaurant_id
      ORDER BY created_at DESC LIMIT 1),
    false
  ) INTO v_restaurant_unlocked;

  IF v_restaurant_unlocked THEN
    SELECT t_item, t_cost INTO v_community_item, v_community_cost
      FROM (VALUES
        (10000::numeric, 'Menu 4 Tenders', 1.93::numeric),
        ( 6000::numeric, 'Finest burger',  0.94::numeric),
        ( 3000::numeric, 'Churros 12 pcs', 0.63::numeric),
        ( 1000::numeric, 'Frites Medium',  0.24::numeric)
      ) AS t(t_threshold, t_item, t_cost)
      WHERE v_team_score >= t_threshold
      ORDER BY t_threshold DESC
      LIMIT 1;
  END IF;

  -- ── Couche 3 : Récompense d'avancement (pas de verrou) ──────
  IF v_team_active THEN
    SELECT t_item, t_cost INTO v_advancement_item, v_advancement_cost
      FROM (VALUES
        ('final',         'Chef''s Combo',  1.92::numeric),
        ('semi_final',    'Menu 4 Tenders', 1.93::numeric),
        ('quarter_final', 'Finest burger',  0.94::numeric),
        ('round_of_16',   'Churros 6 pcs',  0.31::numeric)
      ) AS t(t_round, t_item, t_cost)
      WHERE v_round_reached = t_round
      LIMIT 1;
  END IF;

  IF v_solo_item       IS NOT NULL
  OR v_community_item  IS NOT NULL
  OR v_advancement_item IS NOT NULL
  THEN
    INSERT INTO pending_rewards (
      user_id, order_id, restaurant_id,
      solo_item,        solo_cost,
      community_item,   community_cost,
      advancement_item, advancement_cost
    ) VALUES (
      NEW.user_id, NEW.id, v_restaurant_id,
      v_solo_item,        v_solo_cost,
      v_community_item,   v_community_cost,
      v_advancement_item, v_advancement_cost
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Recréer le trigger en AFTER INSERT OR UPDATE
DROP TRIGGER IF EXISTS on_pending_reward_create ON orders;
CREATE TRIGGER on_pending_reward_create
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION calculate_pending_reward();
