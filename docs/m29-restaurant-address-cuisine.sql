-- ============================================================
-- M29 : onboarding self-service — adresse + types de cuisine
--
-- cuisine_types en texte libre (pas une liste fermée) : le restaurateur
-- décrit lui-même sa cuisine, l'app l'incite à être précis (ex. "Pizza
-- napolitaine" plutôt que juste "Italien") pour la visibilité client.
-- Max 5 types — validé côté application (app/become-a-partner/actions.ts).
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS cuisine_types TEXT[] NOT NULL DEFAULT '{}';
