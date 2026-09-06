-- ============================================================
-- Backlog plateforme : co-attribution + validation par personne (ADR 0033 §3)
--
-- POURQUOI. `platform_backlog.owner` ne porte qu'un seul prénom. Or certaines
-- actions doivent être faites par CHACUN de son côté (« tester le parcours
-- ticket sur iPhone ET Android », « relancer chacun ses restos ») : avec un
-- seul propriétaire, soit l'action est dupliquée en deux cartes qui divergent,
-- soit l'un valide pour les deux et la case cochée ment.
--
-- QUOI. Deux colonnes, sur la même table (le backlog reste un objet plat —
-- un backlog qui demande à être administré n'est plus tenu à jour) :
--   1. `owners`      — les personnes attribuées, 0..n ;
--   2. `validations` — qui a validé sa part, et quand.
-- L'app en déduit le statut : une action co-attribuée passe à « fait » quand
-- TOUTES les personnes attribuées ont validé (lib/backlog-model.ts,
-- statusAfterValidation).
--
-- RLS : inchangée. `platform_backlog` reste service-role only (RLS activée,
-- aucune policy) — donnée interne fondateurs, jamais lisible par la clé anon.
-- Aucun impact membre ni restaurateur.
--
-- Idempotente : rejouable sans effet de bord (le backfill ne touche que les
-- lignes encore vides).
-- ============================================================


-- ============================================================
-- 1. owners — attribution multiple
-- ============================================================

ALTER TABLE platform_backlog
  ADD COLUMN IF NOT EXISTS owners TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN platform_backlog.owners IS
  'Personnes attribuées (0..n), prénoms libres — remplace `owner` (ADR 0033 §3). Une action co-attribuée est faite par chacun de son côté et n''est close que quand tout le monde a validé sa part (voir validations).';

-- Reprise de l'existant : un propriétaire unique devient un tableau à un
-- élément. `owners = '{}'` en garde → un rejeu n'écrase pas une attribution
-- multiple posée depuis la console.
UPDATE platform_backlog
   SET owners = ARRAY[btrim(owner)]
 WHERE owner IS NOT NULL AND btrim(owner) <> '' AND owners = '{}';

COMMENT ON COLUMN platform_backlog.owner IS
  'HÉRITÉ — remplacé par owners[] . Tenu à jour en miroir (première personne attribuée) pour qu''un retour en arrière du code ne perde pas l''attribution ; ne rien lire d''autre ici.';

-- Le filtre « les actions de X » est le geste courant du tableau.
CREATE INDEX IF NOT EXISTS idx_platform_backlog_owners
  ON platform_backlog USING GIN (owners);


-- ============================================================
-- 2. validations — qui a validé sa part, et quand
-- ============================================================
--
-- Forme : { "Mehdi": { "at": "2026-09-06T20:11:00.000Z", "by": "<uuid profil>" } }
--   - la clé est le prénom attribué (même vocabulaire que owners) ;
--   - `at` est la date affichée sur la carte ;
--   - `by` est le compte qui a cliqué : on partage la console à deux, rien
--     n'empêche de valider à la place de l'autre — la trace, elle, reste.
-- Une clé absente = part non validée. Une clé qui n'est plus dans owners est
-- ignorée par l'app (jamais effacée : si la personne est ré-attribuée, sa
-- validation revient telle quelle).

ALTER TABLE platform_backlog
  ADD COLUMN IF NOT EXISTS validations JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN platform_backlog.validations IS
  'Validations par personne : { "<prénom>": { "at": <ISO>, "by": <uuid profil|null> } } (ADR 0033 §3). L''action passe à « fait » quand toutes les personnes de owners y figurent.';

-- Reprise de l'existant : une action déjà « faite » et attribuée est
-- considérée validée par la personne à qui elle était attribuée, à sa date de
-- clôture. Sans ça, toutes les actions closes de l'historique réapparaîtraient
-- « en attente de validation » au premier chargement.
UPDATE platform_backlog
   SET validations = jsonb_build_object(
         owners[1],
         jsonb_build_object('at', to_char(COALESCE(done_at, updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'by', NULL)
       )
 WHERE status = 'fait'
   AND array_length(owners, 1) = 1
   AND validations = '{}'::jsonb;


-- ============================================================
-- 3. Vérification
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'platform_backlog' AND column_name = 'owners')      AS owners_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'platform_backlog' AND column_name = 'validations') AS validations_ok,
  (SELECT COUNT(*) FROM platform_backlog WHERE array_length(owners, 1) > 1) AS co_attribuees,
  (SELECT COUNT(*) FROM platform_backlog WHERE validations <> '{}'::jsonb)  AS avec_validation;
