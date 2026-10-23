-- ============================================================
-- Pub : ce qu'il faut pour créer et lancer une campagne depuis Boosteats
-- (ADR 0086 §2, §4, §6 — suite de 20261017-1951-pub-tables.sql)
--
--   restaurant_ad_identities  la page Facebook et le compte Instagram qui SIGNENT la pub d'un
--                             établissement (choisis sur /platform/pub parmi ceux que le System
--                             User peut utiliser) ; sans eux, aucune campagne ne se prépare
--   ad_requests.ad_text       le texte de la publicité, écrit par le restaurateur
--   ad_campaigns.*_external_id l'ensemble, la création et la publicité créés chez Meta (pour
--                             lancer, mettre en pause, relever le plafond) + l'avis de Meta
--   ad_alerts                 une alerte envoyée (clé, jour) : jamais deux fois le même jour
--   bucket ad-creatives       les photos et vidéos envoyées depuis la console (privé, 100 Mo)
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans elle : la page Pub dit
-- « pas encore disponible », la lecture quotidienne continue (tables de 20261017-1951).
-- Aucun impact membre (ADR 0007).
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_ad_identities (
  restaurant_id     TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  meta_page_id      TEXT NOT NULL CHECK (meta_page_id ~ '^[0-9]{5,25}$'),
  meta_page_name    TEXT,
  instagram_user_id TEXT CHECK (instagram_user_id IS NULL OR instagram_user_id ~ '^[0-9]{5,25}$'),
  instagram_username TEXT,
  updated_by        UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS ad_text TEXT CHECK (ad_text IS NULL OR char_length(ad_text) <= 500);

ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS adset_external_id    TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS creative_external_id TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS ad_external_id       TEXT;
-- effective_status de la publicité chez Meta (PENDING_REVIEW, DISAPPROVED, ACTIVE…) et motif d'un refus.
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS ad_status            TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS ad_review_feedback   JSONB;

CREATE TABLE IF NOT EXISTS ad_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,
  -- Ce dont parle l'alerte : une demande, une campagne, un paiement, ou 'account'.
  ref        TEXT NOT NULL,
  day        DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Europe/Brussels')::date,
  sent_to    TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, ref, day, sent_to)
);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ad-creatives', 'ad-creatives', false, 104857600)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 104857600;

ALTER TABLE restaurant_ad_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_alerts                ENABLE ROW LEVEL SECURITY;

-- Contrôle : SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_campaigns' AND column_name LIKE '%external_id';
