-- ============================================================
-- M10 — Notifications proactives (Bloc 5 / ADR 0009)
-- Idempotente : sûre à relancer si certaines parties existent déjà
-- Exécuter dans Supabase : SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. push_subscriptions (endpoints navigateur pour Web Push VAPID)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id TEXT        NOT NULL,
  endpoint      TEXT        NOT NULL,
  p256dh        TEXT        NOT NULL,
  auth          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "push_own" ON push_subscriptions
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id, restaurant_id);


-- ============================================================
-- 2. profiles.last_notified_at (anti-spam 48h)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;


-- ============================================================
-- 3. teams.round_advanced_at (déclencheur notification avancement)
-- ============================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS round_advanced_at TIMESTAMPTZ;

-- Trigger : met à jour round_advanced_at automatiquement quand round_reached change
CREATE OR REPLACE FUNCTION handle_round_advancement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.round_reached IS DISTINCT FROM OLD.round_reached THEN
    IF NEW.round_reached != 'group_stage' THEN
      NEW.round_advanced_at := NOW();
    ELSE
      NEW.round_advanced_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_round_advancement ON teams;
CREATE TRIGGER on_round_advancement
  BEFORE UPDATE OF round_reached ON teams
  FOR EACH ROW EXECUTE FUNCTION handle_round_advancement();


-- ============================================================
-- 4. notification_log (audit + analytics des envois)
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id           TEXT        NOT NULL,
  trigger_type            TEXT        NOT NULL
    CHECK (trigger_type IN ('tier_upgrade', 'member_inactive', 'tier_approaching', 'advancement')),
  channel                 TEXT        NOT NULL
    CHECK (channel IN ('whatsapp', 'push', 'in_app')),
  community_score_at_send NUMERIC(14,2),
  message_body            TEXT        NOT NULL,
  sent_at                 TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notification_log_own_read" ON notification_log
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent
  ON notification_log (user_id, sent_at DESC);


-- ============================================================
-- 5. Vérification finale
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'push_subscriptions')    AS push_subscriptions_ok,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'notification_log')       AS notification_log_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_notified_at') AS last_notified_at_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'round_advanced_at')   AS round_advanced_at_ok;
