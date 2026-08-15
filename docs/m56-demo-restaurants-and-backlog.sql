-- ============================================================
-- M56 : Comptes démo + backlog plateforme + date d'activation (ADR 0033)
--
-- Trois ajouts au socle de la console plateforme, tous non-cassants et
-- idempotents (sûrs à rejouer) :
--
--   1. `restaurants.is_demo` — un établissement fictif sert à démontrer le
--      produit à un prospect. Il vit dans la même table que les vrais (même
--      code, même parcours, aucune branche « mode démo » dans l'app), mais il
--      est EXCLU des surfaces publiques et des chiffres réseau. Tous les
--      établissements existants SAUF Belchicken Kraainem passent en démo.
--
--   2. `restaurants.activated_at` — la date de mise en ligne, distincte de
--      `created_at` (un resto démarché est créé le jour du rendez-vous et
--      activé plus tard). C'est la maille de « établissements activés par
--      mois » (/platform/stats) : sans elle, la courbe d'activation ment.
--
--   3. `platform_backlog` — le plan d'action partagé entre les associés de la
--      plateforme. Service-role only (RLS activée, AUCUNE policy) : c'est de
--      la donnée interne fondateurs, jamais lisible par la clé anon (m34).
--
-- Aucun impact membre : rien de tout ça n'est visible côté client (ADR 0007).
-- ============================================================


-- ============================================================
-- 1. restaurants.is_demo — établissement de démonstration
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurants.is_demo IS
  'Établissement fictif de démonstration (ADR 0033) : exclu des surfaces publiques (/, /secteurs, /join) et des chiffres réseau de /platform/stats. Jamais visible comme tel côté membre.';

-- Bascule demandée : à ce jour, seul Belchicken Kraainem est un vrai
-- établissement en exploitation. Tout le reste a été créé pour tester,
-- démarcher ou démontrer → démo.
--
-- Le bloc ne s'exécute qu'au PREMIER passage (aucun resto encore marqué
-- démo). Sans ce garde, rejouer la migration ré-écraserait en démo un
-- établissement repassé en « réel » depuis la console — le rejeu doit être
-- sûr, pas destructeur.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE is_demo) THEN
    UPDATE restaurants SET is_demo = true WHERE id <> 'kraainem';
  END IF;
END $$;

-- Filet : Kraainem est le référentiel réel, jamais démo.
UPDATE restaurants SET is_demo = false WHERE id = 'kraainem';

-- Les surfaces publiques filtrent systématiquement sur (status, is_demo).
CREATE INDEX IF NOT EXISTS idx_restaurants_live
  ON restaurants (status) WHERE is_demo = false;


-- ============================================================
-- 2. restaurants.activated_at — date de mise en ligne
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurants.activated_at IS
  'Date de passage en statut active (ADR 0033). Distincte de created_at : un établissement démarché est créé au rendez-vous et activé plus tard. Maille de la courbe « activations par mois ».';

-- Backfill : les établissements déjà actifs n'ont pas d'historique de
-- bascule — on prend created_at, la meilleure approximation disponible.
UPDATE restaurants
   SET activated_at = created_at
 WHERE status = 'active' AND activated_at IS NULL;


-- ============================================================
-- 3. platform_backlog — plan d'action des associés
-- ============================================================
--
-- Un seul objet, volontairement plat : un backlog qui demande à être
-- administré n'est plus tenu à jour. Pas de sprints, pas d'assignation par
-- compte (le champ `owner` est du texte libre — on est deux), pas de
-- commentaires (le champ `details` suffit à cette échelle).
--
-- La priorité n'est PAS une colonne saisie : elle se calcule (impact/effort,
-- lib/backlog.ts). Saisir un impact et un effort force une comparaison entre
-- items ; saisir « P1 » ne force rien et dérive en trois semaines.

CREATE TABLE IF NOT EXISTS platform_backlog (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT        NOT NULL,
  details       TEXT,

  -- Chantier concerné — sert au regroupement, pas au filtrage fin.
  area          TEXT        NOT NULL DEFAULT 'produit'
                  CHECK (area IN ('produit','tech','vente','marketing','ops','legal')),

  -- Cycle de vie. 'bloque' est distinct de 'a_faire' : un item bloqué attend
  -- quelqu'un d'autre, il ne doit pas polluer la file de travail.
  status        TEXT        NOT NULL DEFAULT 'idee'
                  CHECK (status IN ('idee','a_faire','en_cours','bloque','fait','abandonne')),

  -- Échelles 1–5, sciemment courtes : au-delà, on débat de la note au lieu
  -- de trancher l'action.
  impact        SMALLINT    NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  effort        SMALLINT    NOT NULL DEFAULT 3 CHECK (effort BETWEEN 1 AND 5),

  owner         TEXT,       -- prénom libre ("Mehdi", "associé") — pas un compte
  restaurant_id TEXT        REFERENCES restaurants(id) ON DELETE SET NULL,
  due_date      DATE,

  created_by    UUID        REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at       TIMESTAMPTZ -- posé/effacé par l'app à l'entrée/sortie de 'fait'
);

ALTER TABLE platform_backlog ENABLE ROW LEVEL SECURITY; -- service-role only

-- La vue par défaut est « ce qui reste à faire, du plus rentable au moins
-- rentable » : l'index sert cet ordre, pas l'historique.
CREATE INDEX IF NOT EXISTS idx_platform_backlog_open
  ON platform_backlog (status, created_at DESC)
  WHERE status NOT IN ('fait','abandonne');

CREATE INDEX IF NOT EXISTS idx_platform_backlog_restaurant
  ON platform_backlog (restaurant_id) WHERE restaurant_id IS NOT NULL;


-- ============================================================
-- 4. Amorce du backlog — OPTIONNEL, à décommenter si utile
-- ============================================================
-- Quelques chantiers déjà identifiés dans les ADR, pour ne pas ouvrir la page
-- sur une liste vide. À décommenter AVANT le premier passage ; les impacts et
-- efforts sont des propositions de départ, à retrancher à deux.
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM platform_backlog) THEN
--     INSERT INTO platform_backlog (title, details, area, status, impact, effort) VALUES
--       ('Trancher quels comptes démo repassent en réel',
--        'La requête de contrôle en fin de m56 liste les comptes marqués démo qui portent de vraies commandes validées.',
--        'ops', 'a_faire', 4, 1),
--       ('Brancher le checkout Stripe (ADR 0029 Phase 5)',
--        'Le flip de plan est manuel depuis /platform. Tant que Stripe n''est pas branché, aucun encaissement automatique.',
--        'produit', 'idee', 5, 5),
--       ('Décider quand réactiver /secteurs',
--        'Page désactivée en dur (SECTEURS_DISABLED) : le réseau réel est trop petit pour qu''elle serve de preuve sociale. Fixer le seuil de réactivation.',
--        'marketing', 'idee', 3, 1),
--       ('Fixer les prix des plans Croissance et Pro',
--        'ADR 0029 acte le modèle mais aucun montant n''existe — la landing ne peut donc rien afficher.',
--        'vente', 'a_faire', 5, 2);
--   END IF;
-- END $$;


-- ============================================================
-- 5. Vérification finale
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'restaurants' AND column_name = 'is_demo')       AS is_demo_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'restaurants' AND column_name = 'activated_at')  AS activated_at_ok,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'platform_backlog')                              AS backlog_ok,
  (SELECT COUNT(*) FROM restaurants WHERE is_demo)                      AS demo_count,
  (SELECT COUNT(*) FROM restaurants WHERE NOT is_demo)                  AS live_count;

-- À VÉRIFIER APRÈS COUP : un établissement marqué démo qui porte de vraies
-- commandes validées est probablement un vrai resto. Le repasser en réel se
-- fait d'un clic depuis /platform (bouton « Démo / Réel » sur sa ligne).
SELECT r.id, r.name, COUNT(o.id) AS commandes_validees
  FROM restaurants r
  JOIN orders o ON o.restaurant_id = r.id AND o.status = 'validated'
 WHERE r.is_demo
 GROUP BY r.id, r.name
 ORDER BY commandes_validees DESC;
