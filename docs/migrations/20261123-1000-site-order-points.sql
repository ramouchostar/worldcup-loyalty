-- ============================================================
-- Une commande du site retirée rapporte ses points (ADR 0108 §5, tranche 2)
--
-- ⚠️ À appliquer APRÈS 20260918-0420 (points par ticket) et APRÈS 20261120-2000 (site_orders.member_id) : vérifié en tête.
--
-- Quoi : quand le restaurateur marque une commande du site « retirée » (le client est venu ET a payé au comptoir), la base
-- crédite les points personnels du compte qui l'a passée : même barème que les tickets (`personal_points_for_order`,
-- 10 par euro, non convertible en euros côté membre, ADR 0028), disponibles 4 h plus tard (ADR 0061 §2).
--   - JAMAIS à l'envoi : c'est la remise qui prouve qu'une vraie commande a eu lieu (sinon, de fausses commandes rapporteraient
--     des points). Une commande annulée ou jamais retirée ne crédite rien ; une commande envoyée par le secours WhatsApp n'est pas
--     enregistrée, donc ne crédite rien.
--   - UN crédit par commande (index unique partiel), quel que soit le chemin qui la passe à « retirée » : déclencheur sur la table,
--     comme `on_order_validated_points` pour les tickets.
--   - Ne casse JAMAIS la remise : si le crédit échoue (profil absent, contrainte), le déclencheur le dit dans les journaux
--     (RAISE WARNING) et la commande passe quand même à « retirée ». Un point manquant se retrouve par la requête 16 de
--     docs/mesures/suivi-options-menu.sql ; une remise bloquée par les points, jamais.
--   - PAS DE DOUBLE COMPTE avec le ticket de caisse : un client qui commande sur le site, paie, puis photographie son ticket pour
--     le MÊME repas gagnerait deux fois. Si le même compte a un ticket (validé ou en attente) dans ce restaurant à moins de
--     6 heures de la commande, la commande du site est ENREGISTRÉE avec 0 point (une ligne à zéro, définitive : l'index unique
--     empêche de la recréditer) et le ticket garde les siens. Seul un ticket DÉJÀ VALIDÉ compte (un ticket en attente peut être refusé).
--     Le sens inverse (ticket envoyé après la remise) est gardé par un drapeau de revue côté application (`site_order_recent`,
--     app/api/orders/route.ts) : le ticket va en file au lieu d'être validé tout seul. ⚠️ FUITE CONNUE : si le restaurateur valide
--     quand même ce ticket, le client gagne deux fois (la fonction des tickets `credit_order_points` ne regarde pas les commandes du
--     site, et nous ne la modifions pas ici). La requête 16 des mesures compte ces tickets. Les deux fenêtres doivent rester égales
--     (SITE_ORDER_TICKET_WINDOW_HOURS dans lib/site-orders/points.ts, gardé par un test).
--   - ⚠️ Ne JAMAIS rejouer 20260918-0420 APRÈS cette migration : elle recrée `point_transactions_reason_check` avec une liste sans
--     `site_order_points` et échouerait sur les lignes de cette migration.
--
-- Ce que cette migration NE fait PAS (tranches suivantes) : ni le chiffre d'affaires du programme (budget des cadeaux, ADR 0012), ni
-- le score d'équipe, ni le statut de « membre actif » (ADR 0033) : une commande du site ne rapporte, pour l'instant, que ses points.
--
-- Sans cette migration : rien ne casse, une commande retirée ne rapporte simplement aucun point. Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'personal_points_for_order') THEN
    RAISE EXCEPTION 'Appliquer d''abord 20260918-0420-points-par-ticket-fondations.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'site_orders' AND column_name = 'member_id'
  ) THEN
    RAISE EXCEPTION 'Appliquer d''abord 20261120-2000-site-orders-member.sql';
  END IF;
END $$;

-- 1. Registre des points : le lien avec la commande du site et la nouvelle raison --------------------------------------------
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS site_order_id UUID REFERENCES site_orders (id) ON DELETE SET NULL;

ALTER TABLE point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
ALTER TABLE point_transactions ADD CONSTRAINT point_transactions_reason_check
  CHECK (reason IN ('bank_reward', 'exchange_gift', 'admin_adjust', 'order_points', 'site_order_points'));

-- Un seul crédit de points par commande du site.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_point_tx_site_order_points
  ON point_transactions (site_order_id)
  WHERE reason = 'site_order_points';

-- 2. Le crédit ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_site_order_points(p_site_order_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_member     UUID;
  v_restaurant TEXT;
  v_total      INTEGER;
  v_status     TEXT;
  v_created    TIMESTAMPTZ;
  v_picked     TIMESTAMPTZ;
  v_points     INTEGER;
  v_near       BOOLEAN;
  v_delta      INTEGER;
  v_inserted   INTEGER;
BEGIN
  SELECT member_id, restaurant_id, total_cents, status, created_at, picked_up_at
    INTO v_member, v_restaurant, v_total, v_status, v_created, v_picked
  FROM site_orders WHERE id = p_site_order_id;
  IF NOT FOUND OR v_status <> 'retiree' OR v_member IS NULL THEN RETURN 0; END IF;

  v_points := personal_points_for_order(v_total / 100.0);
  IF v_points <= 0 THEN RETURN 0; END IF;

  -- Le même repas déjà compté par un ticket de caisse (ADR 0108 §5) : 6 heures de part et d'autre de la commande.
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = v_member
      AND o.restaurant_id = v_restaurant
      AND o.status = 'validated'   -- seulement un ticket DÉJÀ validé : un ticket en attente pourrait être refusé, et le client ne gagnerait alors rien des deux côtés
      AND o.created_at BETWEEN v_created - INTERVAL '6 hours' AND COALESCE(v_picked, NOW()) + INTERVAL '6 hours'
  ) INTO v_near;
  v_delta := CASE WHEN v_near THEN 0 ELSE v_points END;

  INSERT INTO point_transactions (user_id, restaurant_id, delta, reason, site_order_id, available_at)
  VALUES (
    v_member, v_restaurant, v_delta, 'site_order_points', p_site_order_id,
    CASE WHEN v_near THEN NULL ELSE COALESCE(v_picked, NOW()) + INTERVAL '4 hours' END
  )
  ON CONFLICT (site_order_id) WHERE reason = 'site_order_points' DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN CASE WHEN v_inserted > 0 THEN v_delta ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION credit_site_order_points(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_site_order_points(UUID) TO service_role;

-- 3. Le déclencheur : au passage à « retirée », quel que soit le chemin ----------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_points_on_site_order_pickup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'retiree' AND OLD.status IS DISTINCT FROM 'retiree' AND NEW.member_id IS NOT NULL THEN
    BEGIN
      PERFORM credit_site_order_points(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Jamais une remise bloquée par un point : on le dit dans les journaux, la requête 16 des mesures retrouve la commande.
      RAISE WARNING 'credit_site_order_points(%) a échoué : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION credit_points_on_site_order_pickup() FROM PUBLIC, anon, authenticated;

-- Ne se déclenche que sur un changement d'ÉTAT vers « retirée » (pas à chaque mise à jour de la commande).
DROP TRIGGER IF EXISTS on_site_order_pickup_points ON site_orders;
CREATE TRIGGER on_site_order_pickup_points
  AFTER UPDATE OF status ON site_orders
  FOR EACH ROW
  WHEN (NEW.status = 'retiree' AND OLD.status IS DISTINCT FROM 'retiree')
  EXECUTE FUNCTION credit_points_on_site_order_pickup();

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger WHERE tgname = 'on_site_order_pickup_points';   -- 1 ligne
--   Après la première commande retirée d'un compte :
--   SELECT reason, delta, available_at, site_order_id FROM point_transactions
--    WHERE reason = 'site_order_points' ORDER BY created_at DESC LIMIT 5;
