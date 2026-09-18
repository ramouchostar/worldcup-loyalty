-- ============================================================
-- 2026-09-18 07:00 — Équipes : un cadeau par palier franchi, pour chaque
-- membre (ADR 0061 §7, PR 5 sur 6)
--
-- ⚠️ À appliquer APRÈS 20260918-0600 (bascule) — vérifié en tête de fichier.
--
-- Quoi :
--   1. `pending_rewards.source` accepte `team` (cadeau d'équipe).
--   2. L'index un-seul-actif (ADR 0011) ne porte plus que sur les cadeaux
--      PERSONNELS : un cadeau d'équipe ne bloque ni le cadeau d'accueil ni un
--      cadeau choisi au catalogue (et inversement).
--   3. Table `team_tier_awards` : un palier ne s'attribue qu'UNE fois par
--      équipe (unicité équipe × palier) — c'est la garde anti-doublon.
--   4. Garde-fou : les paliers DÉJÀ franchis au moment de la migration sont
--      notés comme attribués (sans cadeau) — seuls les franchissements à venir
--      offrent un cadeau. Aucune équipe n'en avait franchi au 2026-09-18.
--   5. `award_team_tier(team, palier)` : crée, en une transaction, le cadeau
--      de chaque membre de l'équipe et compte le coût au budget (ADR 0012).
--      Les contrôles de couverture (ADR 0017), de budget et de double verrou
--      sont faits côté serveur avant l'appel (lib/team-gifts.ts).
--
-- Sans cette migration : les paliers d'équipe ne donnent plus rien (le
-- cadeau d'équipe par ticket a disparu avec la PR 5). Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refund_catalog_reward') THEN
    RAISE EXCEPTION 'Appliquer d''abord 20260918-0600-bascule-points-par-ticket.sql';
  END IF;
END $$;

-- 1. Source « team » -----------------------------------------------------------
ALTER TABLE pending_rewards DROP CONSTRAINT IF EXISTS pending_rewards_source_check;
ALTER TABLE pending_rewards ADD CONSTRAINT pending_rewards_source_check
  CHECK (source IN ('order', 'saver', 'birthday', 'catalog', 'team'));

-- 2. Un cadeau personnel à la fois ; les cadeaux d'équipe à côté ------------
DROP INDEX IF EXISTS idx_one_active_reward_per_member;
CREATE UNIQUE INDEX idx_one_active_reward_per_member
  ON pending_rewards (user_id, restaurant_id)
  WHERE status = 'available' AND source <> 'team';

-- 3. Paliers d'équipe attribués ---------------------------------------------
CREATE TABLE IF NOT EXISTS team_tier_awards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tier_id         UUID NOT NULL REFERENCES reward_tiers(id) ON DELETE CASCADE,
  item_name       TEXT,
  members_awarded INTEGER NOT NULL DEFAULT 0,
  awarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, tier_id)
);
ALTER TABLE team_tier_awards ENABLE ROW LEVEL SECURITY; -- service-role only

-- 4. Garde-fou : ce qui est déjà franchi ne donne rien rétroactivement -------
INSERT INTO team_tier_awards (restaurant_id, team_id, tier_id, item_name, members_awarded)
SELECT cs.restaurant_id, cs.team_id, rt.id, NULL, 0
FROM community_scores cs
JOIN reward_tiers rt
  ON rt.restaurant_id = cs.restaurant_id
 AND rt.layer = 'community'
 AND rt.is_active
 AND COALESCE(cs.score, 0) >= rt.min_threshold
ON CONFLICT (team_id, tier_id) DO NOTHING;

-- 5. Attribution atomique -----------------------------------------------------
CREATE OR REPLACE FUNCTION award_team_tier(p_team_id UUID, p_tier_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_restaurant_id TEXT;
  v_item_name TEXT;
  v_item_cost NUMERIC;
  v_award_id UUID;
  v_members INTEGER;
BEGIN
  SELECT rt.restaurant_id, mi.name, mi.cost_price
    INTO v_restaurant_id, v_item_name, v_item_cost
  FROM reward_tiers rt
  JOIN menu_items mi ON mi.id = rt.menu_item_id
  WHERE rt.id = p_tier_id AND rt.layer = 'community' AND rt.is_active AND mi.is_active;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Unicité équipe × palier : la seconde attribution concurrente s'arrête ici.
  INSERT INTO team_tier_awards (restaurant_id, team_id, tier_id, item_name)
  VALUES (v_restaurant_id, p_team_id, p_tier_id, v_item_name)
  ON CONFLICT (team_id, tier_id) DO NOTHING
  RETURNING id INTO v_award_id;
  IF v_award_id IS NULL THEN RETURN 0; END IF;

  INSERT INTO pending_rewards (user_id, restaurant_id, order_id, community_item, community_cost, status, source)
  SELECT m.user_id, v_restaurant_id, NULL, v_item_name, NULLIF(v_item_cost, 0), 'available', 'team'
  FROM memberships m
  WHERE m.team_id = p_team_id AND m.restaurant_id = v_restaurant_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  UPDATE team_tier_awards SET members_awarded = v_members WHERE id = v_award_id;

  IF v_members > 0 AND COALESCE(v_item_cost, 0) > 0 THEN
    PERFORM increment_reward_budget(v_restaurant_id, 0, v_item_cost * v_members);
  END IF;
  RETURN v_members;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION award_team_tier(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION award_team_tier(UUID, UUID) TO service_role;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_one_active_reward_per_member';
--   → « … WHERE ((status = 'available') AND (source <> 'team')) »
--   SELECT COUNT(*) FROM team_tier_awards;   -- 0 au 2026-09-18 (aucun palier franchi)
