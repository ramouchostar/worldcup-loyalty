-- ============================================================
-- Réserver un prestataire — la langue du prestataire (ADR 0084 §5 terdecies, PR Z1)
--
-- Chaque prestataire lit son espace et ses e-mails dans SA langue : français (par défaut), néerlandais ou anglais. Il la change
-- lui-même depuis son espace ; la plateforme peut la fixer à l'invitation.
--
--   providers.locale   'fr' | 'nl' | 'en', défaut 'fr' (les prestataires existants ne changent pas de langue).
--
-- Idempotente. Sans la migration : tout reste en français et le sélecteur de langue répond « impossible pour le moment ».
-- ============================================================

DO $$
BEGIN
  IF to_regclass('providers') IS NOT NULL THEN
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fr';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'providers_locale_check') THEN
      ALTER TABLE providers ADD CONSTRAINT providers_locale_check CHECK (locale IN ('fr', 'nl', 'en'));
    END IF;
  END IF;
END $$;
