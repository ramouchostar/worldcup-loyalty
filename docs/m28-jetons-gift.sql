-- ============================================================
-- M28 : ADR 0017 — Cadeau des 4 jetons choisi dans le catalogue
-- Idempotente : sûre à relancer
--
-- L'article remis pour 4 jetons (actions sociales / parrainages)
-- vient du catalogue de l'établissement au lieu d'être codé en dur
-- (« Churros 12 pcs »). Tant que la colonne est NULL, l'app retombe
-- sur le cadeau hérité (non-breaking).
-- Plafond enforcé côté API : cost_price ≤ panier moyen × REWARD_BUDGET_PCT.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS jetons_gift_menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL;

-- Vérification
SELECT COUNT(*) AS jetons_gift_column
FROM information_schema.columns
WHERE table_name = 'restaurants' AND column_name = 'jetons_gift_menu_item_id';
