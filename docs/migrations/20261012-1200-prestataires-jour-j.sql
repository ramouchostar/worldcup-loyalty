-- ============================================================
-- Réserver un prestataire — le jour J : tournage, compte-rendu, livraison
-- (ADR 0084 §5, PR G)
--
-- Le jour du tournage, le prestataire démarre (« je suis arrivé »), remplit un
-- COMPTE-RENDU court (arrivée réelle, fin, ce qui a manqué) que le restaurateur
-- confirme ou conteste : c'est la pièce de référence d'un litige. Puis il livre
-- (liens de téléchargement) ; le restaurateur valide.
--
-- Colonnes ajoutées à `missions` (toutes nullables : aucune ligne existante
-- ne change) et table `mission_deliveries` (une ligne par livraison : la 1re,
-- puis une par tour de retouches dans une PR suivante). RLS activée SANS
-- policy = service-role only.
--
-- Idempotente. Sans la migration, les boutons du jour J répondent « pas encore
-- disponible » et rien n'est écrit à moitié.
-- ============================================================

ALTER TABLE missions ADD COLUMN IF NOT EXISTS started_at          TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS report              JSONB;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS report_submitted_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS report_confirmed_at TIMESTAMPTZ;
-- Le restaurateur conteste le compte-rendu : sa version, lue par la plateforme.
ALTER TABLE missions ADD COLUMN IF NOT EXISTS report_contested_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS report_contest_note TEXT;

CREATE TABLE IF NOT EXISTS mission_deliveries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  -- 1 = livraison initiale ; 2 et 3 = après chaque tour de retouches.
  round      SMALLINT NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 3),
  -- Liens de téléchargement (https seulement : vérifié par l'application, jamais un script).
  links      TEXT[] NOT NULL CHECK (cardinality(links) BETWEEN 1 AND 10),
  message    TEXT CHECK (message IS NULL OR char_length(message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, round)
);

ALTER TABLE mission_deliveries ENABLE ROW LEVEL SECURITY; -- service-role only
