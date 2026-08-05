-- ============================================================
-- M50 — Email log (logique emailing, growth chantier)
-- Idempotente : sûre à relancer si certaines parties existent déjà
-- Exécuter dans Supabase : SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. email_log (audit + anti-spam pour lib/email.ts)
-- ============================================================
-- Table dédiée plutôt qu'extension de notification_log (m10) :
-- domaine différent (email transactionnel restaurateur + client,
-- pas seulement les triggers communautaires push/WhatsApp).

CREATE TABLE IF NOT EXISTS email_log (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_type TEXT        NOT NULL
    CHECK (recipient_type IN ('member', 'restaurant')),
  recipient_id   TEXT        NOT NULL,
  email_type     TEXT        NOT NULL
    CHECK (email_type IN (
      'welcome',
      'partner_application_received',
      'restaurant_activated',
      'onboarding_reminder',
      'pending_requests_reminder',
      'reward_ready',
      'tier_unlocked',
      'referral_success'
    )),
  restaurant_id  TEXT,
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);

-- RLS activée, aucune policy publique : ce log n'est lu/écrit que
-- par le service role (cron + server actions), jamais côté client.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_log_recipient_type_sent
  ON email_log (recipient_type, recipient_id, email_type, sent_at DESC);


-- ============================================================
-- 2. Vérification finale
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'email_log') AS email_log_ok;
