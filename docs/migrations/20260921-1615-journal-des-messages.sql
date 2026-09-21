-- ============================================================
-- 2026-09-21 16:15 — Journal des messages et interrupteurs de séquences
-- (ADR 0063 §2 et §6, PR 2/5)
--
-- Constat : `email_log` n'a jamais reçu une ligne. Un envoi raté (clé Resend
-- absente, domaine refusé) ne laissait AUCUNE trace — ni le succès, ni
-- l'échec. Et rien ne disait si un message avait été délivré ou ouvert.
--
-- Quoi :
--   1. `message_sends` — une ligne par tentative d'envoi, réussie ou non :
--      message (séquence ou transactionnel), canal, destinataire, statut,
--      erreur, identifiant chez le fournisseur ; puis ce qui arrive ensuite
--      (délivré, rebond, plainte — webhook Resend) et le premier clic
--      (redirection /c/[id]). Statut `holdout` : membre du groupe témoin,
--      éligible mais volontairement non contacté (ADR 0063 §6).
--   2. `message_settings` — l'interrupteur séquence × établissement.
--      Aucune ligne = éteint (ADR 0063 §2 : éteint par défaut).
--
-- Données personnelles : `user_id` (le destinataire). Pas d'adresse e-mail
-- stockée (minimisation, ADR 0025 §7) ; la ligne part avec le compte
-- (ON DELETE CASCADE) et figure dans l'export (lib/gdpr.ts).
--
-- Les deux tables : RLS activée SANS policy = service role uniquement.
--
-- Sans cette migration : les envois partent comme avant, sans journal ; la
-- page /platform/messages l'indique et toutes les séquences restent
-- éteintes. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS message_sends (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restaurant_id  TEXT REFERENCES restaurants(id) ON DELETE SET NULL,
  audience       TEXT NOT NULL CHECK (audience IN ('member', 'restaurant')),
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message_key    TEXT NOT NULL,
  step           SMALLINT,
  campaign_id    UUID,
  channel        TEXT NOT NULL CHECK (channel IN ('email', 'push', 'whatsapp', 'in_app', 'none')),
  status         TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'holdout', 'delivered', 'bounced', 'complained')),
  provider_id    TEXT,
  error          TEXT,
  subject        TEXT,
  delivered_at   TIMESTAMPTZ,
  bounced_at     TIMESTAMPTZ,
  complained_at  TIMESTAMPTZ,
  clicked_at     TIMESTAMPTZ,
  click_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_message_sends_created ON message_sends (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_sends_key ON message_sends (message_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_sends_restaurant ON message_sends (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_sends_user_key ON message_sends (user_id, message_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_sends_provider ON message_sends (provider_id) WHERE provider_id IS NOT NULL;

ALTER TABLE message_sends ENABLE ROW LEVEL SECURITY; -- service-role only

CREATE TABLE IF NOT EXISTS message_settings (
  message_key    TEXT NOT NULL,
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_key, restaurant_id)
);

ALTER TABLE message_settings ENABLE ROW LEVEL SECURITY; -- service-role only

-- Premier clic et compteur en une écriture atomique (la redirection /c/[id]
-- ne doit jamais attendre deux allers-retours).
CREATE OR REPLACE FUNCTION record_message_click(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE message_sends
     SET click_count = click_count + 1,
         clicked_at  = COALESCE(clicked_at, NOW())
   WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION record_message_click(UUID) FROM PUBLIC, anon, authenticated;
