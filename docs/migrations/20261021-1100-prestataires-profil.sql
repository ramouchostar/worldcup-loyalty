-- ============================================================
-- Réserver un prestataire — le profil du prestataire (ADR 0084 §2 bis, PR S)
--
-- Ce que le restaurateur lit AVANT de confier un brief : ce que le prestataire fait, ce qu'il ne fait pas (le drone, la voix off…),
-- son matériel, sa zone, ses langues, des exemples de travaux. Un seul document par prestataire, relu à chaque lecture à travers
-- le nettoyage du code (lib/provider-profile.ts) : une règle qui change n'oblige pas à réécrire la base.
--
--   providers.profile             JSONB (jamais lu directement par un navigateur : la table est réservée au service)
--   providers.profile_updated_at  quand le prestataire l'a modifié pour la dernière fois
--
-- Idempotente. Sans la migration : l'écran du profil répond « pas encore disponible » et le restaurateur ne voit pas de carte
-- « À propos » ; rien d'autre ne change.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('providers') IS NOT NULL THEN
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS profile JSONB;
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
  END IF;
END $$;
