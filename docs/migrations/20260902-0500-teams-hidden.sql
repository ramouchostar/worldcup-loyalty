-- ============================================================
-- 2026-09-02 05:00 — Flag « équipes masquées » par établissement
-- (étape 10/10 du backlog onboarding, amende l'ADR 0031).
--
-- Kraainem masque déjà le concept d'équipe « le temps de valider s'il
-- prend » — mais c'était un hardcode isKraainem sur la vitrine. Le flag
-- rend ça configurable et pilote AUSSI la question d'équipe
-- (TeamRecognitionPrompt) : on ne pose pas la question dans un
-- établissement qui cache les équipes.
--
-- Sans cette migration : le code retombe sur le hardcode kraainem
-- (fail-open, lib/teams.ts getTeamsHidden). Idempotente.
-- ============================================================

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS teams_hidden BOOLEAN NOT NULL DEFAULT false;

UPDATE restaurants SET teams_hidden = true WHERE id = 'kraainem';

COMMENT ON COLUMN restaurants.teams_hidden IS
  'Étape 10 onboarding : masque le concept d''équipe côté membre (vitrine top5, question d''équipe). Réactivable depuis la base sans déploiement.';
