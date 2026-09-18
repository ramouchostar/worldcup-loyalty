-- ============================================================
-- 2026-09-18 03:30 — Prix de revient à la pièce (tenders, hot wings) et
-- paliers de cadeaux ramenés sous les 8 %
--
-- Quoi :
--   1. Prix de revient recalculés à partir de LA PIÈCE (choix du porteur,
--      2026-09-18), dans les trois établissements Belchicken réels (carte
--      identique) :
--        - Tenders : 1 pièce = 0,55 € → (4) 2,20 · (8) 4,40 · (16) 8,80
--          (les packs étaient à 0,275 €/pièce : faux de moitié) ;
--        - Hot wings : 1 pièce = 0,37 € → (4) 1,48 · (8) 2,96 · (16) 5,92
--          (packs à 0,296 €/pièce) ;
--        - menus = pièces + 0,83 € d'accompagnements (constaté sur tous les
--          menus de la carte) : 4 Tenders Menu 3,03 · 8 Hot Wings Menu 3,79 ·
--          12 Hot Wings Menu 5,27. Le 6 Tenders Menu (4,13) était déjà juste.
--      Wings (0,27), nuggets (0,13) et hot stripes (0,15) étaient cohérents.
--      Les buckets (composition inconnue) ne sont pas touchés.
--   2. Les paliers dont le cadeau dépasse désormais le plafond de l'ADR 0017
--      sont remplacés PROVISOIREMENT (en attendant le catalogue au choix du
--      client, audit « Ma réserve ») par l'article de plus forte valeur carte
--      sous le plafond :
--        - houba, de-bue : solo 55 € — Tenders (16) 8,80 € > 4,40 € → Wings (16) 4,33 € ;
--        - kraainem : solo 40 € — Tenders (8) 4,40 € > 3,20 € → Hot stripes (16) 2,39 € ;
--        - kraainem : réserve 170 points — Tenders (16) 8,80 € > 5,83 € → Wings (16) 4,33 €.
--
-- Pourquoi : terrain Houba du 2026-09-17 — « 16 tenders pour un ticket de
-- 55 € » semblait trop généreux au gérant. Il avait raison : le prix de
-- revient saisi (4,40 €) était la moitié du vrai (8,80 €), et la règle des 8 %
-- laissait passer un cadeau à 16 %.
--
-- ADR 0013 (catalogue et coûts), ADR 0017 (plafond des cadeaux).
-- Sans cette migration : les cadeaux restent au-delà des 8 %. Idempotente :
-- les prix sont posés (pas incrémentés), les paliers ne changent que s'ils
-- portent encore l'ancien article. Les cadeaux déjà attribués sont honorés.
-- ============================================================

UPDATE menu_items
SET cost_price = CASE name
      WHEN 'Tenders (4)'       THEN 2.20
      WHEN 'Tenders (8)'       THEN 4.40
      WHEN 'Tenders (16)'      THEN 8.80
      WHEN 'Hot wings (4)'     THEN 1.48
      WHEN 'Hot wings (8)'     THEN 2.96
      WHEN 'Hot wings (16)'    THEN 5.92
      WHEN '4 Tenders Menu'    THEN 3.03
      WHEN '8 Hot Wings Menu'  THEN 3.79
      WHEN '12 Hot Wings Menu' THEN 5.27
    END,
    updated_at = NOW()
WHERE restaurant_id IN ('kraainem', 'houba', 'de-bue')
  AND name IN ('Tenders (4)', 'Tenders (8)', 'Tenders (16)',
               'Hot wings (4)', 'Hot wings (8)', 'Hot wings (16)',
               '4 Tenders Menu', '8 Hot Wings Menu', '12 Hot Wings Menu');

-- Paliers hors plafond → article sous le plafond (provisoire, voir en-tête).
UPDATE reward_tiers rt
SET menu_item_id = (SELECT id FROM menu_items WHERE restaurant_id = rt.restaurant_id AND name = 'Wings (16)' LIMIT 1)
WHERE rt.restaurant_id IN ('houba', 'de-bue')
  AND rt.layer = 'solo' AND rt.min_threshold = 55
  AND rt.menu_item_id = (SELECT id FROM menu_items WHERE restaurant_id = rt.restaurant_id AND name = 'Tenders (16)' LIMIT 1);

UPDATE reward_tiers rt
SET menu_item_id = (SELECT id FROM menu_items WHERE restaurant_id = rt.restaurant_id AND name = 'Hot stripes (16)' LIMIT 1)
WHERE rt.restaurant_id = 'kraainem'
  AND rt.layer = 'solo' AND rt.min_threshold = 40
  AND rt.menu_item_id = (SELECT id FROM menu_items WHERE restaurant_id = rt.restaurant_id AND name = 'Tenders (8)' LIMIT 1);

UPDATE reward_tiers rt
SET menu_item_id = (SELECT id FROM menu_items WHERE restaurant_id = rt.restaurant_id AND name = 'Wings (16)' LIMIT 1)
WHERE rt.restaurant_id = 'kraainem'
  AND rt.layer = 'saver' AND rt.min_threshold = 170
  AND rt.menu_item_id = (SELECT id FROM menu_items WHERE restaurant_id = rt.restaurant_id AND name = 'Tenders (16)' LIMIT 1);

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT restaurant_id, name, cost_price FROM menu_items
--    WHERE restaurant_id IN ('kraainem','houba','de-bue')
--      AND (name LIKE 'Tenders%' OR name LIKE 'Hot wings%' OR name LIKE '%Tenders Menu' OR name LIKE '%Hot Wings Menu')
--    ORDER BY restaurant_id, name;
--   SELECT rt.restaurant_id, rt.layer, rt.min_threshold, mi.name, mi.cost_price
--     FROM reward_tiers rt JOIN menu_items mi ON mi.id = rt.menu_item_id
--    WHERE rt.is_active AND rt.restaurant_id IN ('kraainem','houba','de-bue')
--    ORDER BY 1, 2, 3;
