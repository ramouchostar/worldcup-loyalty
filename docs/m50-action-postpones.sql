-- m50 — Report serveur d'une mission de la Carte Actions ("Je le ferai plus
-- tard") + rappel à 7 jours si toujours pas validée.
--
-- Le réaffichage à 24h reste géré côté client (localStorage,
-- components/member/ActionCardsSection.tsx) — cette table sert uniquement
-- à déclencher le rappel proactif (ADR 0024) après une semaine de silence.

CREATE TABLE IF NOT EXISTS micro_reward_postpones (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id     TEXT NOT NULL,
  reward_type       TEXT NOT NULL
    CHECK (reward_type IN ('google_review', 'instagram_follow', 'tiktok_follow', 'facebook_follow')),
  postponed_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, restaurant_id, reward_type)
);

ALTER TABLE micro_reward_postpones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "postpones_own_read"   ON micro_reward_postpones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "postpones_own_insert" ON micro_reward_postpones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "postpones_own_update" ON micro_reward_postpones FOR UPDATE USING (auth.uid() = user_id);

-- Nouveau déclencheur de notification (ADR 0024) — même enveloppe anti-spam
-- que tier_nudge/birthday/winback (ADR 0009).
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN (
    'tier_upgrade',
    'member_inactive',
    'tier_approaching',
    'advancement',
    'admin_broadcast',
    'tier_nudge',
    'birthday',
    'winback',
    'action_postpone_reminder'
  ));
