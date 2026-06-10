-- M17 : Corrections liste des équipes + trigger advancement
--
-- Erreurs constatées le 2026-06-10 :
--   - Albanie (AL) présente mais non qualifiée
--   - Italie (IT) présente mais non qualifiée
--   - Curaçao (CW) absente mais qualifiée (CONCACAF)
--
-- Inclut aussi le correctif du trigger (précédemment dans m15b, jamais appliqué).
-- Si m15b a déjà été exécuté, le CREATE OR REPLACE est idempotent (sans effet).

-- ── 1. Éliminer les équipes non qualifiées ───────────────────────────────────
UPDATE teams SET is_active = false, eliminated_at = NOW()
WHERE country_code IN ('AL', 'IT') AND is_active = true;

-- ── 2. Ajouter Curaçao (qualifiée via CONCACAF) ──────────────────────────────
INSERT INTO teams (name, flag_emoji, country_code, is_active, round_reached)
VALUES ('Curaçao', '🇨🇼', 'CW', true, 'group_stage')
ON CONFLICT (country_code) DO UPDATE
  SET is_active    = true,
      eliminated_at = NULL,
      round_reached = 'group_stage';

-- Ajouter une entrée community_scores pour Curaçao dans chaque restaurant
INSERT INTO community_scores (team_id, restaurant_id, member_count, total_spent)
SELECT t.id, cs_existing.restaurant_id, 0, 0
FROM teams t
CROSS JOIN (SELECT DISTINCT restaurant_id FROM community_scores) cs_existing
WHERE t.country_code = 'CW'
ON CONFLICT DO NOTHING;

-- ── 3. Corriger le trigger calculate_pending_reward() ────────────────────────
-- Grille correcte (CONTEXT.md) :
--   round_of_32 → PAS de bonus
--   round_of_16 → Churros 6 pcs
--   quarter_final → Finest burger
--   semi_final → Menu 4 Tenders
--   final/winner → Chef's Combo

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
  IF NEW.status != 'validated' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'validated' THEN RETURN NEW; END IF;

  v_restaurant_id := NEW.restaurant_id;

  SELECT team_id INTO v_team_id
    FROM profiles WHERE id = NEW.user_id;

  IF v_team_id IS NULL THEN RETURN NEW; END IF;

  -- Couche 1 — palier solo
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

  -- Couche 2 — bonus communautaire (double verrou)
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

  -- Couche 3 — récompense d'avancement (commence aux huitièmes, pas aux seizièmes)
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

  IF v_solo_item IS NOT NULL
  OR v_community_item IS NOT NULL
  OR v_advancement_item IS NOT NULL
  THEN
    INSERT INTO pending_rewards (
      user_id, order_id, restaurant_id,
      solo_item,        solo_cost,
      community_item,   community_cost,
      advancement_item, advancement_cost,
      status
    ) VALUES (
      NEW.user_id, NEW.id, v_restaurant_id,
      v_solo_item,        v_solo_cost,
      v_community_item,   v_community_cost,
      v_advancement_item, v_advancement_cost,
      'available'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
