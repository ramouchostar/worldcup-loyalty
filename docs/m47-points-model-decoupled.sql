-- ============================================================
-- M47 : Modèle de points découplé de l'euro (ADR 0028)
--
-- Rend le score d'équipe NON-dérivable en euros → clôt la fuite H1.
-- Aujourd'hui `community_scores.score` est une colonne GÉNÉRÉE
-- `member_count × total_spent` → un client fait `score ÷ membres` et retrouve
-- le CA. On la transforme en colonne RÉGULIÈRE qui accumule la SOMME des
-- points COURBÉS gagnés par commande validée (aucune relation linéaire au CA).
--
-- `total_spent` reste inchangé : vérité SERVEUR (budget 0012, marge 0017),
-- jamais exposée ni dérivable côté client.
--
-- À appliquer dans l'éditeur SQL Supabase. Idempotent hors DROP EXPRESSION
-- (à ne rejouer que si `score` est encore générée — sinon ignorer l'étape 2).
-- ============================================================

-- 1. Formule de points — SOURCE SQL FAISANT AUTORITÉ.
--    Miroir exact de lib/points-model.ts (BASE=20, SCALE=4, α=0.6).
CREATE OR REPLACE FUNCTION points_for_order(p_amount NUMERIC)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, round(20 + 4 * power(GREATEST(p_amount, 0), 0.6)))::int;
$$;

-- 2. `score` : colonne GÉNÉRÉE (membres × total_spent) → colonne RÉGULIÈRE.
--    DROP EXPRESSION conserve la colonne et la rend modifiable (Postgres 13+).
--    Les valeurs actuelles seront écrasées par le backfill (étape 4).
ALTER TABLE community_scores ALTER COLUMN score DROP EXPRESSION;

-- 3. Trigger : à la validation, accumuler total_spent (euros, serveur) ET
--    score (points courbés). Remplace la fonction m35 (qui, le score étant
--    généré, ne touchait que total_spent). Le trigger on_order_validated
--    (AFTER INSERT OR UPDATE, m35) pointe déjà sur cette fonction.
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN
    UPDATE community_scores
    SET total_spent  = total_spent + NEW.amount,
        score        = score + points_for_order(NEW.amount),
        last_updated = NOW()
    WHERE team_id = NEW.team_id
      AND restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Backfill : score de chaque équipe = somme des points de ses commandes
--    validées (rejouable — recalcul complet, pas d'incrément).
UPDATE community_scores cs
SET score = COALESCE((
      SELECT SUM(points_for_order(o.amount))
      FROM orders o
      WHERE o.team_id = cs.team_id
        AND o.restaurant_id = cs.restaurant_id
        AND o.status = 'validated'
    ), 0),
    last_updated = NOW();

-- 5. SEUILS — recalibrage à la nouvelle échelle (points courbés cumulés).
--    ⚠️ VALEURS PAR DÉFAUT à AJUSTER selon l'intention produit.
--    Ancienne échelle (membres × euros) obsolète. Repère : ~48 pts / commande
--    → niveau 1 ≈ 10 cmd (500) · 2 ≈ 30 (1500) · 3 ≈ 60 (3000) · 4 ≈ 120 (6000).
UPDATE rewards SET score_threshold = CASE level
    WHEN 1 THEN 500 WHEN 2 THEN 1500 WHEN 3 THEN 3000 WHEN 4 THEN 6000
    ELSE score_threshold END
WHERE level BETWEEN 1 AND 4;

--    Catalogue ADR 0013 (reward_tiers, couche 'community') : le recalibrage
--    dépend de l'activité réelle de CHAQUE resto — pas de défaut fiable ici.
--    Aide à la calibration (regarder les scores réels après backfill) :
--      SELECT restaurant_id, team_id, score
--      FROM community_scores WHERE score > 0 ORDER BY score DESC;
--    Puis ajuster reward_tiers.min_threshold (couche 'community') par resto.
-- ------------------------------------------------------------
-- Après cette migration : /api/leaderboard et /api/scores n'exposent plus
-- qu'un `score` en points non-inversible (fin de `membres × euros`). H1 clos.
-- Reste (suivi ADR 0028) : réserve ADR 0021 (bank_reward crédite encore
-- floor(€) → passer aux points courbés) + calibrage reward_tiers par resto.
-- ============================================================
