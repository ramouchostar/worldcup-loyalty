-- ============================================================
-- CA du jour saisi à la main (ADR 0078)
--
-- Quoi :
--   daily_revenue_entries  un jour noté pour un établissement : le chiffre d'affaires
--                          (TVA comprise) reçu du responsable de caisse, le nombre de
--                          tickets s'il le donne, et CE QUI S'EST PASSÉ (répondu,
--                          après relance, pas de réponse, fermé, historique d'avant
--                          le test) avec les heures d'envoi et de réponse.
--   save_daily_revenue     écrit le jour ET le reporte dans restaurant_sales (une ligne
--                          sans heure), dans la même transaction : la prévision
--                          (ADR 0027) le lit sans changement.
--   delete_daily_revenue   retire le jour et sa ligne de vente.
--
-- Pourquoi : pas d'export ni d'API sur la plateforme de caisse Belchicken (Belpeople).
-- On teste à la main pendant 14 jours si un responsable de caisse répond chaque matin
-- au WhatsApp « CA d'hier ? » ; la page /platform/ca garde le chiffre et la trace du
-- test (taux de réponse) avant de construire le rappel automatique.
--
-- Règles :
--   - un seul jour par établissement (UNIQUE) : une nouvelle saisie remplace l'ancienne ;
--   - un jour fermé ou sans réponse n'a PAS de ligne de vente — jamais un 0 €, qui ferait
--     baisser les médianes de la prévision ;
--   - noter un jour remplace les ventes de ce jour, y compris celles d'un import CSV
--     (même règle « remplacement par plage » que l'import, sur un seul jour). Un import
--     CSV ultérieur qui couvre ce jour reprend la main sur restaurant_sales.
--
-- Sécurité : chiffre d'affaires = donnée sensible, jamais côté membre (ADR 0007).
-- RLS activée SANS policy = service-role uniquement ; RPC SECURITY DEFINER exécutables
-- par service_role seulement. Lues et écrites par /platform/ca (super-admin vérifié
-- côté serveur).
--
-- Idempotent. Si la migration n'est pas appliquée : /platform/ca affiche « table
-- absente », rien d'autre dans l'app n'en dépend (fail-open).
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_revenue_entries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  text        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sales_day      date        NOT NULL,
  outcome        text        NOT NULL
                 CHECK (outcome IN ('repondu', 'relance', 'sans_reponse', 'ferme', 'historique')),
  amount         numeric(10, 2) CHECK (amount IS NULL OR amount >= 0),
  tickets        int         CHECK (tickets IS NULL OR tickets >= 0),
  asked_at       time,       -- heure d'envoi du message (Europe/Brussels)
  replied_at     time,       -- heure de la réponse
  note           text,
  entered_by     uuid        REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, sales_day),
  -- un montant exactement quand il y a eu une réponse (ou un chiffre d'historique)
  CHECK ((outcome IN ('repondu', 'relance', 'historique')) = (amount IS NOT NULL))
);

ALTER TABLE daily_revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION save_daily_revenue(
  p_restaurant_id TEXT,
  p_day           DATE,
  p_outcome       TEXT,
  p_amount        NUMERIC,
  p_tickets       INT,
  p_asked_at      TIME,
  p_replied_at    TIME,
  p_note          TEXT,
  p_entered_by    UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO daily_revenue_entries
    (restaurant_id, sales_day, outcome, amount, tickets, asked_at, replied_at, note, entered_by)
  VALUES
    (p_restaurant_id, p_day, p_outcome, p_amount, p_tickets, p_asked_at, p_replied_at, p_note, p_entered_by)
  ON CONFLICT (restaurant_id, sales_day) DO UPDATE SET
    outcome    = EXCLUDED.outcome,
    amount     = EXCLUDED.amount,
    tickets    = EXCLUDED.tickets,
    asked_at   = EXCLUDED.asked_at,
    replied_at = EXCLUDED.replied_at,
    note       = EXCLUDED.note,
    entered_by = EXCLUDED.entered_by,
    updated_at = now();

  DELETE FROM restaurant_sales WHERE restaurant_id = p_restaurant_id AND sold_on = p_day;

  IF p_amount IS NOT NULL THEN
    INSERT INTO restaurant_sales (restaurant_id, sold_on, sold_at, amount, source_import_id)
    VALUES (p_restaurant_id, p_day, NULL, p_amount, NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_daily_revenue(p_restaurant_id TEXT, p_day DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM daily_revenue_entries WHERE restaurant_id = p_restaurant_id AND sales_day = p_day;
  DELETE FROM restaurant_sales WHERE restaurant_id = p_restaurant_id AND sold_on = p_day;
END;
$$;

REVOKE ALL     ON FUNCTION save_daily_revenue(TEXT, DATE, TEXT, NUMERIC, INT, TIME, TIME, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION save_daily_revenue(TEXT, DATE, TEXT, NUMERIC, INT, TIME, TIME, TEXT, UUID) TO service_role;
REVOKE ALL     ON FUNCTION delete_daily_revenue(TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION delete_daily_revenue(TEXT, DATE) TO service_role;
