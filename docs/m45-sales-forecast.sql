-- ============================================================
-- M45 : Import ventes caisse + forecast de CA (ADR 0027)
--
-- 4 tables, TOUTES service-role only (RLS activée, AUCUNE policy) — jamais
-- lues ni écrites côté client. Les ventes caisse et les prévisions sont des
-- surfaces ADMIN (l'ADR 0007 ne vise que le membre). Idempotent, non-cassant.
-- ============================================================

-- 1. Journal des imports (audit + « dernier import »)
CREATE TABLE IF NOT EXISTS sales_imports (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  filename      TEXT,
  row_count     INTEGER     NOT NULL DEFAULT 0,
  date_min      DATE,
  date_max      DATE,
  imported_by   UUID        REFERENCES profiles(id),
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sales_imports ENABLE ROW LEVEL SECURITY; -- service-role only

-- 2. Ventes caisse importées (matière brute du forecast). JAMAIS affichées
--    ligne à ligne. Remplacées par plage de dates à chaque ré-import (§4 ADR).
CREATE TABLE IF NOT EXISTS restaurant_sales (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id    TEXT          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sold_on          DATE          NOT NULL,
  sold_at          TIME,                                     -- nullable : améliore la granularité créneau (ADR 0020) si présent
  amount           NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  source_import_id UUID          REFERENCES sales_imports(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE restaurant_sales ENABLE ROW LEVEL SECURITY; -- service-role only
CREATE INDEX IF NOT EXISTS idx_restaurant_sales_resto_date ON restaurant_sales (restaurant_id, sold_on);

-- 3. Calendrier de référence PLATEFORME : vacances scolaires (par communauté
--    FR/NL/DE — la Belgique en a 3, réforme rythme scolaire FR 2022) +
--    événements nationaux/sportifs. Peuplé et maintenu par la plateforme.
--    expected_effect = indice de sens ; l'AMPLEUR reste calibrée sur le CSV.
CREATE TABLE IF NOT EXISTS reference_calendar (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  kind            TEXT        NOT NULL CHECK (kind IN ('school_holiday','national_event')),
  community       TEXT        CHECK (community IN ('FR','NL','DE')), -- NULL = toutes (événement national)
  starts_on       DATE        NOT NULL,
  ends_on         DATE        NOT NULL,
  label           TEXT        NOT NULL,
  expected_effect TEXT        CHECK (expected_effect IN ('up','down')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reference_calendar ENABLE ROW LEVEL SECURITY; -- service-role only
CREATE INDEX IF NOT EXISTS idx_reference_calendar_dates ON reference_calendar (starts_on, ends_on);

-- 4. Événements LOCAUX ajoutés par le restaurateur (braderie de quartier,
--    concert voisin, fermeture exceptionnelle…). Écriture via route admin gardée.
CREATE TABLE IF NOT EXISTS restaurant_events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id   TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  starts_on       DATE        NOT NULL,
  ends_on         DATE        NOT NULL,
  label           TEXT        NOT NULL,
  expected_effect TEXT        NOT NULL DEFAULT 'up' CHECK (expected_effect IN ('up','down')),
  created_by      UUID        REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE restaurant_events ENABLE ROW LEVEL SECURITY; -- service-role only
CREATE INDEX IF NOT EXISTS idx_restaurant_events_resto ON restaurant_events (restaurant_id, starts_on);

-- 5. Communauté scolaire de l'établissement (pour piocher le bon calendrier).
--    Déduite du secteur/adresse à l'onboarding, ajustable.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS school_calendar TEXT
  CHECK (school_calendar IN ('FR','NL','DE'));

-- 6. Import transactionnel des ventes caisse (ADR 0027 §4).
--    DELETE (plage de dates du fichier) + INSERT en UNE transaction (le corps
--    de fonction est atomique) → un ré-import écrase proprement la période
--    couverte : jamais de doublon, jamais de perte. Appelé via le client
--    service-role ; SECURITY DEFINER + search_path figé par prudence (motif
--    des RPC transactionnels ADR 0011 / 0021).
CREATE OR REPLACE FUNCTION import_restaurant_sales(
  p_restaurant_id TEXT,
  p_filename      TEXT,
  p_imported_by   UUID,
  p_rows          JSONB   -- [{ "d":"2026-07-01", "t":"12:30"|null, "a":12.50 }, …]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import_id UUID;
  v_date_min  DATE;
  v_date_max  DATE;
  v_count     INTEGER;
BEGIN
  SELECT COUNT(*), MIN((r->>'d')::date), MAX((r->>'d')::date)
    INTO v_count, v_date_min, v_date_max
    FROM jsonb_array_elements(p_rows) AS r;

  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Aucune ligne à importer.';
  END IF;

  INSERT INTO sales_imports (restaurant_id, filename, row_count, date_min, date_max, imported_by)
  VALUES (p_restaurant_id, p_filename, v_count, v_date_min, v_date_max, p_imported_by)
  RETURNING id INTO v_import_id;

  -- Remplacement par plage : efface tout l'existant sur [min,max] couvert.
  DELETE FROM restaurant_sales
   WHERE restaurant_id = p_restaurant_id
     AND sold_on BETWEEN v_date_min AND v_date_max;

  INSERT INTO restaurant_sales (restaurant_id, sold_on, sold_at, amount, source_import_id)
  SELECT p_restaurant_id,
         (r->>'d')::date,
         NULLIF(r->>'t', '')::time,
         (r->>'a')::numeric,
         v_import_id
    FROM jsonb_array_elements(p_rows) AS r;

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'row_count', v_count,
    'date_min',  v_date_min,
    'date_max',  v_date_max
  );
END;
$$;

-- Exécution réservée au service-role (l'app appelle via createAdminClient).
REVOKE ALL     ON FUNCTION import_restaurant_sales(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION import_restaurant_sales(TEXT, TEXT, UUID, JSONB) TO   service_role;

-- 7. Agrégat journalier pour le forecast : renvoie ~1 ligne par jour au lieu
--    de charger tous les tickets côté serveur (une caisse chargée = des
--    dizaines de milliers de lignes). Le forecast v1 raisonne au jour.
CREATE OR REPLACE FUNCTION daily_sales_totals(p_restaurant_id TEXT, p_since DATE)
RETURNS TABLE (sold_on DATE, total NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sold_on, SUM(amount)::numeric AS total
    FROM restaurant_sales
   WHERE restaurant_id = p_restaurant_id
     AND sold_on >= p_since
   GROUP BY sold_on
   ORDER BY sold_on;
$$;
REVOKE ALL     ON FUNCTION daily_sales_totals(TEXT, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION daily_sales_totals(TEXT, DATE) TO   service_role;

-- ------------------------------------------------------------
-- SEED reference_calendar : voir docs/m46-reference-calendar-seed.sql
-- (calendrier scolaire belge officiel des 3 communautés + événements
-- nationaux, carnaval 2026 → été 2027). À appliquer APRÈS cette migration.
-- Le forecast fonctionne même sans (facteur vacances/événement inactif tant
-- que la table est vide ; paye et jours fériés sont CALCULÉS en code).
-- ------------------------------------------------------------
