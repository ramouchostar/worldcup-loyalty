-- ============================================================
-- M30 : ADR 0016 — secteur géographique d'un établissement
--
-- Maille d'agrégation commerciale de la page publique /secteurs
-- (texte libre ville/quartier, distinct de address qui localise un
-- établissement précis). Obligatoire à l'inscription partenaire —
-- validé côté application (app/become-a-partner/actions.ts), pas de
-- contrainte NOT NULL pour ne pas casser les lignes historiques.
-- ============================================================

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sector TEXT;

-- Backfill de l'établissement pilote (antérieur au self-service)
UPDATE restaurants SET sector = 'Kraainem' WHERE id = 'kraainem' AND sector IS NULL;
