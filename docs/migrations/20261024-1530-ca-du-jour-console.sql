-- ============================================================
-- CA du jour saisi dans la console (ADR 0087 §1, §2, §6)
--
-- Quoi :
--   daily_revenue_entries   + détail par canal (uber, deliveroo, takeaway, emporter,
--                             sur_place) et `source` (console | plateforme) ;
--                             nouvelle issue `saisi` : le restaurateur a saisi
--                             lui-même dans la console.
--   save_daily_revenue_console()  écrit le jour ET sa vente de caisse dans la même
--                             transaction (même règle que save_daily_revenue, ADR
--                             0078 §4) : un jour fermé n'a jamais de vente à 0 €.
--   service_requests        + service `caisse` (« Connecter ma caisse » = une demande).
--
-- Pourquoi : le restaurateur ne pouvait pas noter son chiffre lui-même ; seul un
-- super-admin écrivait dans /platform/ca. Les canaux sont un DÉTAIL du total, jamais
-- une seconde source : `amount` reste le seul chiffre qui fait foi.
--
-- Sécurité : inchangée — RLS sans policy, RPC SECURITY DEFINER réservée au
-- service_role ; la page vérifie l'accès console avant d'appeler.
--
-- Idempotent. Sans la migration : la saisie du total marche quand même (repli sur
-- save_daily_revenue avec l'issue « de lui-même », canaux recopiés dans la note),
-- le bouton « Connecter ma caisse » répond une erreur (jamais un faux « c'est noté »).
-- ============================================================

ALTER TABLE daily_revenue_entries
  ADD COLUMN IF NOT EXISTS uber      NUMERIC(10,2) CHECK (uber      IS NULL OR uber      >= 0),
  ADD COLUMN IF NOT EXISTS deliveroo NUMERIC(10,2) CHECK (deliveroo IS NULL OR deliveroo >= 0),
  ADD COLUMN IF NOT EXISTS takeaway  NUMERIC(10,2) CHECK (takeaway  IS NULL OR takeaway  >= 0),
  ADD COLUMN IF NOT EXISTS emporter  NUMERIC(10,2) CHECK (emporter  IS NULL OR emporter  >= 0),
  ADD COLUMN IF NOT EXISTS sur_place NUMERIC(10,2) CHECK (sur_place IS NULL OR sur_place >= 0),
  ADD COLUMN IF NOT EXISTS source    TEXT CHECK (source IS NULL OR source IN ('console', 'plateforme'));

-- L'issue `saisi` rejoint les issues qui portent un montant.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'daily_revenue_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%outcome%'
  LOOP
    EXECUTE format('ALTER TABLE daily_revenue_entries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE daily_revenue_entries
  ADD CONSTRAINT daily_revenue_entries_outcome_check
  CHECK (outcome IN ('repondu', 'relance', 'spontane', 'saisi', 'sans_reponse', 'ferme', 'historique'));

ALTER TABLE daily_revenue_entries
  ADD CONSTRAINT daily_revenue_entries_amount_outcome_check
  CHECK ((outcome IN ('repondu', 'relance', 'spontane', 'saisi', 'historique')) = (amount IS NOT NULL));

CREATE OR REPLACE FUNCTION save_daily_revenue_console(
  p_restaurant_id TEXT,
  p_day           DATE,
  p_closed        BOOLEAN,
  p_amount        NUMERIC,
  p_tickets       INT,
  p_uber          NUMERIC,
  p_deliveroo     NUMERIC,
  p_takeaway      NUMERIC,
  p_emporter      NUMERIC,
  p_sur_place     NUMERIC,
  p_entered_by    UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC := CASE WHEN p_closed THEN NULL ELSE p_amount END;
BEGIN
  IF NOT p_closed AND p_amount IS NULL THEN
    RAISE EXCEPTION 'montant requis pour un jour ouvert';
  END IF;

  INSERT INTO daily_revenue_entries
    (restaurant_id, sales_day, outcome, amount, tickets, asked_at, replied_at, note, entered_by,
     uber, deliveroo, takeaway, emporter, sur_place, source)
  VALUES
    (p_restaurant_id, p_day, CASE WHEN p_closed THEN 'ferme' ELSE 'saisi' END, v_amount,
     CASE WHEN p_closed THEN NULL ELSE p_tickets END,
     NULL, (now() AT TIME ZONE 'Europe/Brussels')::time, NULL, p_entered_by,
     CASE WHEN p_closed THEN NULL ELSE p_uber END,
     CASE WHEN p_closed THEN NULL ELSE p_deliveroo END,
     CASE WHEN p_closed THEN NULL ELSE p_takeaway END,
     CASE WHEN p_closed THEN NULL ELSE p_emporter END,
     CASE WHEN p_closed THEN NULL ELSE p_sur_place END,
     'console')
  ON CONFLICT (restaurant_id, sales_day) DO UPDATE SET
    outcome    = EXCLUDED.outcome,
    amount     = EXCLUDED.amount,
    tickets    = EXCLUDED.tickets,
    replied_at = EXCLUDED.replied_at,
    entered_by = EXCLUDED.entered_by,
    uber       = EXCLUDED.uber,
    deliveroo  = EXCLUDED.deliveroo,
    takeaway   = EXCLUDED.takeaway,
    emporter   = EXCLUDED.emporter,
    sur_place  = EXCLUDED.sur_place,
    source     = EXCLUDED.source,
    updated_at = now();

  DELETE FROM restaurant_sales WHERE restaurant_id = p_restaurant_id AND sold_on = p_day;

  IF v_amount IS NOT NULL THEN
    INSERT INTO restaurant_sales (restaurant_id, sold_on, sold_at, amount, source_import_id)
    VALUES (p_restaurant_id, p_day, NULL, v_amount, NULL);
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION save_daily_revenue_console(TEXT, DATE, BOOLEAN, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION save_daily_revenue_console(TEXT, DATE, BOOLEAN, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID) TO service_role;

-- « Connecter ma caisse » : une demande de service de plus (ADR 0087 §6).
-- Seulement si service_requests existe (migration 20261008-1053) : sans elle, la
-- demande répond une erreur à l'écran, cette migration ne la crée pas à sa place.
DO $$
DECLARE c record;
BEGIN
  IF to_regclass('public.service_requests') IS NULL THEN
    RAISE NOTICE 'service_requests absente : appliquer 20261008-1053-demandes-services.sql, puis rejouer cette migration';
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.service_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%service%'
      AND pg_get_constraintdef(oid) NOT LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE service_requests DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE service_requests
    ADD CONSTRAINT service_requests_service_check
    CHECK (service IN ('pub', 'video', 'caisse'));
END $$;
