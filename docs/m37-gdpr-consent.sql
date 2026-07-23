-- ============================================================
-- M37 : ADR 0022 — Conformite RGPD : consentements & demandes de droits
--
-- 1. consents : journal APPEND-ONLY des consentements (preuve, art. 7 RGPD).
--    Le consentement courant pour (user, purpose) = la ligne la plus recente.
--    On n'ecrase jamais : chaque changement ajoute une ligne.
-- 2. data_requests : tracabilite des demandes d'export / de suppression.
-- 3. profiles : date de naissance + statut mineur / consentement parental
--    (age du consentement numerique = 13 ans en Belgique) + horodatage
--    d'anonymisation.
--
-- Donnees personnelles : RLS activee, lecture limitee au proprietaire ;
-- ecritures via service role (integrite de la preuve). Idempotente.
-- ============================================================

-- 1. Consentements (append-only)
CREATE TABLE IF NOT EXISTS consents (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  purpose        TEXT        NOT NULL CHECK (purpose IN (
                   'programme', 'marketing_push', 'marketing_whatsapp',
                   'insights_commerciaux', 'zones')),
  granted        BOOLEAN     NOT NULL,
  policy_version TEXT        NOT NULL,
  source         TEXT,                         -- 'signup' | 'settings' | ...
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "consents_own_read" ON consents
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_consents_user_purpose
  ON consents (user_id, purpose, created_at DESC);

-- 2. Demandes d'exercice de droits (accès / effacement)
CREATE TABLE IF NOT EXISTS data_requests (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  type         TEXT        NOT NULL CHECK (type IN ('export', 'deletion')),
  status       TEXT        NOT NULL DEFAULT 'completed'
                 CHECK (status IN ('pending', 'completed', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "data_requests_own_read" ON data_requests
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. profiles : contrôle d'âge / mineurs + anonymisation
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS is_minor BOOLEAN,
  ADD COLUMN IF NOT EXISTS parental_consent_status TEXT NOT NULL DEFAULT 'none'
    CHECK (parental_consent_status IN ('none', 'pending', 'granted')),
  ADD COLUMN IF NOT EXISTS parental_email TEXT,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
