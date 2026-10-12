-- ============================================================
-- Réserver un prestataire — les retouches (ADR 0084 §3 règle 8, PR H)
--
-- Deux tours de retours inclus, chacun en UN SEUL envoi (toutes les remarques
-- d'un coup : on ne joue pas au ping-pong). Une ligne par tour : les remarques
-- du restaurateur, classées et motivées, que le prestataire lit avant de
-- livrer la version suivante (mission_deliveries.round = 2 puis 3).
--
-- `missions.retouch_rounds_used` (PR B) compte les tours ; la base garantit
-- qu'il n'y en a jamais plus de 2 : le CHECK ci-dessous et l'unicité
-- (mission_id, round) tiennent même si deux requêtes arrivent ensemble.
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la
-- migration, « Demander une retouche » répond « pas encore disponible » et
-- rien n'est écrit à moitié.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_retouches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  round      SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 2),
  -- [{ category, text, at? }] : au moins une remarque, vingt au plus (vérifié par l'application).
  notes      JSONB NOT NULL CHECK (jsonb_typeof(notes) = 'array' AND jsonb_array_length(notes) BETWEEN 1 AND 20),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, round)
);

ALTER TABLE mission_retouches ENABLE ROW LEVEL SECURITY; -- service-role only

-- Jamais plus de deux tours, même par une écriture directe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'missions_retouch_rounds_max_two') THEN
    ALTER TABLE missions ADD CONSTRAINT missions_retouch_rounds_max_two CHECK (retouch_rounds_used <= 2);
  END IF;
END $$;
