-- ============================================================
-- Créneau d'envoi des messages au restaurateur (ADR 0077 §4, PR A)
--
-- Quoi :
--   message_sends.send_slot   créneau PRÉVU de l'envoi, heure de Bruxelles au format
--                             « HHMM » entier (900, 1100, 1500, 1730). NULL pour tous
--                             les messages existants (membres, transactionnels) : seules
--                             les séquences restaurateur tournent entre des créneaux.
--                             L'heure réelle reste created_at.
--
-- Pourquoi : apprendre à quelle heure un restaurateur clique exige de savoir quelle
-- heure on a essayée. Le moteur des séquences restaurateur NE PART PAS tant que la
-- colonne manque (sans journal fiable, il renverrait la même étape à chaque passage).
--
-- Sécurité : message_sends est déjà en RLS sans policy (service-role, migration
-- 20260921-1615). Aucun nouveau droit.
--
-- Idempotent.
-- ============================================================

ALTER TABLE message_sends ADD COLUMN IF NOT EXISTS send_slot smallint;

CREATE INDEX IF NOT EXISTS idx_message_sends_restaurant_slot
  ON message_sends (audience, message_key, created_at)
  WHERE send_slot IS NOT NULL;
