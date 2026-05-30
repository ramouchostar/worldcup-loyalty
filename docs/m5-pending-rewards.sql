-- ============================================================
-- M5 : Récompenses en attente (pending_rewards)
-- Nouvelle architecture 3 couches calculées à chaque commande validée :
-- Couche 1 — Palier solo (montant commande, pas de verrou)
-- Couche 2 — Bonus communautaire (score équipe, double verrou)
-- Couche 3 — Récompense d'avancement (round de l'équipe, pas de verrou)
-- ============================================================


-- 1. Ajouter restaurant_id à restaurant_thresholds
-- (permet d'isoler le double verrou par établissement)
ALTER TABLE restaurant_thresholds
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT DEFAULT 'kraainem';

UPDATE restaurant_thresholds
  SET restaurant_id = 'kraainem'
  WHERE restaurant_id IS NULL OR restaurant_id = '';

ALTER TABLE restaurant_thresholds
  ALTER COLUMN restaurant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_thresholds_restaurant
  ON restaurant_thresholds(restaurant_id);


-- 2. Table pending_rewards
CREATE TABLE IF NOT EXISTS pending_rewards (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  order_id         UUID REFERENCES orders(id)   ON DELETE CASCADE NOT NULL,
  restaurant_id    TEXT NOT NULL,
  solo_item        TEXT,          -- NULL si commande < €15
  community_item   TEXT,          -- NULL si double verrou non satisfait ou score < 1 000
  advancement_item TEXT,          -- NULL si équipe pas encore en huitièmes ou éliminée
  status           TEXT CHECK (status IN ('pending', 'redeemed')) DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT now(),
  redeemed_at      TIMESTAMPTZ,
  UNIQUE(order_id) -- une récompense par commande
);


-- 3. RLS
ALTER TABLE pending_rewards ENABLE ROW LEVEL SECURITY;

-- Membre : lit uniquement ses propres récompenses
CREATE POLICY "pending_rewards_own_read" ON pending_rewards
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger SECURITY DEFINER gère les inserts — pas de politique nécessaire


-- 4. Index
CREATE INDEX IF NOT EXISTS idx_pending_rewards_user
  ON pending_rewards(user_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pending_rewards_status
  ON pending_rewards(status, restaurant_id);


-- 5. Fonction trigger : calcule les 3 couches et insère pending_rewards
--    Exécutée APRÈS on_order_validated (alphabétique : 'p' > 'o')
--    → community_scores.score est déjà à jour quand cette fonction s'exécute
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
  v_community_item      TEXT;
  v_advancement_item    TEXT;
BEGIN
  -- Uniquement quand le statut passe à 'validated'
  IF NEW.status != 'validated' OR OLD.status = 'validated' THEN
    RETURN NEW;
  END IF;

  v_restaurant_id := NEW.restaurant_id;

  -- Équipe du membre au moment de la commande
  SELECT team_id INTO v_team_id
    FROM profiles WHERE id = NEW.user_id;

  IF v_team_id IS NULL THEN
    RETURN NEW; -- membre sans équipe, pas de récompense
  END IF;

  -- ── Couche 1 : Palier solo ──────────────────────────────────
  -- Basé sur le montant de CETTE commande. Pas de verrou.
  v_solo_item := CASE
    WHEN NEW.amount >= 60 THEN 'Chef''s Combo'
    WHEN NEW.amount >= 40 THEN '4 Tenders Menu'
    WHEN NEW.amount >= 25 THEN 'Finest burger'
    WHEN NEW.amount >= 15 THEN 'Churros 6 pcs'
    ELSE NULL
  END;

  -- ── Couche 2 : Bonus communautaire ─────────────────────────
  -- Score communautaire déjà mis à jour par on_order_validated.
  -- Soumis au double verrou (seuil CA restaurant).
  SELECT cs.score, t.round_reached, t.is_active
    INTO v_team_score, v_round_reached, v_team_active
    FROM community_scores cs
    JOIN teams t ON t.id = v_team_id
    WHERE cs.team_id      = v_team_id
      AND cs.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    (SELECT is_unlocked
       FROM restaurant_thresholds
      WHERE restaurant_id = v_restaurant_id
      ORDER BY created_at DESC
      LIMIT 1),
    false
  ) INTO v_restaurant_unlocked;

  IF v_restaurant_unlocked THEN
    v_community_item := CASE
      WHEN v_team_score >= 10000 THEN '4 Tenders Menu'
      WHEN v_team_score >=  6000 THEN 'Finest burger'
      WHEN v_team_score >=  3000 THEN 'Churros 12 pcs'
      WHEN v_team_score >=  1000 THEN 'Frites Medium'
      ELSE NULL
    END;
  ELSE
    v_community_item := NULL;
  END IF;

  -- ── Couche 3 : Récompense d'avancement ─────────────────────
  -- Active uniquement si l'équipe est encore en compétition (is_active).
  -- Déclenchée par l'admin qui met à jour round_reached.
  IF v_team_active THEN
    v_advancement_item := CASE v_round_reached
      WHEN 'final'         THEN 'Chef''s Combo'
      WHEN 'semi_final'    THEN '4 Tenders Menu'
      WHEN 'quarter_final' THEN 'Finest burger'
      WHEN 'round_of_16'   THEN 'Churros 6 pcs'
      ELSE NULL
    END;
  ELSE
    v_advancement_item := NULL;
  END IF;

  -- Insérer uniquement si au moins un article est présent
  IF v_solo_item IS NOT NULL
     OR v_community_item   IS NOT NULL
     OR v_advancement_item IS NOT NULL
  THEN
    INSERT INTO pending_rewards (
      user_id, order_id, restaurant_id,
      solo_item, community_item, advancement_item
    ) VALUES (
      NEW.user_id, NEW.id, v_restaurant_id,
      v_solo_item, v_community_item, v_advancement_item
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Trigger (fires after on_order_validated — alphabetical order guaranteed)
DROP TRIGGER IF EXISTS on_pending_reward_create ON orders;
CREATE TRIGGER on_pending_reward_create
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION calculate_pending_reward();
