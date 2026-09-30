-- ============================================================
-- 2026-09-30 10:00 — Raison de la suppression de compte + comptes fantômes
-- (ADR 0025 — droit à l'effacement)
--
-- 1. data_requests.reason / detail / failed_steps
--    Pourquoi : on comptait les suppressions sans jamais savoir pourquoi. La
--    raison est FACULTATIVE (elle ne conditionne jamais la suppression).
--    `failed_steps` : les étapes de l'effacement en échec (avant, avalées en
--    silence). Sans ces colonnes, /api/me/delete insère la demande sans elles.
--
-- 2. Comptes fantômes « Compte supprimé » encore membres d'un établissement.
--    Constat console Kraainem 2026-09-30 : un « Compte supprimé » listé dans
--    « Mes clients », avec l'app installée. Deux cas, distingués par la date :
--    a) adhésion POSTÉRIEURE à l'anonymisation = la personne est revenue
--       (même compte de connexion) → on réactive le profil (e-mail repris du
--       compte de connexion, prénom vidé, redemandé dans /compte) ;
--    b) adhésion ANTÉRIEURE = l'effacement a échoué en partie → on termine
--       l'effacement (adhésion supprimée), la personne voulait partir.
--
-- RLS : inchangée (data_requests lecture propriétaire, écritures service role).
-- Idempotente.
-- ============================================================

-- 1. Raison et résultat de la suppression
ALTER TABLE data_requests
  ADD COLUMN IF NOT EXISTS reason       TEXT,
  ADD COLUMN IF NOT EXISTS detail       TEXT,
  ADD COLUMN IF NOT EXISTS failed_steps TEXT[];

DO $$ BEGIN
  ALTER TABLE data_requests ADD CONSTRAINT data_requests_reason_check CHECK (
    reason IS NULL OR reason IN (
      'trop_de_messages', 'ne_viens_plus', 'pas_compris', 'cadeaux', 'donnees', 'autre'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE data_requests ADD CONSTRAINT data_requests_detail_len CHECK (
    detail IS NULL OR char_length(detail) <= 300);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2a. Revenus après suppression → réactivés
UPDATE profiles p
SET anonymized_at = NULL,
    display_name  = NULL,
    email         = u.email
FROM auth.users u
WHERE u.id = p.id
  AND p.anonymized_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = p.id AND m.joined_at > p.anonymized_at
  );

-- 2b. Effacement inachevé → adhésions supprimées
DELETE FROM memberships m
USING profiles p
WHERE p.id = m.user_id
  AND p.anonymized_at IS NOT NULL
  AND m.joined_at <= p.anonymized_at;
