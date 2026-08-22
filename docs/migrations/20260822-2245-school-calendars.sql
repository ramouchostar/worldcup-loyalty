-- ============================================================
-- 2026-08-22 22:45 — Calendriers scolaires MULTIPLES par établissement
-- (amendement ADR 0027 §5). À Bruxelles, la clientèle d'un resto suit
-- souvent les écoles francophones ET néerlandophones : un seul calendrier
-- ne reflète pas la réalité. Le restaurateur choisit 1 à 3 communautés
-- (FR / NL / DE). Idempotente.
--
-- `school_calendar` (TEXT, une seule valeur) est CONSERVÉE comme miroir
-- legacy (= premier élément) : les scripts/seeds qui la lisent continuent
-- de marcher ; le code lit `school_calendars` en priorité et retombe sur
-- `school_calendar` si la colonne manque (fail-open, CLAUDE.md § Collab 5).
-- ============================================================

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS school_calendars TEXT[];

-- Reprise de l'existant : un calendrier → un tableau d'un élément.
UPDATE restaurants
   SET school_calendars = ARRAY[school_calendar]
 WHERE school_calendars IS NULL
   AND school_calendar IS NOT NULL;

-- 1 à 3 valeurs, toutes parmi FR / NL / DE (NULL = non défini, facteur
-- vacances inactif dans les prévisions).
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_school_calendars_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_school_calendars_check CHECK (
  school_calendars IS NULL
  OR (
    cardinality(school_calendars) BETWEEN 1 AND 3
    AND school_calendars <@ ARRAY['FR','NL','DE']::TEXT[]
  )
);

COMMENT ON COLUMN restaurants.school_calendars IS
  'ADR 0027 §5 (amendé 2026-08-22) : communautés scolaires suivies par la clientèle, 1 à 3 parmi FR/NL/DE. Source de vérité ; school_calendar = miroir legacy (1er élément).';
