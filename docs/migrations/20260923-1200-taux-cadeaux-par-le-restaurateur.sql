-- ============================================================
-- 2026-09-23 12:00 — Le restaurateur choisit son taux cadeaux (ADR 0068)
--
-- Le taux (part des encaissements rendue en cadeaux) pilote déjà tout
-- (ADR 0061 amendé le 2026-09-19 : prix du catalogue, plafond du mois,
-- couverture des cadeaux d'équipe, plafonds de paliers). Il n'était réglable
-- qu'à la main en base. Le restaurateur le choisit désormais entre 4 % et
-- 12 % depuis sa console, en voyant ce que chaque taux donne.
--
-- Quoi :
--   1. `reward_rate_changes` : l'historique des changements (qui, quand, de
--      combien à combien, combien de clients ajustés). C'est la trace qui
--      permettra de mesurer l'effet d'un taux (ADR 0065).
--   2. `set_reward_pct(resto, taux, auteur)` : applique le taux ET ajuste les
--      soldes des clients dans la MÊME transaction. Baisser le taux rend les
--      cadeaux plus chers en points : les soldes sont multipliés d'autant
--      (8 % → 4 % : ×2), pour que personne ne perde ce qu'il a gagné
--      (décision du porteur). Bornes vérifiées en base, pas seulement dans
--      l'écran.
--
-- Sans cette migration : le taux reste modifiable uniquement par une
-- migration à la main, et l'écran « Cadeaux » affiche l'aperçu sans pouvoir
-- enregistrer. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS reward_rate_changes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  old_pct           NUMERIC(4,3),
  new_pct           NUMERIC(4,3) NOT NULL,
  members_adjusted  INTEGER NOT NULL DEFAULT 0,
  points_adjusted   INTEGER NOT NULL DEFAULT 0,
  changed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reward_rate_changes ENABLE ROW LEVEL SECURITY; -- service-role only
CREATE INDEX IF NOT EXISTS idx_reward_rate_changes_resto
  ON reward_rate_changes (restaurant_id, changed_at DESC);

CREATE OR REPLACE FUNCTION set_reward_pct(p_restaurant_id TEXT, p_pct NUMERIC, p_actor UUID DEFAULT NULL)
RETURNS TABLE (old_pct NUMERIC, new_pct NUMERIC, members_adjusted INTEGER, points_adjusted INTEGER) AS $$
DECLARE
  v_old NUMERIC;
  v_ratio NUMERIC;
  v_members INTEGER := 0;
  v_points INTEGER := 0;
BEGIN
  IF p_pct IS NULL OR p_pct < 0.04 OR p_pct > 0.12 THEN
    RAISE EXCEPTION 'rate_out_of_range';
  END IF;

  -- Taux actuel : réglage propre, sinon budget du dernier mois, sinon 8 %.
  SELECT budget_pct INTO v_old FROM restaurant_reward_settings WHERE restaurant_id = p_restaurant_id;
  IF v_old IS NULL THEN
    SELECT budget_pct INTO v_old FROM reward_budget_tracking
     WHERE restaurant_id = p_restaurant_id ORDER BY period_month DESC LIMIT 1;
  END IF;
  v_old := COALESCE(NULLIF(v_old, 0), 0.08);

  INSERT INTO restaurant_reward_settings (restaurant_id, budget_pct)
  VALUES (p_restaurant_id, p_pct)
  ON CONFLICT (restaurant_id) DO UPDATE SET budget_pct = p_pct, updated_at = NOW();

  -- Les cadeaux changent de prix : les soldes suivent, pour que personne ne
  -- perde ce qu'il a gagné (ni n'en gagne en passant à un taux plus généreux).
  v_ratio := v_old / p_pct;
  IF v_ratio <> 1 THEN
    WITH soldes AS (
      SELECT user_id, SUM(delta)::int AS balance
      FROM point_transactions
      WHERE restaurant_id = p_restaurant_id
      GROUP BY user_id
      HAVING SUM(delta) > 0
    ), ecritures AS (
      INSERT INTO point_transactions (user_id, restaurant_id, delta, reason)
      SELECT user_id, p_restaurant_id, ROUND(balance * (v_ratio - 1))::int, 'admin_adjust'
      FROM soldes
      WHERE ROUND(balance * (v_ratio - 1))::int <> 0
      RETURNING delta
    )
    SELECT COUNT(*)::int, COALESCE(SUM(delta), 0)::int INTO v_members, v_points FROM ecritures;
  END IF;

  INSERT INTO reward_rate_changes (restaurant_id, old_pct, new_pct, members_adjusted, points_adjusted, changed_by)
  VALUES (p_restaurant_id, v_old, p_pct, v_members, v_points, p_actor);

  RETURN QUERY SELECT v_old, p_pct, v_members, v_points;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION set_reward_pct(TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_reward_pct(TEXT, NUMERIC, UUID) TO service_role;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT * FROM reward_rate_changes ORDER BY changed_at DESC LIMIT 5;
--   SELECT restaurant_id, budget_pct FROM restaurant_reward_settings;
--   Un appel hors bornes doit échouer :
--   SELECT set_reward_pct('kraainem', 0.20);   -- erreur rate_out_of_range
