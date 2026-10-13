-- ============================================================
-- Réserver un prestataire — les propositions créatives (ADR 0084 §5, PR K)
--
-- Une fois la date bloquée, le prestataire propose 2 ou 3 idées de tournage (la 1re est celle qu'il
-- recommande) ; le restaurateur en choisit une. Silence du restaurateur : la 1re est retenue d'office.
-- Aucune ne plaît : UNE seule nouvelle série, avec une raison par proposition refusée.
--
--   mission_proposals   une ligne par proposition (série 1 ou 2, rang 1 à 3).
--   missions            proposals_round (0 à 2 séries déposées), proposals_rejected_at (nouvelle série
--                       demandée), proposal_chosen_id / _at / _by (choisie par le restaurateur, retenue
--                       d'office, ou repli sur la 1re série faute de seconde).
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la migration, le code répond
-- « pas encore disponible » et rien n'est écrit à moitié ; les rappels du cron restent inchangés.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id       UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  round            SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 2),
  rank             SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  idea             TEXT NOT NULL CHECK (char_length(idea) BETWEEN 30 AND 800),
  onsite           TEXT NOT NULL CHECK (char_length(onsite) BETWEEN 5 AND 500),
  example_link     TEXT NOT NULL CHECK (char_length(example_link) <= 500 AND example_link LIKE 'https://%'),
  -- La raison donnée par le restaurateur quand la série est refusée (une par proposition).
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 12 AND 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, round, rank)
);

ALTER TABLE mission_proposals ENABLE ROW LEVEL SECURITY; -- service-role only

ALTER TABLE missions ADD COLUMN IF NOT EXISTS proposals_round SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS proposals_rejected_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS proposal_chosen_id UUID REFERENCES mission_proposals(id);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS proposal_chosen_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS proposal_chosen_by TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'missions_proposals_round_range') THEN
    ALTER TABLE missions ADD CONSTRAINT missions_proposals_round_range CHECK (proposals_round BETWEEN 0 AND 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'missions_proposal_chosen_by_kind') THEN
    ALTER TABLE missions ADD CONSTRAINT missions_proposal_chosen_by_kind CHECK (proposal_chosen_by IS NULL OR proposal_chosen_by IN ('restaurant', 'auto', 'fallback'));
  END IF;
  -- Le choix et sa date vont ensemble ; une nouvelle série ne se demande qu'après la première.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'missions_proposal_choice_complete') THEN
    ALTER TABLE missions ADD CONSTRAINT missions_proposal_choice_complete CHECK ((proposal_chosen_id IS NULL) = (proposal_chosen_at IS NULL) AND (proposal_chosen_id IS NULL) = (proposal_chosen_by IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'missions_proposals_rejected_after_first') THEN
    ALTER TABLE missions ADD CONSTRAINT missions_proposals_rejected_after_first CHECK (proposals_rejected_at IS NULL OR proposals_round >= 1);
  END IF;
END $$;

-- Les rappels de la page : le prestataire à J-4, le restaurateur qui n'a pas choisi, la plateforme sans proposition.
-- Le CHECK de la PR rappels (clés j7, j2, veille, alerte) est étendu ; le nom automatique d'une contrainte inline
-- est `<table>_<colonne>_check`.
ALTER TABLE mission_reminders DROP CONSTRAINT IF EXISTS mission_reminders_key_check;
ALTER TABLE mission_reminders ADD CONSTRAINT mission_reminders_key_check CHECK (key IN ('j7', 'j2', 'veille', 'alerte', 'propose', 'choisir', 'sans_proposition'));
