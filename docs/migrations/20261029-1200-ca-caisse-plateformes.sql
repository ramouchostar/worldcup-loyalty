-- ============================================================
-- CA du jour : la caisse par moyen de paiement, les plateformes à part
-- (ADR 0087 §2, amendé le 2026-10-29 après la démo avec De Bue)
--
-- Quoi :
--   daily_revenue_entries   + carte, cash, internet (commandes en ligne sans commission).
--                             uber, deliveroo, takeaway restent ; emporter et sur_place ne
--                             sont plus saisis (les jours déjà notés les gardent, la console
--                             les rappelle quand on rouvre le jour).
--   save_daily_revenue_console()  nouvelle signature : carte, cash, internet, uber,
--                             deliveroo, takeaway. Le total est TOUJOURS la somme des deux
--                             blocs (calculée par l'app, relue ici) ; resaisir un jour efface
--                             l'ancien découpage sur place / à emporter.
--
-- Pourquoi : taper le total effaçait les canaux (constat en démo, 2026-10-28) ; le
-- restaurateur lit sa caisse par moyen de paiement, pas par sur place / à emporter.
--
-- Sécurité : inchangée — RLS sans policy, RPC SECURITY DEFINER réservée au service_role.
-- Idempotente. Sans elle : la saisie marche quand même (repli sur save_daily_revenue,
-- détail recopié dans la note), comme avant la migration 20261024-1530.
-- ============================================================

ALTER TABLE daily_revenue_entries
  ADD COLUMN IF NOT EXISTS carte    NUMERIC(10,2) CHECK (carte    IS NULL OR carte    >= 0),
  ADD COLUMN IF NOT EXISTS cash     NUMERIC(10,2) CHECK (cash     IS NULL OR cash     >= 0),
  ADD COLUMN IF NOT EXISTS internet NUMERIC(10,2) CHECK (internet IS NULL OR internet >= 0);

DROP FUNCTION IF EXISTS save_daily_revenue_console(TEXT, DATE, BOOLEAN, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID);

CREATE OR REPLACE FUNCTION save_daily_revenue_console(
  p_restaurant_id TEXT,
  p_day           DATE,
  p_closed        BOOLEAN,
  p_amount        NUMERIC,
  p_tickets       INT,
  p_carte         NUMERIC,
  p_cash          NUMERIC,
  p_internet      NUMERIC,
  p_uber          NUMERIC,
  p_deliveroo     NUMERIC,
  p_takeaway      NUMERIC,
  p_entered_by    UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC := CASE WHEN p_closed THEN NULL ELSE p_amount END;
  v_sum    NUMERIC := COALESCE(p_carte, 0) + COALESCE(p_cash, 0) + COALESCE(p_internet, 0)
                    + COALESCE(p_uber, 0) + COALESCE(p_deliveroo, 0) + COALESCE(p_takeaway, 0);
BEGIN
  IF NOT p_closed AND p_amount IS NULL THEN
    RAISE EXCEPTION 'montant requis pour un jour ouvert';
  END IF;
  -- Le total n'est jamais une seconde source : il vaut la somme des deux blocs.
  IF NOT p_closed AND abs(v_sum - p_amount) > 0.01 THEN
    RAISE EXCEPTION 'total % différent de la somme caisse + plateformes %', p_amount, v_sum;
  END IF;

  INSERT INTO daily_revenue_entries
    (restaurant_id, sales_day, outcome, amount, tickets, asked_at, replied_at, note, entered_by,
     carte, cash, internet, uber, deliveroo, takeaway, emporter, sur_place, source)
  VALUES
    (p_restaurant_id, p_day, CASE WHEN p_closed THEN 'ferme' ELSE 'saisi' END, v_amount,
     CASE WHEN p_closed THEN NULL ELSE p_tickets END,
     NULL, (now() AT TIME ZONE 'Europe/Brussels')::time, NULL, p_entered_by,
     CASE WHEN p_closed THEN NULL ELSE p_carte END,
     CASE WHEN p_closed THEN NULL ELSE p_cash END,
     CASE WHEN p_closed THEN NULL ELSE p_internet END,
     CASE WHEN p_closed THEN NULL ELSE p_uber END,
     CASE WHEN p_closed THEN NULL ELSE p_deliveroo END,
     CASE WHEN p_closed THEN NULL ELSE p_takeaway END,
     NULL, NULL,
     'console')
  ON CONFLICT (restaurant_id, sales_day) DO UPDATE SET
    outcome    = EXCLUDED.outcome,
    amount     = EXCLUDED.amount,
    tickets    = EXCLUDED.tickets,
    replied_at = EXCLUDED.replied_at,
    entered_by = EXCLUDED.entered_by,
    carte      = EXCLUDED.carte,
    cash       = EXCLUDED.cash,
    internet   = EXCLUDED.internet,
    uber       = EXCLUDED.uber,
    deliveroo  = EXCLUDED.deliveroo,
    takeaway   = EXCLUDED.takeaway,
    emporter   = NULL,
    sur_place  = NULL,
    source     = EXCLUDED.source,
    updated_at = now();

  DELETE FROM restaurant_sales WHERE restaurant_id = p_restaurant_id AND sold_on = p_day;

  IF v_amount IS NOT NULL THEN
    INSERT INTO restaurant_sales (restaurant_id, sold_on, sold_at, amount, source_import_id)
    VALUES (p_restaurant_id, p_day, NULL, v_amount, NULL);
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION save_daily_revenue_console(TEXT, DATE, BOOLEAN, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION save_daily_revenue_console(TEXT, DATE, BOOLEAN, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID) TO service_role;

-- Contrôle : SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'save_daily_revenue_console';
