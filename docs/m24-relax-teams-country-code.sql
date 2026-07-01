-- ============================================================
-- M24 : ADR 0014 — Autoriser les équipes communautaires dans `teams`
--
-- Les équipes communautaires n'ont pas de code pays. `country_code` était
-- NOT NULL UNIQUE (équipes nationales Coupe du Monde). On relâche la
-- contrainte NOT NULL pour permettre l'insertion d'équipes communautaires
-- (country_code NULL). Postgres autorise plusieurs NULL dans un UNIQUE, mais
-- on retire aussi la contrainte d'unicité par propreté. Colonnes WC retirées
-- entièrement en T9. Idempotente.
-- ============================================================

ALTER TABLE teams ALTER COLUMN country_code DROP NOT NULL;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_country_code_key;
