-- ============================================================
-- Réserver un prestataire — les rappels de tournage (ADR 0084 §5, PR F)
--
-- Un tournage se rappelle trois fois : J-7 (le restaurateur prévient son
-- équipe), J-2 (les deux confirment leur présence), la veille (récap). Le cron
-- quotidien envoie ce qui est dû ; cette table garantit qu'un rappel ne part
-- JAMAIS deux fois, même si deux passages du cron se chevauchent : le cron
-- RÉSERVE la ligne (clé primaire) AVANT d'envoyer, et la libère si l'envoi
-- échoue — le passage suivant réessaie, tant que la fenêtre du rappel est ouverte.
--
-- `key` : 'j7' | 'j2' | 'veille' | 'alerte' ; `audience` : 'restaurant' |
-- 'provider' | 'platform' (l'alerte « présence non confirmée » vers la plateforme).
--
-- RLS activée SANS policy = service-role only. Idempotente. Aucune donnée
-- existante touchée. Sans la migration, le cron répond « indisponible » et
-- n'envoie RIEN (jamais un rappel sans garde-fou de doublon).
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_reminders (
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  key        TEXT NOT NULL CHECK (key IN ('j7', 'j2', 'veille', 'alerte')),
  audience   TEXT NOT NULL CHECK (audience IN ('restaurant', 'provider', 'platform')),
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_id, key, audience)
);

CREATE INDEX IF NOT EXISTS mission_reminders_sent_idx ON mission_reminders (sent_at);
ALTER TABLE mission_reminders ENABLE ROW LEVEL SECURITY; -- service-role only
