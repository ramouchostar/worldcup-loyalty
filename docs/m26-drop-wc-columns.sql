-- ============================================================
-- M26 : ADR 0014 — Retrait des colonnes Coupe du Monde de `teams`
--
-- Derniere etape du pivot. On retire les colonnes liees au tournoi :
-- country_code, round_reached, eliminated_at, round_advanced_at.
-- On CONSERVE `flag_emoji` (reutilise comme avatar d'equipe).
--
-- Prealable indispensable : supprimer d'abord le trigger et les fonctions
-- qui referencent ces colonnes, sinon ils deviennent invalides.
--   * on_round_advancement / handle_round_advancement (bonus de tour ×1.5,
--     declare BEFORE UPDATE OF round_reached) ;
--   * calculate_pending_reward (ancienne logique 3 couches en SQL, deja
--     remplacee cote TypeScript et orpheline depuis m20).
-- CASCADE retire au passage un eventuel trigger residuel.
--
-- A executer APRES deploiement du code qui ne lit plus ces colonnes.
-- Idempotente.
-- ============================================================

DROP TRIGGER  IF EXISTS on_round_advancement ON teams;
DROP FUNCTION IF EXISTS handle_round_advancement() CASCADE;
DROP FUNCTION IF EXISTS calculate_pending_reward() CASCADE;

ALTER TABLE teams
  DROP COLUMN IF EXISTS country_code,
  DROP COLUMN IF EXISTS round_reached,
  DROP COLUMN IF EXISTS eliminated_at,
  DROP COLUMN IF EXISTS round_advanced_at;
