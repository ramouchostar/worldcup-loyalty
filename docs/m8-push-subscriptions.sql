-- ============================================================
-- Migration M8 : Abonnements push (Web Push VAPID)
-- Table push_subscriptions — stockage des endpoints navigateur
-- RLS : chaque membre gère ses propres abonnements
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

CREATE POLICY "push_own" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id, restaurant_id);
