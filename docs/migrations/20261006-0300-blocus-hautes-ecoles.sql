-- ============================================================
-- Signal « blocus et examens » : quatre hautes écoles bruxelloises
-- (suite de 20261006-0200-calendrier-blocus-examens.sql, PR #284).
--
-- QUOI. Même modèle (`reference_calendar`, kind `exam_session`, colonnes
-- `institution` / `city` / `phase`), année académique 2026-2027, pour :
-- Haute École Léonard de Vinci, EPHEC, HE2B, Erasmushogeschool Brussel (EHB).
-- Pas de changement de schéma.
--
-- POURQUOI CES QUATRE. La seule haute école citée par un vrai établissement
-- (Kraainem) est Léonard de Vinci ; EPHEC, HE2B et EHB sont les plus fréquentes
-- à Bruxelles. D'autres s'ajoutent quand un restaurateur en déclare une.
--
-- SOURCES (lues le 2026-10-06, 2026-2027) :
--   Vinci  Règlement général des études 2026-2027, annexe 1 (calendrier à la
--          semaine). Le blocus d'août est écrit dans le calendrier ; en juin il
--          est mêlé au début de session (pas de ligne de blocus séparée). Les
--          mentions « Blocus » pendant le congé de printemps (26/04-05/05) ne
--          sont pas reprises : elles ne concernent que certains cursus.
--   HE2B   calendrier académique 2026-2027 (PDF he2b.be, approuvé par le CA).
--          Pas de blocus officiel ; la semaine du 24-30 mai est « AA/évaluations »
--          (mêlée) : la session de juin est comptée à partir du 31 mai.
--   EHB    « Academiejaarkalender 2026-2027 » (PDF erasmushogeschool.be) et page
--          calendrier : examens 4-29 janvier et 31 mai-25 juin ; seconde zit
--          (EK2) du 16 août au 5 septembre. Pas de blocus.
--   EPHEC  Règlement des études 2026-2027, annexe 3 : calendrier en IMAGE,
--          lu à l'œil. À VÉRIFIER : la semaine du 4 janvier est ambiguë (fin de
--          quadrimestre ou début d'examens) ; la session de janvier est saisie
--          du 11 au 31, la plus prudente. Juin (31/05-27/06) et la session
--          d'août (16/08-05/09) sont lisibles sans ambiguïté.
-- Les dates varient parfois selon le département ou la section : à revérifier
-- chaque septembre.
--
-- RLS : inchangée — `reference_calendar` reste service-role only.
-- Idempotente : purge les lignes `exam_session` de CES quatre écoles pour
-- l'année académique, puis réinsère. Ne touche à aucune autre ligne.
-- ============================================================

BEGIN;

DELETE FROM reference_calendar
 WHERE kind = 'exam_session'
   AND institution IN ('Haute École Léonard de Vinci', 'EPHEC', 'HE2B', 'EHB')
   AND starts_on BETWEEN '2026-09-01' AND '2027-09-30';

-- Campus. Vinci et EPHEC : Bruxelles (Woluwe, Parnasse…) et Louvain-la-Neuve.
WITH campus(institution, city) AS (
  VALUES ('Haute École Léonard de Vinci', 'Bruxelles'),
         ('Haute École Léonard de Vinci', 'Louvain-la-Neuve'),
         ('EPHEC', 'Bruxelles'),
         ('EPHEC', 'Louvain-la-Neuve'),
         ('HE2B', 'Bruxelles'),
         ('EHB', 'Bruxelles')
),
periode(institution, phase, starts_on, ends_on, label) AS (
  VALUES
    -- ── Léonard de Vinci ───────────────────────────────────────────────────
    ('Haute École Léonard de Vinci', 'blocus',  DATE '2026-12-21', DATE '2027-01-03', 'Blocus de janvier (HE Vinci)'),
    ('Haute École Léonard de Vinci', 'examens', DATE '2027-01-04', DATE '2027-01-23', 'Session d''examens de janvier (HE Vinci)'),
    ('Haute École Léonard de Vinci', 'examens', DATE '2027-05-24', DATE '2027-06-19', 'Session d''examens de juin (HE Vinci)'),
    ('Haute École Léonard de Vinci', 'blocus',  DATE '2027-08-02', DATE '2027-08-08', 'Blocus d''août (HE Vinci)'),
    ('Haute École Léonard de Vinci', 'examens', DATE '2027-08-09', DATE '2027-09-01', 'Session d''examens d''août-septembre (HE Vinci)'),
    -- ── EPHEC (calendrier en image : janvier à vérifier) ───────────────────
    ('EPHEC', 'examens', DATE '2027-01-11', DATE '2027-01-31', 'Examens de janvier (EPHEC)'),
    ('EPHEC', 'examens', DATE '2027-05-31', DATE '2027-06-27', 'Examens de juin (EPHEC)'),
    ('EPHEC', 'examens', DATE '2027-08-16', DATE '2027-09-05', 'Seconde session d''août-septembre (EPHEC)'),
    -- ── HE2B ───────────────────────────────────────────────────────────────
    ('HE2B', 'examens', DATE '2027-01-04', DATE '2027-01-31', 'Évaluations de janvier (HE2B)'),
    ('HE2B', 'examens', DATE '2027-05-31', DATE '2027-06-27', 'Évaluations de juin (HE2B)'),
    ('HE2B', 'examens', DATE '2027-08-16', DATE '2027-09-05', 'Évaluations d''août-septembre (HE2B)'),
    -- ── Erasmushogeschool Brussel ──────────────────────────────────────────
    ('EHB', 'examens', DATE '2027-01-04', DATE '2027-01-29', 'Examens de janvier (EHB)'),
    ('EHB', 'examens', DATE '2027-05-31', DATE '2027-06-25', 'Examens de juin (EHB)'),
    ('EHB', 'examens', DATE '2027-08-16', DATE '2027-09-05', 'Seconde zit d''août-septembre (EHB)')
)
INSERT INTO reference_calendar (kind, community, starts_on, ends_on, label, expected_effect, institution, city, phase)
SELECT 'exam_session', NULL, p.starts_on, p.ends_on, p.label, NULL, p.institution, c.city, p.phase
  FROM periode p
  JOIN campus c ON c.institution = p.institution;

COMMIT;

-- Vérification : 22 lignes attendues
-- (Vinci 5 périodes × 2 campus, EPHEC 3 × 2, HE2B 3, EHB 3 → 10 + 6 + 3 + 3).
SELECT institution, city, phase, starts_on, ends_on
  FROM reference_calendar
 WHERE kind = 'exam_session'
   AND institution IN ('Haute École Léonard de Vinci', 'EPHEC', 'HE2B', 'EHB')
 ORDER BY institution, city, starts_on;
