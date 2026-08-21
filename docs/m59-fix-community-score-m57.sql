-- ============================================================
-- M59 : Correctif — le score communautaire ne s'incrémente plus depuis m57
--
-- BUG : m57 (ADR 0034) a réécrit `update_community_score()` pour résoudre
-- l'équipe à la validation, mais la nouvelle version n'a gardé QUE la ligne
-- `total_spent`. L'incrément `score = COALESCE(score,0) + points_for_order(...)`
-- rétabli par m49 a disparu au passage.
--
-- Constaté en production le 2026-08-21 : première commande validée de
-- Kraainem (15,80 €) → `total_spent` = 15.80, `score` = 0.
--
-- Conséquences côté membre, depuis le 19/08 :
--   • le score communautaire reste figé à 0 (dashboard, classement, mon équipe) ;
--   • la couche 2 (bonus communautaire) ne se débloque jamais — elle se
--     résout sur ce score (lib/rewards.ts).
--
-- Ce correctif remet l'incrément dans la fonction m57 (résolution de l'équipe
-- à la validation INCLUSE, on ne revient pas à la version m49) et recalcule
-- les scores existants. Idempotent, sûr à rejouer.
-- ============================================================

-- ── 1. La fonction m57, avec l'incrément de score rétabli ─────────────────
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
DECLARE
  v_team UUID;
BEGIN
  IF NEW.status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN

    v_team := NEW.team_id;

    -- ADR 0034 — commande sans équipe : celle du membre aujourd'hui, s'il en a une.
    IF v_team IS NULL THEN
      SELECT m.team_id INTO v_team
        FROM memberships m
        WHERE m.user_id = NEW.user_id
          AND m.restaurant_id = NEW.restaurant_id;
    END IF;

    IF v_team IS NOT NULL THEN
      UPDATE community_scores
      SET total_spent  = COALESCE(total_spent, 0) + NEW.amount,
          score        = COALESCE(score, 0) + points_for_order(NEW.amount),
          last_updated = NOW()
      WHERE team_id = v_team
        AND restaurant_id = NEW.restaurant_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_validated ON orders;
CREATE TRIGGER on_order_validated
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_community_score();

-- ── 2. Recalcul des scores ────────────────────────────────────────────────
-- Recalcul COMPLET (pas seulement les NULL comme m49) : entre le 19/08 et ce
-- correctif, des commandes validées n'ont rien crédité du tout. La somme des
-- points des commandes validées est la définition du score (m47) — la
-- recalculer ne peut pas diverger de ce qu'elle aurait dû être.
--
-- L'équipe d'une commande se résout comme dans le trigger : celle portée par
-- la commande, sinon celle du membre aujourd'hui (ADR 0034). Sans ce
-- COALESCE, les tickets envoyés sans équipe puis rattachés seraient perdus.
UPDATE community_scores cs
SET score = COALESCE((
      SELECT SUM(points_for_order(o.amount))
      FROM orders o
      LEFT JOIN memberships m
        ON m.user_id = o.user_id
       AND m.restaurant_id = o.restaurant_id
      WHERE COALESCE(o.team_id, m.team_id) = cs.team_id
        AND o.restaurant_id = cs.restaurant_id
        AND o.status = 'validated'
    ), 0),
    last_updated = NOW();

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT restaurant_id, team_id, member_count, total_spent, score
--     FROM community_scores WHERE total_spent > 0 ORDER BY score DESC;
--   -- attendu : aucune ligne avec total_spent > 0 et score = 0
