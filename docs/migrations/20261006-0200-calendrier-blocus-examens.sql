-- ============================================================
-- Signal « blocus et examens » : sessions des universités bruxelloises et
-- louvanistes dans `reference_calendar` (ADR 0074 §8, backlog plateforme
-- « Signal blocus et examens : calendriers universitaires », décidé 2026-10-01).
--
-- QUOI. Nouveau `kind = 'exam_session'` dans `reference_calendar` (ADR 0027
-- §5), avec trois colonnes : `institution` (ULB, VUB, UCLouvain, KU Leuven),
-- `city` (ville du campus — sert à décider quels établissements sont « proches
-- d'un campus ») et `phase` (`blocus` | `examens`). Pas d'API : saisie annuelle,
-- année académique 2026-2027 seedée ci-dessous.
--
-- POURQUOI. Pendant le blocus et les examens, les étudiants révisent tard le
-- soir : action type « offre tard le soir » pour les établissements proches
-- d'un campus. Le blocus est une ligne distincte des examens, c'est lui qui
-- porte l'offre.
--
-- FORECAST. Inchangé : `lib/forecast.ts` ne lit que `school_holiday` et
-- `national_event` ; la page forecast filtre désormais ces deux kinds
-- explicitement, donc ces lignes ne l'atteignent jamais.
--
-- SOURCES (lues le 2026-10-06, année académique 2026-2027) :
--   ULB        calendrier académique harmonisé en séquence de semaines (CoA,
--              avril 2026) — précision À LA SEMAINE (lundi → dimanche).
--   UCLouvain  calendrier académique 2026-2027 (CAC 15/12/2025, mis à jour au
--              05/02/2026). Le document ne fixe PAS le blocus : il est déduit
--              (fin des cours → début de la session).
--   KU Leuven  kuleuven.be/english/about-kuleuven/calendars/2026-2027
--              (campus de Leuven) — « study period » = blocus.
--   VUB        calendrier académique 2026-2027 (AR175). Pas de blocus officiel
--              en janvier (congé d'hiver) ; « pre-exam study week » en mai.
-- Les dates varient parfois selon la faculté : à revérifier en septembre
-- chaque année. Saisie annuelle = nouveau fichier de migration, même modèle.
--
-- RLS : inchangée — `reference_calendar` reste service-role only.
-- Idempotente : purge les lignes `exam_session` de l'année académique avant
-- de réinsérer (ne touche JAMAIS aux autres kinds).
-- ============================================================

BEGIN;

ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS institution TEXT;
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS city        TEXT;
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS phase       TEXT;

ALTER TABLE reference_calendar DROP CONSTRAINT IF EXISTS reference_calendar_kind_check;
ALTER TABLE reference_calendar ADD CONSTRAINT reference_calendar_kind_check
  CHECK (kind IN ('school_holiday', 'national_event', 'exam_session'));

ALTER TABLE reference_calendar DROP CONSTRAINT IF EXISTS reference_calendar_exam_session_check;
ALTER TABLE reference_calendar ADD CONSTRAINT reference_calendar_exam_session_check
  CHECK (
    kind <> 'exam_session'
    OR (institution IS NOT NULL AND city IS NOT NULL AND phase IN ('blocus', 'examens'))
  );

COMMENT ON COLUMN reference_calendar.institution IS
  'exam_session uniquement : ULB, VUB, UCLouvain ou KU Leuven.';
COMMENT ON COLUMN reference_calendar.city IS
  'exam_session uniquement : ville du campus (Bruxelles, Louvain-la-Neuve, Leuven). Rapprochée du secteur d''un établissement (lib/signals/blocus.ts).';
COMMENT ON COLUMN reference_calendar.phase IS
  'exam_session uniquement : blocus (préparation, tard le soir) ou examens.';

-- Année académique 2026-2027 : purge puis réinsertion.
DELETE FROM reference_calendar
 WHERE kind = 'exam_session'
   AND starts_on BETWEEN '2026-09-01' AND '2027-09-30';

-- Campus par université. UCLouvain : Louvain-la-Neuve et Woluwe (Bruxelles).
WITH campus(institution, city) AS (
  VALUES ('ULB', 'Bruxelles'),
         ('VUB', 'Bruxelles'),
         ('UCLouvain', 'Louvain-la-Neuve'),
         ('UCLouvain', 'Bruxelles'),
         ('KU Leuven', 'Leuven')
),
periode(institution, phase, starts_on, ends_on, label) AS (
  VALUES
    -- ── ULB (à la semaine près) ────────────────────────────────────────────
    ('ULB', 'blocus',  DATE '2026-11-30', DATE '2026-12-13', 'Blocus de janvier (ULB)'),
    ('ULB', 'examens', DATE '2026-12-14', DATE '2027-01-03', 'Session d''examens de janvier (ULB)'),
    ('ULB', 'blocus',  DATE '2027-05-17', DATE '2027-05-30', 'Blocus de juin (ULB)'),
    ('ULB', 'examens', DATE '2027-05-31', DATE '2027-06-27', 'Session d''examens de juin (ULB)'),
    ('ULB', 'examens', DATE '2027-08-16', DATE '2027-09-05', 'Seconde session d''août-septembre (ULB)'),
    -- ── UCLouvain (blocus déduit : fin des cours → début de session) ───────
    ('UCLouvain', 'blocus',  DATE '2026-12-20', DATE '2027-01-03', 'Blocus de janvier (UCLouvain)'),
    ('UCLouvain', 'examens', DATE '2027-01-04', DATE '2027-01-23', 'Session d''examens de janvier (UCLouvain)'),
    ('UCLouvain', 'blocus',  DATE '2027-05-16', DATE '2027-05-30', 'Blocus de juin (UCLouvain)'),
    ('UCLouvain', 'examens', DATE '2027-05-31', DATE '2027-06-26', 'Session d''examens de juin (UCLouvain)'),
    ('UCLouvain', 'examens', DATE '2027-08-13', DATE '2027-09-03', 'Troisième session d''août-septembre (UCLouvain)'),
    -- ── KU Leuven (study period = blocus) ──────────────────────────────────
    ('KU Leuven', 'blocus',  DATE '2027-01-04', DATE '2027-01-10', 'Blocus de janvier (KU Leuven)'),
    ('KU Leuven', 'examens', DATE '2027-01-11', DATE '2027-01-30', 'Examens de janvier (KU Leuven)'),
    ('KU Leuven', 'blocus',  DATE '2027-05-23', DATE '2027-06-06', 'Blocus de juin (KU Leuven)'),
    ('KU Leuven', 'examens', DATE '2027-06-07', DATE '2027-06-26', 'Examens de juin (KU Leuven)'),
    ('KU Leuven', 'examens', DATE '2027-08-16', DATE '2027-09-04', 'Troisième session d''août-septembre (KU Leuven)'),
    -- ── VUB (pas de blocus officiel en janvier : congé d'hiver) ────────────
    ('VUB', 'examens', DATE '2027-01-04', DATE '2027-01-30', 'Examens de janvier (VUB)'),
    ('VUB', 'blocus',  DATE '2027-05-24', DATE '2027-05-30', 'Semaine de préparation de juin (VUB)'),
    ('VUB', 'examens', DATE '2027-05-31', DATE '2027-07-03', 'Examens de juin (VUB)'),
    ('VUB', 'examens', DATE '2027-08-16', DATE '2027-09-11', 'Seconde session d''août-septembre (VUB)')
)
INSERT INTO reference_calendar (kind, community, starts_on, ends_on, label, expected_effect, institution, city, phase)
SELECT 'exam_session', NULL, p.starts_on, p.ends_on, p.label, NULL, p.institution, c.city, p.phase
  FROM periode p
  JOIN campus c ON c.institution = p.institution;

COMMIT;

-- Vérification : 19 périodes × campus = 24 lignes (UCLouvain compte deux fois).
SELECT institution, city, phase, starts_on, ends_on
  FROM reference_calendar
 WHERE kind = 'exam_session'
 ORDER BY institution, city, starts_on;
