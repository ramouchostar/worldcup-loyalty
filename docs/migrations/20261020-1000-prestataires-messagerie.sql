-- ============================================================
-- Réserver un prestataire — la messagerie d'une mission (ADR 0084, PR Q)
--
-- Restaurateur et prestataire s'écrivent dans la mission. Tout est gardé (pièce d'un litige). Tant que le travail n'a pas
-- commencé, les numéros, e-mails et liens de messagerie sont MASQUÉS à l'enregistrement : `body` est ce que les parties lisent,
-- `body_original` garde le texte tel qu'écrit, lu par la plateforme seule.
--
--   mission_messages        une ligne par message.
--   mission_message_reads   où en est la lecture de chacun (non lus) et quand on l'a prévenu par e-mail pour la dernière
--                           fois (un e-mail au plus toutes les 30 minutes, seulement si rien n'est lu).
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la migration : la messagerie n'affiche rien et « Envoyer »
-- répond « pas encore disponible » ; le reste du module ne change pas.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  sender        TEXT NOT NULL CHECK (sender IN ('restaurant', 'provider', 'platform')),
  sender_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  -- Le texte tel qu'écrit, SEULEMENT quand un contact a été masqué (sinon NULL) : lu par la plateforme.
  body_original TEXT CHECK (body_original IS NULL OR char_length(body_original) BETWEEN 1 AND 1500),
  masked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mission_messages_original_iff_masked CHECK ((body_original IS NOT NULL) = masked)
);

ALTER TABLE mission_messages ENABLE ROW LEVEL SECURITY; -- service-role only

CREATE INDEX IF NOT EXISTS mission_messages_thread_idx ON mission_messages (mission_id, created_at);
-- La limite d'envoi par heure et par expéditeur.
CREATE INDEX IF NOT EXISTS mission_messages_rate_idx ON mission_messages (mission_id, sender, created_at DESC);

CREATE TABLE IF NOT EXISTS mission_message_reads (
  mission_id       UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  reader           TEXT NOT NULL CHECK (reader IN ('restaurant', 'provider')),
  last_read_at     TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ,
  PRIMARY KEY (mission_id, reader)
);

ALTER TABLE mission_message_reads ENABLE ROW LEVEL SECURITY; -- service-role only
