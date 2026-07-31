-- ============================================================
-- M49 : Correctif — score communautaire bloqué à NULL (bug post-m47)
--
-- BUG : depuis m47, community_scores.score est une colonne RÉGULIÈRE SANS
-- DÉFAUT. À la création d'une équipe (lib/teams.ts createTeam), la ligne est
-- insérée SANS `score` → NULL. Le trigger update_community_score fait
-- `score = score + points_for_order(...)` (sans COALESCE) → NULL + points =
-- NULL. Conséquence : toute équipe créée APRÈS m47 garde un score bloqué à
-- NULL (affiché 0) — classement, paliers d'équipe et progression communautaire
-- cassés pour les nouvelles équipes. Les équipes d'avant m47 (backfillées à 0
-- par m47) ne sont pas touchées, ce qui masquait le bug.
--
-- 3 verrous SQL : (1) défaut 0 sur la colonne, (2) réparation des lignes NULL,
-- (3) COALESCE dans le trigger. + correctif applicatif dans lib/teams.ts
-- (score: 0 à l'insertion). Idempotent. À appliquer dans l'éditeur SQL Supabase.
-- ============================================================

-- 1. Défaut 0 : toute nouvelle ligne community_scores démarre à 0, jamais NULL.
ALTER TABLE community_scores ALTER COLUMN score SET DEFAULT 0;

-- 2. Réparation des lignes déjà cassées (score NULL) : recalcul = somme des
--    points courbés des commandes validées de l'équipe (0 si aucune). Ne touche
--    QUE les NULL → n'écrase aucun score déjà correct.
UPDATE community_scores cs
SET score = COALESCE((
      SELECT SUM(points_for_order(o.amount))
      FROM orders o
      WHERE o.team_id = cs.team_id
        AND o.restaurant_id = cs.restaurant_id
        AND o.status = 'validated'
    ), 0),
    last_updated = NOW()
WHERE cs.score IS NULL;

-- 3. Trigger durci : COALESCE(..., 0) → un score (ou total_spent) NULL résiduel
--    ne bloque plus jamais l'accumulation. Réplique exacte de m47 + ce garde-fou.
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN
    UPDATE community_scores
    SET total_spent  = COALESCE(total_spent, 0) + NEW.amount,
        score        = COALESCE(score, 0) + points_for_order(NEW.amount),
        last_updated = NOW()
    WHERE team_id = NEW.team_id
      AND restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
