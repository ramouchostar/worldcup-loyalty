-- ============================================================
-- M6 — Schéma cibles (ADRs 0001–0009)
-- Comble les écarts entre M2–M5 et les spécifications des ADRs
-- Exécuter dans Supabase : SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- ADR 0001 : L'historique de dépenses suit le membre au transfert
-- Avant : trigger ne transférait que member_count
-- Après : total_spent du membre est aussi soustrait/ajouté
-- ============================================================

CREATE OR REPLACE FUNCTION update_member_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_restaurant_id      TEXT;
  v_member_total_spent NUMERIC;
BEGIN
  v_restaurant_id := COALESCE(NEW.restaurant_id, OLD.restaurant_id);

  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    -- Dépenses validées du membre dans cet établissement
    SELECT COALESCE(SUM(amount), 0) INTO v_member_total_spent
      FROM orders
      WHERE user_id       = NEW.id
        AND status        = 'validated'
        AND restaurant_id = v_restaurant_id;

    -- Retirer membre et dépenses de l'ancienne équipe
    UPDATE community_scores
    SET member_count = member_count - 1,
        total_spent  = GREATEST(0, total_spent - v_member_total_spent),
        last_updated = NOW()
    WHERE team_id       = OLD.team_id
      AND restaurant_id = v_restaurant_id;

    -- Ajouter membre et dépenses à la nouvelle équipe
    UPDATE community_scores
    SET member_count = member_count + 1,
        total_spent  = total_spent + v_member_total_spent,
        last_updated = NOW()
    WHERE team_id       = NEW.team_id
      AND restaurant_id = v_restaurant_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- ADR 0002 : round_advanced_at — bonus ×1.5 calculé à l'affichage
-- Trigger BEFORE UPDATE : set round_advanced_at = NOW() quand round_reached change
-- Reset à NULL si remis en group_stage (correction admin possible)
-- ============================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS round_advanced_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION handle_round_advancement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.round_reached IS DISTINCT FROM OLD.round_reached THEN
    IF NEW.round_reached != 'group_stage' THEN
      NEW.round_advanced_at := NOW();
    ELSE
      NEW.round_advanced_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_round_advancement ON teams;
CREATE TRIGGER on_round_advancement
  BEFORE UPDATE OF round_reached ON teams
  FOR EACH ROW EXECUTE FUNCTION handle_round_advancement();


-- ============================================================
-- ADR 0003 / 0008 : Bestelnummer (order_number) + receipt_url
-- order_number remplace duplicate_key comme clé d'anti-doublon
-- Index partiel UNIQUE : deux commandes sans Bestelnummer ne se bloquent pas
-- receipt_url pointe vers Supabase Storage bucket "receipts"
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number
  ON orders (order_number)
  WHERE order_number IS NOT NULL;


-- ============================================================
-- ADR 0005 : restaurant_id sur toutes les tables
-- La table transfers manquait cette colonne (isolation multi-établissement)
-- ============================================================

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT;


-- ============================================================
-- ADR 0006 : Colonnes de coût dans pending_rewards
-- Permet l'analytics (coût programme) sans recalcul a posteriori
-- Ajoute 'expired' comme statut valide
-- ============================================================

ALTER TABLE pending_rewards
  ADD COLUMN IF NOT EXISTS solo_cost        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS community_cost   NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS advancement_cost NUMERIC(6,2);

ALTER TABLE pending_rewards
  DROP CONSTRAINT IF EXISTS pending_rewards_status_check;
ALTER TABLE pending_rewards
  ADD CONSTRAINT pending_rewards_status_check
  CHECK (status IN ('pending', 'redeemed', 'expired'));

-- Recalcul complet de calculate_pending_reward() avec les coûts
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
  IF NEW.status != 'validated' OR OLD.status = 'validated' THEN
    RETURN NEW;
  END IF;

  v_restaurant_id := NEW.restaurant_id;

  SELECT team_id INTO v_team_id
    FROM profiles WHERE id = NEW.user_id;

  IF v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Couche 1 : Palier solo (pas de verrou) ──────────────────
  SELECT t_item, t_cost INTO v_solo_item, v_solo_cost
    FROM (VALUES
      (60::numeric, 'Chef''s Combo',  1.92::numeric),
      (40::numeric, '4 Tenders Menu', 1.93::numeric),
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
        (10000::numeric, '4 Tenders Menu', 1.93::numeric),
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
        ('semi_final',    '4 Tenders Menu', 1.93::numeric),
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


-- ============================================================
-- ADR 0007 : restaurant_thresholds — lecture admin uniquement
-- Retire le SELECT public qui exposait target_revenue / current_revenue
-- Les routes API publiques calculent is_unlocked via service role
-- ============================================================

DROP POLICY IF EXISTS "thresholds_public_read" ON restaurant_thresholds;

CREATE POLICY "thresholds_admin_read" ON restaurant_thresholds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );


-- ============================================================
-- ADR 0009 : Notifications d'incitation communautaire
-- last_notified_at : anti-spam (48h entre notifications)
-- notification_log : audit + analytics des envois
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notification_log (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id           TEXT        NOT NULL,
  trigger_type            TEXT        NOT NULL
    CHECK (trigger_type IN ('tier_upgrade', 'member_inactive', 'tier_approaching', 'advancement')),
  channel                 TEXT        NOT NULL
    CHECK (channel IN ('whatsapp', 'push', 'in_app')),
  community_score_at_send NUMERIC(14,2),
  message_body            TEXT        NOT NULL,
  sent_at                 TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_log_own_read" ON notification_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent
  ON notification_log (user_id, sent_at DESC);
