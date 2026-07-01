-- ============================================================
-- M22 : ADR 0013 — Catalogue menu & prix de revient
--
-- 1. menu_items : catalogue par établissement (nom, catégorie,
--    prix de vente, prix de revient). Source de vérité unique des
--    articles + coûts utilisés par les récompenses. Alimenté par
--    upload CSV depuis /admin/menu (le restaurateur saisit lui-même
--    le prix de revient — pas de décomposition ingrédient).
-- 2. reward_tiers : mapping palier → article du catalogue pour les
--    couches solo (seuil = montant de commande) et communautaire
--    (seuil = score équipe). Remplace les grilles codées en dur de
--    lib/rewards.ts. Vide au départ → l'app retombe sur la grille
--    héritée tant qu'aucun palier n'est configuré (non-breaking).
--
-- Données euros (prix de revient, prix de vente) : RLS activée SANS
-- policy → accès service role uniquement, jamais exposées au client
-- (ADR 0007).
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id   TEXT          NOT NULL,
  name            TEXT          NOT NULL,
  category        TEXT          NOT NULL,
  menu_price      NUMERIC(6,2)  NOT NULL,   -- prix de vente carte (valeur perçue)
  cost_price      NUMERIC(6,2)  NOT NULL,   -- prix de revient réel (coût matière)
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  reward_eligible BOOLEAN       NOT NULL DEFAULT true,  -- proposable en cadeau
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, name)
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant
  ON menu_items (restaurant_id) WHERE is_active;

-- Palier → article du catalogue (couches solo & communautaire, ADR 0006).
-- min_threshold = montant de commande (solo) ou score d'équipe (community).
CREATE TABLE IF NOT EXISTS reward_tiers (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT          NOT NULL,
  layer         TEXT          NOT NULL CHECK (layer IN ('solo', 'community')),
  min_threshold NUMERIC(12,2) NOT NULL,
  menu_item_id  UUID          REFERENCES menu_items(id) ON DELETE SET NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  UNIQUE (restaurant_id, layer, min_threshold)
);

ALTER TABLE reward_tiers ENABLE ROW LEVEL SECURITY;

-- updated_at auto sur menu_items (re-upload = UPDATE via upsert)
CREATE OR REPLACE FUNCTION touch_menu_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION touch_menu_items_updated_at();
