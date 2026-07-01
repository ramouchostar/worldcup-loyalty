-- ============================================================
-- M25 : ADR 0014 — Broadcasts admin ciblés
--
-- Ajoute 'admin_broadcast' aux valeurs autorisées de
-- notification_log.trigger_type (ADR 0009). Les broadcasts composés par le
-- restaurateur (ciblés par équipe ou par type) sont journalisés avec ce
-- trigger et disposent d'une enveloppe anti-spam dédiée (2/semaine/membre),
-- séparée du quota des notifications automatiques. Idempotente.
-- ============================================================

ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;

ALTER TABLE notification_log ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN (
    'tier_upgrade',
    'member_inactive',
    'tier_approaching',
    'advancement',
    'admin_broadcast'
  ));
