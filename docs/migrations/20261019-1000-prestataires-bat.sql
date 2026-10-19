-- ============================================================
-- Réserver un prestataire — le bon à tirer de l'imprimeur (ADR 0084 §2 et §5 bis, PR P)
--
-- L'imprimeur envoie une ÉPREUVE (liens https) ; le restaurateur la vérifie point par point et la SIGNE, ou demande des
-- corrections (deux tours, chacun en un seul envoi). Une fois signée, c'est exactement ce qui sera imprimé : plus d'annulation,
-- plus de correction, et le solde est dû. Trois épreuves au plus (l'originale + deux corrections).
--
--   mission_proofs   une ligne par épreuve. `status` : 'proposed' (attend le restaurateur), 'corrections' (il a demandé des
--                    corrections, `corrections` les garde), 'signed' (`signed_name` et `signed_at` sont la signature).
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la migration : « Envoyer l'épreuve » répond « pas encore
-- disponible » et le reste du module ne change pas.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_proofs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  round       SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 3),
  status      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'corrections', 'signed')),
  -- Les liens https de l'épreuve (le PDF à vérifier) et un mot de l'imprimeur.
  links       JSONB NOT NULL CHECK (jsonb_typeof(links) = 'array' AND jsonb_array_length(links) BETWEEN 1 AND 10),
  message     TEXT CHECK (message IS NULL OR char_length(message) <= 1000),
  -- [{ category, text }] : les corrections demandées, d'un seul envoi.
  corrections JSONB CHECK (corrections IS NULL OR (jsonb_typeof(corrections) = 'array' AND jsonb_array_length(corrections) BETWEEN 1 AND 20)),
  -- La signature : le nom écrit par le restaurateur, et ce qu'il a coché (la preuve de ce qu'il a vérifié).
  signed_name TEXT CHECK (signed_name IS NULL OR char_length(signed_name) BETWEEN 3 AND 80),
  signed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checks      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at  TIMESTAMPTZ,
  signed_at   TIMESTAMPTZ,
  UNIQUE (mission_id, round),
  CONSTRAINT mission_proofs_corrections_have_notes CHECK (status <> 'corrections' OR corrections IS NOT NULL),
  CONSTRAINT mission_proofs_signed_complete CHECK (status <> 'signed' OR (signed_name IS NOT NULL AND signed_at IS NOT NULL AND checks IS NOT NULL))
);

ALTER TABLE mission_proofs ENABLE ROW LEVEL SECURITY; -- service-role only

-- Une seule épreuve SIGNÉE par mission, même si deux clics arrivent ensemble.
CREATE UNIQUE INDEX IF NOT EXISTS mission_proofs_one_signed ON mission_proofs (mission_id) WHERE status = 'signed';
-- Une seule épreuve EN ATTENTE par mission.
CREATE UNIQUE INDEX IF NOT EXISTS mission_proofs_one_pending ON mission_proofs (mission_id) WHERE status = 'proposed';

-- Une impression est un OBJET : « livré au restaurant le 3 », « prêt au retrait ». Sa livraison peut n'avoir aucun lien à
-- télécharger (un mot suffit) ; une livraison de fichiers, elle, en a toujours au moins un (vérifié par l'application).
DO $$
BEGIN
  IF to_regclass('mission_deliveries') IS NOT NULL THEN
    ALTER TABLE mission_deliveries DROP CONSTRAINT IF EXISTS mission_deliveries_links_check;
    ALTER TABLE mission_deliveries ADD CONSTRAINT mission_deliveries_links_check CHECK (cardinality(links) BETWEEN 0 AND 10);
  END IF;
END $$;
