-- ============================================================
-- Réserver un prestataire — les pièces jointes (ADR 0084 §3 règle 7, PR L)
--
-- Logo, photos de plats, charte, exemples : joints au brief (restaurateur), aux idées de tournage
-- (prestataire) et aux retouches (restaurateur). Les fichiers vivent dans un bucket PRIVÉ `mission-files`
-- (jamais public : pas de lien devinable) ; la base garde une ligne par fichier. Le téléchargement passe par
-- une route qui vérifie l'accès, puis un lien signé de 60 secondes.
--
--   mission_attachments  une ligne par fichier. `confirmed_at` est posé après vérification du CONTENU réel
--                        (premiers octets) ; une ligne non confirmée est supprimée par le cron au bout d'un jour.
--                        `ref` rattache le fichier à son objet : id d'une idée (scope 'proposal'),
--                        « round-1 » / « round-2 » (scope 'retouch') ; NULL pour le brief ou tant qu'il n'est
--                        pas rattaché.
--
-- RLS activée SANS policy = service-role only ; aucune policy sur storage.objects : le bucket n'est lisible
-- que par le serveur. Idempotente. Sans la migration, « Joindre un fichier » répond « pas encore disponible »
-- et rien d'autre ne change.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mission-files', 'mission-files', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

CREATE TABLE IF NOT EXISTS mission_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL CHECK (scope IN ('brief', 'proposal', 'retouch')),
  ref            TEXT CHECK (ref IS NULL OR char_length(ref) <= 64),
  uploaded_by    TEXT NOT NULL CHECK (uploaded_by IN ('restaurant', 'provider')),
  uploader_id    UUID,
  name           TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  storage_path   TEXT NOT NULL UNIQUE CHECK (char_length(storage_path) <= 200),
  mime           TEXT CHECK (mime IS NULL OR char_length(mime) <= 100),
  size_bytes     BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mission_attachments ENABLE ROW LEVEL SECURITY; -- service-role only

CREATE INDEX IF NOT EXISTS mission_attachments_mission_idx ON mission_attachments (mission_id, scope, ref);
-- Le nettoyage du cron : fichiers jamais confirmés.
CREATE INDEX IF NOT EXISTS mission_attachments_unconfirmed_idx ON mission_attachments (created_at) WHERE confirmed_at IS NULL;
