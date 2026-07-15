-- ============================================================
-- M35 : CORRECTIF FONCTIONNEL — le score communautaire ne bougeait pas
--       sur les commandes AUTO-VALIDÉES
--
-- Bug (trouvé à la recette du pipeline, 2026-07-15) :
--   Le trigger de score `on_order_validated` (m2) est défini AFTER UPDATE
--   uniquement, avec la garde « OLD.status != 'validated' ». Or la route
--   /api/orders INSÈRE les commandes auto-validées directement en
--   status='validated' (un seul INSERT, jamais pending→UPDATE). Un INSERT
--   ne déclenche pas un trigger AFTER UPDATE → community_scores.total_spent
--   n'était JAMAIS incrémenté pour le parcours normal (AUTO_VALIDATE actif).
--   Seules les commandes validées à la main depuis la file admin
--   (pending→validated = UPDATE) faisaient monter le score.
--
--   Conséquence : classement d'équipe figé, bonus communautaire (ADR 0006
--   couche 2, ADR 0012 double verrou de croissance) jamais débloqué par la
--   dépense, progression communauté du dashboard (ADR 0010) fausse — dès que
--   les tickets s'auto-valident.
--
-- Preuve : INSERT direct 'validated' (20€) → total_spent reste 0 ;
--          INSERT 'pending' puis UPDATE 'validated' (30€) → total_spent = 30.
--
-- Correctif : étendre le trigger à AFTER INSERT OR UPDATE, avec une garde
-- qui compte une commande exactement une fois, au moment où elle DEVIENT
-- validée (INSERT direct en validated, ou transition pending→validated),
-- jamais deux fois (UPDATE validated→validated ignoré).
--
-- Idempotent, sûr à rejouer.
-- ============================================================

CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Compter au moment où la commande devient validée :
  --   INSERT direct en 'validated'  → OLD est NULL → compté
  --   UPDATE pending → 'validated'  → compté
  --   UPDATE 'validated' → 'validated' → ignoré (déjà compté)
  IF NEW.status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN
    UPDATE community_scores
    SET total_spent = total_spent + NEW.amount,
        last_updated = NOW()
    WHERE team_id = NEW.team_id
      AND restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_validated ON orders;
CREATE TRIGGER on_order_validated
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_community_score();

-- Vérification : après cette migration, une commande auto-validée
-- (INSERT status='validated') doit incrémenter community_scores.total_spent
-- de l'équipe. Re-jouer scripts/tmp-scoreprobe.mjs → cas A doit passer ✅.
