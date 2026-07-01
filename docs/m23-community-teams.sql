-- ============================================================
-- M23 : ADR 0014 — Pivot équipes communautaires (partie ADDITIVE)
--
-- NB : dans le modèle Coupe du Monde, `teams` est GLOBALE (équipes
-- nationales partagées entre déploiements, SANS restaurant_id ; le
-- par-resto vit dans community_scores). Le pivot rend les équipes
-- communautaires PROPRES à un établissement → on ajoute teams.restaurant_id
-- (NULL pour les anciennes équipes nationales, retirées en T9).
--
-- Migration non-cassante : on AJOUTE seulement (colonnes WC conservées).
-- Idempotente (IF NOT EXISTS) → ré-exécutable sans risque.
-- ============================================================

-- 1. teams : champs communautaires
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT,  -- NULL = ancienne équipe nationale globale
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'autre'
    CHECK (type IN ('ecole', 'entreprise', 'rue_quartier', 'taxis', 'autre')),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS join_code TEXT;

-- Code d'adhésion globalement unique → résout le lien /join-team?code= sans ambiguïté
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_join_code
  ON teams (join_code) WHERE join_code IS NOT NULL;

-- Équipes d'un établissement
CREATE INDEX IF NOT EXISTS idx_teams_restaurant
  ON teams (restaurant_id) WHERE restaurant_id IS NOT NULL;

-- 2. team_tiers : couche 3 — paliers de dépense cumulée d'équipe (ADR 0014).
--    Quand la dépense cumulée de l'équipe (community_scores.total_spent)
--    franchit threshold_spent, tous ses membres débloquent la récompense :
--    un pourcentage borné OU un article gratuit du catalogue (ADR 0013).
--    Données euros (seuil) : RLS service role uniquement (ADR 0007).
CREATE TABLE IF NOT EXISTS team_tiers (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id   TEXT          NOT NULL,
  threshold_spent NUMERIC(12,2) NOT NULL,        -- dépense cumulée d'équipe (€)
  reward_kind     TEXT          NOT NULL CHECK (reward_kind IN ('percent', 'free_item')),
  percent_value   NUMERIC(4,1),                  -- si percent (ex. 10.0)
  menu_item_id    UUID          REFERENCES menu_items(id) ON DELETE SET NULL, -- si free_item
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, threshold_spent),
  -- cohérence : percent → percent_value requis ; free_item → menu_item_id requis
  CHECK (
    (reward_kind = 'percent'   AND percent_value IS NOT NULL) OR
    (reward_kind = 'free_item' AND menu_item_id  IS NOT NULL)
  )
);

ALTER TABLE team_tiers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_team_tiers_restaurant
  ON team_tiers (restaurant_id) WHERE is_active;
