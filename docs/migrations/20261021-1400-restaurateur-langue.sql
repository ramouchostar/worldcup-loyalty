-- ============================================================
-- Réserver un prestataire — la langue du restaurateur (ADR 0084 §5 terdecies, PR Z6)
--
-- Le restaurateur lit les pages « Prestataires » et les e-mails du module dans SA langue : français (par défaut), néerlandais ou anglais.
-- Une langue par PERSONNE (pas par établissement : deux associés peuvent lire dans deux langues).
--
--   profiles.locale   'fr' | 'nl' | 'en', NULL = français. Nullable, sans valeur par défaut : aucune ligne existante ne change.
--
-- Idempotente. Sans la migration : tout reste en français et le sélecteur répond « impossible pour le moment ».
-- ============================================================

DO $$
BEGIN
  IF to_regclass('profiles') IS NOT NULL THEN
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locale TEXT;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_locale_check') THEN
      ALTER TABLE profiles ADD CONSTRAINT profiles_locale_check CHECK (locale IS NULL OR locale IN ('fr', 'nl', 'en'));
    END IF;
  END IF;
END $$;
