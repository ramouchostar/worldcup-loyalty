-- ============================================================
-- 2026-08-31 23:35 — Rapprochement catalogue ↔ tickets (ADR 0046, lots 1-3)
--
-- Mesuré sur kraainem : 83 % des lignes de tickets non rattachées au
-- catalogue (suffixes de catégorie de la caisse, libellés EN, lignes
-- techniques de TVA, compositions « + »). Deux briques :
--   1. `menu_item_aliases` — alias de rapprochement PAR RESTO, posés par le
--      seed et par les rapprochements manuels (formulaire, lot 4).
--      `menu_item_id NULL` = « à ignorer » (ligne technique de caisse).
--   2. `order_items.is_ignored` — une ligne ignorée reste en base mais sort
--      des plats et du CA par plat.
-- Idempotente. Service-role only (comme le reste de la donnée euros).
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_item_aliases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- Libellé NORMALISÉ (lib/menu-match.ts normalizeItemName) — jamais le brut.
  alias         TEXT NOT NULL,
  -- NULL = ligne technique « à ignorer » ; sinon l'article du catalogue.
  menu_item_id  UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, alias)
);
ALTER TABLE menu_item_aliases ENABLE ROW LEVEL SECURITY; -- service-role only

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN NOT NULL DEFAULT false;
-- Le rétro-rattachement (lib/menu-rematch.ts) ne balaie que les lignes
-- jamais rattachées.
CREATE INDEX IF NOT EXISTS idx_order_items_unmatched
  ON order_items (order_id) WHERE menu_item_id IS NULL;

-- ── Seed kraainem — d'après les libellés réels non rattachés ──────────────
-- « Fries (Medium/Large) » (caisse EN) → Frites du catalogue FR.
INSERT INTO menu_item_aliases (restaurant_id, alias, menu_item_id)
SELECT 'kraainem', v.alias, mi.id
FROM (VALUES
  ('fries medium', 'Frites Medium'),
  ('fries large',  'Frites Large')
) AS v(alias, item)
JOIN menu_items mi ON mi.restaurant_id = 'kraainem' AND mi.name = v.item
ON CONFLICT (restaurant_id, alias) DO NOTHING;

-- Ajustement TVA boissons de la caisse — jamais un plat.
INSERT INTO menu_item_aliases (restaurant_id, alias, menu_item_id)
VALUES ('kraainem', 'drinkvatadjustment', NULL)
ON CONFLICT (restaurant_id, alias) DO NOTHING;
