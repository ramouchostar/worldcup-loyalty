-- ============================================================
-- Réserver un prestataire — les demandes de modification (ADR 0084 §3 règle 9, PR M)
--
-- Le brief est verrouillé à l'envoi : tout changement ensuite est une DEMANDE DE MODIFICATION que le prestataire
-- chiffre (un supplément, éventuellement nul) ou refuse ; le restaurateur accepte ou non le supplément. Une seule
-- demande ouverte à la fois, deux au total (la limite se lit dans le code : les demandes refusées par le prestataire
-- ou restées sans réponse ne comptent pas).
--
--   mission_changes     une ligne par demande. À l'acceptation, le supplément est FIGÉ avec le plan et les
--                       conditions du moment (paid / provider / platform), comme un devis ; les totaux de la mission
--                       sont augmentés dans la même opération (compare-and-swap côté code).
--   mission_attachments sa contrainte de portée accepte aussi 'change' (captures, références jointes à la demande).
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la migration, « Demander une modification »
-- répond « pas encore disponible » et rien d'autre ne change.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_changes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id       UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  seq              SMALLINT NOT NULL CHECK (seq BETWEEN 1 AND 20),
  status           TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'quoted', 'accepted', 'declined_by_provider', 'declined_by_restaurant', 'withdrawn', 'expired')),
  categories       TEXT[] NOT NULL CHECK (cardinality(categories) BETWEEN 1 AND 6),
  description      TEXT NOT NULL CHECK (char_length(description) BETWEEN 30 AND 1000),
  requested_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Le supplément chiffré par le prestataire (prix du supplément, avant commission). 0 = « sans supplément ».
  supplement_cents INTEGER CHECK (supplement_cents IS NULL OR supplement_cents BETWEEN 0 AND 500000),
  delta_days       SMALLINT CHECK (delta_days IS NULL OR delta_days BETWEEN 0 AND 30),
  provider_note    TEXT CHECK (provider_note IS NULL OR char_length(provider_note) <= 500),
  decline_reason   TEXT CHECK (decline_reason IS NULL OR char_length(decline_reason) BETWEEN 12 AND 500),
  -- Figés à l'acceptation.
  plan_at_accept   TEXT,
  paid_cents       INTEGER CHECK (paid_cents IS NULL OR paid_cents >= 0),
  provider_cents   INTEGER CHECK (provider_cents IS NULL OR provider_cents >= 0),
  platform_cents   INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quoted_at        TIMESTAMPTZ,
  decided_at       TIMESTAMPTZ,
  UNIQUE (mission_id, seq),
  CONSTRAINT mission_changes_quoted_has_price CHECK (status NOT IN ('quoted', 'accepted', 'declined_by_restaurant') OR (supplement_cents IS NOT NULL AND delta_days IS NOT NULL)),
  CONSTRAINT mission_changes_accepted_frozen CHECK (status <> 'accepted' OR (paid_cents IS NOT NULL AND provider_cents IS NOT NULL AND platform_cents IS NOT NULL AND plan_at_accept IS NOT NULL)),
  CONSTRAINT mission_changes_declined_has_reason CHECK (status <> 'declined_by_provider' OR decline_reason IS NOT NULL)
);

ALTER TABLE mission_changes ENABLE ROW LEVEL SECURITY; -- service-role only

-- Une seule demande OUVERTE par mission, même si deux clics arrivent ensemble.
CREATE UNIQUE INDEX IF NOT EXISTS mission_changes_one_open ON mission_changes (mission_id) WHERE status IN ('proposed', 'quoted');
-- Le passage quotidien : les demandes ouvertes.
CREATE INDEX IF NOT EXISTS mission_changes_open_idx ON mission_changes (created_at) WHERE status IN ('proposed', 'quoted');

-- Les pièces jointes d'une demande de modification.
-- (Seulement si la migration des pièces jointes est passée : sinon on la rejoue après elle, cette migration est idempotente.)
DO $$
BEGIN
  IF to_regclass('mission_attachments') IS NOT NULL THEN
    ALTER TABLE mission_attachments DROP CONSTRAINT IF EXISTS mission_attachments_scope_check;
    ALTER TABLE mission_attachments ADD CONSTRAINT mission_attachments_scope_check CHECK (scope IN ('brief', 'proposal', 'retouch', 'change'));
  END IF;
END $$;
