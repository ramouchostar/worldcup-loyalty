-- ============================================================
-- Demandes de services marketing depuis la console (ADR 0081 §6)
--
-- Les missions de l'étape 1 du jeu de la croissance proposent déjà une pub
-- dans la zone et des vidéos, avant que la pub et la vidéo ne soient
-- intégrées à l'app (ADR à venir). Le restaurateur clique « Je veux une pub »
-- ou « Je veux des vidéos » : la demande est enregistrée ici, l'équipe la voit
-- sur /platform et rappelle. Une demande en attente par établissement et par
-- service (index unique partiel) : un double clic n'en crée pas deux.
--
-- RLS activée SANS policy = service-role only (comme plan_requests, m51).
-- Idempotent. Aucune donnée existante touchée. Sans la migration, le bouton
-- de la mission répond « demande impossible pour le moment » (jamais un faux
-- « c'est noté ») et /platform n'affiche pas la section.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_requests (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service       TEXT        NOT NULL CHECK (service IN ('pub', 'video')),
  -- Surface du clic (« accueil_etape1 »…) : pour mesurer d'où viennent les demandes.
  source        TEXT,
  requested_by  UUID,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'handled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_one_pending
  ON service_requests (restaurant_id, service)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS service_requests_status_idx
  ON service_requests (status, created_at);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
