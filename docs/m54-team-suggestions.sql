-- ============================================================
-- M54 : communautés déclarées par l'établissement (ADR 0031)
--
-- Le restaurateur déclare à l'onboarding les écoles / entreprises / quartiers
-- d'où viennent réellement ses clients. Ce sont des SUGGESTIONS, PAS des
-- équipes : rien n'est publié, rien n'apparaît au classement, aucun nom de
-- tiers n'est exposé tant qu'aucun membre ne s'y reconnaît.
--
-- L'équipe est matérialisée au premier « oui » (team_id renseigné) et ce
-- premier membre en devient le capitaine (teams.created_by) — c'est ce qui
-- préserve la viralité de l'ADR 0014 (§ Alternatives rejetées : « équipes
-- créées par l'admin »).
-- ============================================================

CREATE TABLE IF NOT EXISTS team_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'autre'
                CHECK (type IN ('ecole','entreprise','rue_quartier','taxis','autre')),
  zone          TEXT,
  -- NULL = pas encore matérialisée (aucun membre ne s'y est reconnu).
  -- Renseignée = l'équipe existe, la suggestion devient un raccourci d'adhésion.
  team_id       UUID REFERENCES teams(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un même nom ne peut être déclaré deux fois par établissement (insensible à
-- la casse) — évite « EPHEC » et « Ephec » en double dans le questionnaire.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_suggestions_unique
  ON team_suggestions (restaurant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_team_suggestions_resto
  ON team_suggestions (restaurant_id) WHERE is_active;

ALTER TABLE team_suggestions ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux membres connectés : tant qu'une suggestion n'est pas
-- matérialisée, elle relève de la connaissance client du restaurateur, pas
-- d'une donnée publique. Écritures via service role uniquement (même
-- convention que teams — cf. lib/teams.ts).
DROP POLICY IF EXISTS "team_suggestions_read" ON team_suggestions;
CREATE POLICY "team_suggestions_read" ON team_suggestions
  FOR SELECT TO authenticated USING (is_active);

-- Cadence de la question « te reconnais-tu ? », scopée par établissement
-- (comme le cooldown de changement d'équipe, ADR 0015 §5).
--   team_prompt_next_at  : NULL = à poser dès que possible ; sinon date de relance
--   team_prompt_declined : suggestions déjà refusées → on en propose d'autres
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS team_prompt_next_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS team_prompt_declined UUID[] NOT NULL DEFAULT '{}';
