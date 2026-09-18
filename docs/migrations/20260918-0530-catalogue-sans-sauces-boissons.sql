-- ============================================================
-- 2026-09-18 05:30 — Catalogue « Mes points » : on offre ce qui fait envie
-- (ADR 0061, choix du porteur)
--
-- Quoi : retire du catalogue (reward_eligible = false), dans les trois
-- établissements Belchicken réels :
--   - toutes les SAUCES (catégorie « Sauces ») ;
--   - toutes les BOISSONS (catégorie « Boissons », milkshakes compris) ;
--   - les PIÈCES À L'UNITÉ (« Tenders (1) », « Wings (1) », « Hot wings (1) »,
--     « Nugget (1) », « Hot stripes (1) »).
-- 102 articles sur 353 ; aucun palier actif ni cadeau des jetons ne pointe
-- vers eux (vérifié le 2026-09-18).
--
-- Pourquoi : consigne d'Omar du 2026-09-18 — « on offre des cadeaux dont les
-- gens ont envie ». Une sauce à 30 points ou un nugget à 20 points noient les
-- vrais cadeaux dans une liste de ~117 articles.
--
-- Réversible article par article dans l'écran Menu (bouton « au catalogue »).
-- Idempotente.
-- ============================================================

UPDATE menu_items
SET reward_eligible = false
WHERE restaurant_id IN ('kraainem', 'houba', 'de-bue')
  AND reward_eligible
  AND (category IN ('Sauces', 'Boissons') OR name ~ '\(1\)\s*$');

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT restaurant_id, COUNT(*) FILTER (WHERE reward_eligible) AS au_catalogue, COUNT(*)
--     FROM menu_items WHERE restaurant_id IN ('kraainem','houba','de-bue') GROUP BY 1;
--   → environ 83 au catalogue par établissement.
