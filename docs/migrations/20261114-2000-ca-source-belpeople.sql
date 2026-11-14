-- ADR 0103 (amendé le 2026-11-14) — le CA du jour peut venir de Belpeople.
--
-- Quoi : daily_revenue_entries.source accepte 'belpeople' (jusqu'ici 'console'
--   et 'plateforme'). Le cron /api/cron/belpeople-sync y écrit le CA TTC de
--   chaque jour rempli chez Belpeople (outcome 'historique' : un chiffre venu
--   d'ailleurs, pas une réponse au test de saisie), tickets = commandes.
--
-- Pourquoi : Belpeople remplace la saisie à la main pour les établissements
--   connectés (Kraainem). En écrivant dans la même table, Stats, « Ta
--   progression », les prévisions et Chloé lisent le chiffre sans changement.
--
-- Sans cette migration : l'écriture est refusée par la contrainte, le cron le
--   dit (journal belpeople_failed, /platform/ca en rouge) ; pos_daily_sales est
--   toujours rempli, rien n'est perdu.
--
-- RLS : inchangée (table service-role seulement). Idempotente.

DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'daily_revenue_entries'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE daily_revenue_entries DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE daily_revenue_entries
  ADD CONSTRAINT daily_revenue_entries_source_check
  CHECK (source IS NULL OR source IN ('console', 'plateforme', 'belpeople'));
