-- ============================================================
-- Réserver un prestataire — l'invitation et la lecture de son propre compte
-- (ADR 0084, PR D)
--
-- Le prestataire est créé SUR INVITATION de la plateforme : une ligne
-- `providers` (statut « invited ») et un lien personnel. Même mécanique que
-- les invitations restaurateur (owner_invites, m55, ADR 0032) : secret
-- URL-safe, durée de vie bornée, consommable une seule fois (compare-and-swap
-- à l'acceptation). Le lien est lié à UNE adresse e-mail : un prestataire voit
-- les brefs des restaurateurs et sera payé, le lien ne se transmet pas.
--
-- `provider_invites` : RLS activée SANS policy = service-role only.
-- `providers` : une policy de LECTURE de sa propre ligne (comme
-- restaurant_admins_own_read) — le middleware, qui n'a pas la clé
-- service-role, doit savoir si un compte connecté est un prestataire pour
-- l'envoyer à son espace. Aucune policy d'écriture.
--
-- Idempotente. Aucune donnée existante touchée. Sans la migration, le lien
-- « Prestataires » de la plateforme répond « pas encore disponible » et
-- l'espace /prestataire reste inaccessible (jamais un crash).
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  -- L'adresse à laquelle le lien est lié (copie de providers.email à la création).
  email       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul lien vivant par prestataire : le dernier envoyé remplace les autres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_invites_active
  ON provider_invites (provider_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE provider_invites ENABLE ROW LEVEL SECURITY; -- service-role only

-- Un prestataire lit SA ligne (et seulement la sienne).
DROP POLICY IF EXISTS providers_own_read ON providers;
CREATE POLICY providers_own_read ON providers
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));
