-- ============================================================
-- Vacances scolaires : synchronisation OpenHolidays (backlog plateforme
-- « API vacances scolaires : OpenHolidays (FR / NL / DE) », décidé 2026-10-01 ;
-- ADR 0027 §5 amendé).
--
-- QUOI.
--   1. `reference_calendar` reçoit `source` ('manuel' | 'openholidays') et
--      `external_id` (identifiant de la ligne chez OpenHolidays + communauté).
--      Les lignes existantes (seed m46, saisies à la main) deviennent
--      `source = 'manuel'`. Un index unique (source, external_id) rend la
--      synchro rejouable sans doublon.
--   2. `signal_sync_runs` : une ligne par exécution d'une synchro de signal
--      extérieur (source, réussite, lignes écrites/retirées, trous, erreur,
--      durée). Générique : l'écran de suivi des sources (ADR du copilote) peut
--      la lire aussi. Aucune synchro ne doit échouer en silence.
--
-- POURQUOI. m46 s'arrête à l'été 2027 et se saisit à la main. L'API
-- (openholidaysapi.org, sans clé) fournit le calendrier des trois communautés.
-- Mais elle a des trous (aucune vacance germanophone après l'été 2026 ; l'été
-- francophone 2027 n'a qu'une date de début) : la saisie manuelle reste en
-- repli là où l'API ne dit rien (décision du 2026-10-06 : « API prioritaire,
-- saisie en repli »). Le code (lib/signals/school-holidays.ts) décide ligne
-- par ligne ; chaque retrait d'une ligne manuelle est écrit dans le journal.
--
-- ÉCART DÉJÀ CONNU. Le seed m46 donne la Toussaint flamande 2026 du 26/10 au
-- 01/11 ; l'API donne du 02/11 au 08/11 (le 1er novembre 2026 tombe un
-- dimanche, la semaine de congé est celle d'après). L'API prime : la synchro
-- remplace la ligne manuelle.
--
-- RLS : inchangée pour `reference_calendar` ; `signal_sync_runs` en RLS sans
-- policy (service-role only). Idempotente.
-- ============================================================

BEGIN;

ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'manuel';
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE reference_calendar DROP CONSTRAINT IF EXISTS reference_calendar_source_check;
ALTER TABLE reference_calendar ADD CONSTRAINT reference_calendar_source_check
  CHECK (source IN ('manuel', 'openholidays'));

-- Une ligne de l'API n'existe qu'une fois. Les lignes manuelles ont un
-- `external_id` NULL : en SQL deux NULL sont distincts, elles ne se heurtent
-- pas. Index NON partiel exprès : l'upsert de la synchro (ON CONFLICT
-- (source, external_id)) ne peut pas s'appuyer sur un index partiel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_calendar_source_external
  ON reference_calendar (source, external_id);

COMMENT ON COLUMN reference_calendar.source IS
  'manuel : seed m46 ou saisie plateforme ; openholidays : synchronisée par /api/cron/school-holidays (lib/signals/school-holidays.ts).';
COMMENT ON COLUMN reference_calendar.external_id IS
  'openholidays uniquement : identifiant OpenHolidays de la période + communauté (« <uuid>:FR »).';

CREATE TABLE IF NOT EXISTS signal_sync_runs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source        TEXT        NOT NULL,
  ok            BOOLEAN     NOT NULL,
  rows_written  INTEGER     NOT NULL DEFAULT 0,
  rows_removed  INTEGER     NOT NULL DEFAULT 0,
  gaps          INTEGER     NOT NULL DEFAULT 0,
  detail        JSONB,
  error         TEXT,
  duration_ms   INTEGER,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE signal_sync_runs ENABLE ROW LEVEL SECURITY; -- service-role only
CREATE INDEX IF NOT EXISTS idx_signal_sync_runs_source_ran ON signal_sync_runs (source, ran_at DESC);

COMMENT ON TABLE signal_sync_runs IS
  'Une ligne par synchro de signal extérieur (OpenHolidays, puis les autres sources). `gaps` = périodes attendues que la source ne fournit pas ; `detail` = lignes retirées, communautés couvertes.';

COMMIT;

-- Vérification : les lignes existantes sont toutes « manuel », le journal est vide.
SELECT source, kind, COUNT(*) FROM reference_calendar GROUP BY 1, 2 ORDER BY 1, 2;
SELECT COUNT(*) AS runs FROM signal_sync_runs;
