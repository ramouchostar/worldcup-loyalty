-- ============================================================
-- M55 : Lien d'invitation restaurateur (ADR 0032 — rattachement d'un restaurateur
-- à son établissement par lien, sans qu'il ait à créer son compte AVANT)
--
-- Problème résolu : `assignOwner` (/platform) exige que le restaurateur ait
-- DÉJÀ un compte membre avec le bon email — sinon « Aucun compte membre avec
-- l'email … ». Sur le terrain, l'ordre naturel est inverse : on rencontre le
-- restaurateur, on lui envoie un lien, il s'inscrit et devient l'admin de son établissement.
--
-- Le token joue le même rôle que `redemption_tokens` (ADR 0011) côté caisse :
-- un secret URL-safe, à durée de vie bornée, consommable UNE seule fois.
-- Service-role only (RLS activée, AUCUNE policy) : un lien d'invitation est
-- un privilège d'écriture sur `restaurants.owner_id`, jamais lisible par la
-- clé anon (cf. m34 — verrouillage des privilèges d'élévation).
--
-- Idempotent, sûr à rejouer.
-- ============================================================


-- ============================================================
-- 1. owner_invites
-- ============================================================

CREATE TABLE IF NOT EXISTS owner_invites (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token         TEXT        NOT NULL UNIQUE,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email         TEXT,       -- destinataire prévu (indicatif + envoi Resend) — jamais une contrainte d'acceptation
  created_by    UUID        REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  accepted_by   UUID        REFERENCES profiles(id),
  revoked_at    TIMESTAMPTZ
);

ALTER TABLE owner_invites ENABLE ROW LEVEL SECURITY; -- service-role only

-- Un seul lien ACTIF par établissement : régénérer révoque le précédent
-- (app/platform/actions.ts). Évite qu'un ancien lien oublié dans un WhatsApp
-- puisse encore réassigner le restaurateur des mois plus tard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_invites_active
  ON owner_invites (restaurant_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_invites_restaurant
  ON owner_invites (restaurant_id, created_at DESC);


-- ============================================================
-- 2. email_log : nouveau type d'email transactionnel restaurateur
-- ============================================================
-- lib/email.ts journalise chaque envoi ; la contrainte CHECK (m50) doit
-- connaître 'owner_invite' sinon l'insert échoue après un envoi réussi.

-- Le nom de la contrainte est celui généré par Postgres pour le CHECK inline
-- de m50 ; on la retrouve par son contenu plutôt que par son nom, pour ne pas
-- se retrouver avec DEUX contraintes concurrentes si elle a été renommée.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'email_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%email_type%'
  LOOP
    EXECUTE format('ALTER TABLE email_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE email_log ADD CONSTRAINT email_log_email_type_check
  CHECK (email_type IN (
    'welcome',
    'partner_application_received',
    'restaurant_activated',
    'onboarding_reminder',
    'pending_requests_reminder',
    'reward_ready',
    'tier_unlocked',
    'referral_success',
    'owner_invite'
  ));


-- ============================================================
-- 3. Vérification finale
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'owner_invites') AS owner_invites_ok,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE indexname = 'uq_owner_invites_active') AS unique_active_ok;
