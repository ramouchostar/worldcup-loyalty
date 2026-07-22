-- m37 — Stratégies membres : nudge de palier, cadeau d'anniversaire,
-- réactivation (ADR 0024)

-- 1. Trois nouveaux déclencheurs dans le journal de notifications :
--    tier_nudge (bord de palier solo), birthday (anniversaire),
--    winback (membre qui décroche). Même enveloppe anti-spam que les
--    triggers automatiques ADR 0009.
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
    'winback'
  ));

-- 2. Le cadeau d'anniversaire est une pending_reward sans commande
--    (order_id NULL, comme les cadeaux 'saver' de m33). Non bankable par
--    construction : le RPC bank_reward exige order_id IS NOT NULL.
ALTER TABLE pending_rewards DROP CONSTRAINT IF EXISTS pending_rewards_source_check;
ALTER TABLE pending_rewards ADD CONSTRAINT pending_rewards_source_check
  CHECK (source IN ('order', 'saver', 'birthday'));
