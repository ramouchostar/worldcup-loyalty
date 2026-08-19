-- ============================================================
-- M57 : commandes sans équipe (ADR 0034)
--
-- Jusqu'ici `orders.team_id` était NOT NULL (m2) et /api/orders refusait la
-- soumission d'un membre sans équipe. Conséquence observée en production
-- (Kraainem, 18-19/08/2026) : 6 membres inscrits, 6 scans OCR facturés,
-- 0 commande enregistrée — l'établissement n'avait déclaré aucune communauté
-- (m54), donc la question d'équipe n'était jamais posée, donc plus aucun
-- ticket ne passait. Un ticket refusé ne laissait aucune trace : ni commande,
-- ni fichier, ni ligne dans la file de validation.
--
-- Le membre peut désormais envoyer ses tickets sans équipe. Il touche la
-- couche 1 (palier solo) ; les couches 2 et 3 sont des cadeaux d'équipe et
-- restent réservées à ceux qui en ont une (lib/rewards.ts).
--
-- Règle de comptage, une seule fois par commande :
--   1. Commande validée alors que le membre A une équipe → créditée à cette
--      équipe (trigger de score, résolution au moment de la validation).
--   2. Commande validée alors qu'il n'en a pas → créditée à personne.
--   3. Adhésion à une première équipe → ses commandes validées jusque-là
--      suivent le membre (même règle que le changement d'équipe, qui
--      transfère déjà tout l'historique depuis m27).
--
-- Idempotent, sûr à rejouer.
-- ============================================================

-- ── 1. Une commande peut ne pas avoir d'équipe ────────────────────────────
ALTER TABLE orders ALTER COLUMN team_id DROP NOT NULL;

-- ── 2. Score communautaire : l'équipe est résolue à la VALIDATION ─────────
-- Une commande envoyée sans équipe puis validée après que le membre en a
-- rejoint une compte pour cette équipe — sinon elle ne compterait nulle part
-- (la reprise d'historique du point 3 ne voit que les commandes DÉJÀ validées
-- au moment de l'adhésion).
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
DECLARE
  v_team UUID;
BEGIN
  IF NEW.status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN

    v_team := NEW.team_id;

    -- Commande sans équipe : celle du membre aujourd'hui, s'il en a une.
    IF v_team IS NULL THEN
      SELECT m.team_id INTO v_team
        FROM memberships m
        WHERE m.user_id = NEW.user_id
          AND m.restaurant_id = NEW.restaurant_id;
    END IF;

    IF v_team IS NOT NULL THEN
      UPDATE community_scores
      SET total_spent = total_spent + NEW.amount,
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

-- ── 3. Première adhésion : la dépense déjà validée suit le membre ─────────
-- m27 ne créditait que `member_count` à la première équipe (avant l'ADR 0034
-- un nouveau membre n'avait forcément aucune commande) et transférait tout
-- l'historique lors d'un CHANGEMENT d'équipe. On aligne les deux chemins.
CREATE OR REPLACE FUNCTION update_member_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_member_total_spent NUMERIC;
BEGIN
  -- Première équipe (INSERT avec team_id déjà renseigné, ou UPDATE depuis NULL)
  IF (TG_OP = 'INSERT' AND NEW.team_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.team_id IS NULL AND NEW.team_id IS NOT NULL) THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_member_total_spent
      FROM orders
      WHERE user_id = NEW.user_id
        AND status = 'validated'
        AND restaurant_id = NEW.restaurant_id;

    UPDATE community_scores
    SET member_count = member_count + 1,
        total_spent  = total_spent + v_member_total_spent,
        last_updated = NOW()
    WHERE team_id = NEW.team_id AND restaurant_id = NEW.restaurant_id;
    RETURN NEW;
  END IF;

  -- Changement d'équipe (inchangé depuis m27) — transfère la dépense cumulée
  IF TG_OP = 'UPDATE' AND OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_member_total_spent
      FROM orders
      WHERE user_id = NEW.user_id
        AND status = 'validated'
        AND restaurant_id = NEW.restaurant_id;

    UPDATE community_scores
    SET member_count = member_count - 1,
        total_spent  = GREATEST(0, total_spent - v_member_total_spent),
        last_updated = NOW()
    WHERE team_id = OLD.team_id AND restaurant_id = NEW.restaurant_id;

    IF NEW.team_id IS NOT NULL THEN
      UPDATE community_scores
      SET member_count = member_count + 1,
          total_spent  = total_spent + v_member_total_spent,
          last_updated = NOW()
      WHERE team_id = NEW.team_id AND restaurant_id = NEW.restaurant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_membership_team_change ON memberships;
CREATE TRIGGER on_membership_team_change
AFTER INSERT OR UPDATE OF team_id ON memberships
FOR EACH ROW EXECUTE FUNCTION update_member_counts();

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_name = 'orders' AND column_name = 'team_id';   -- attendu : YES
