-- ============================================================
-- La description d'un plat (ADR 0100 §7)
--
-- Une description par article du catalogue, écrite d'après le NOM du plat (jamais une viande, un ingrédient, une origine
-- ou un label que le restaurateur n'a pas écrit) ou par le restaurateur lui-même. `description_source` dit d'où elle
-- vient : « generated » (composée par nous, d'après le nom), « restaurateur » (écrite ou retouchée par lui), « pdf »
-- (reprise de son PDF, PR suivante). NULL = pas de description.
--
-- Pourquoi ici et pas dans les tables d'options : une description décrit le PLAT, elle sera lue par le site de commande
-- et par le site vitrine (Brigade 15) comme le nom et le prix. Un re-téléversement du catalogue (CSV, upsert sur le nom)
-- n'écrit que ses propres colonnes : une description survit à un ré-import.
--
-- Aussi : quatre compteurs sur la table de trace `menu_option_setups` (migration 20261112-0417) pour mesurer la part des
-- descriptions que les restaurateurs gardent telles quelles (si plus d'un tiers est réécrit, la règle est à revoir).
--
-- Idempotente, non cassante (colonnes nullables ou avec défaut). Si elle n'est pas appliquée, l'écran enregistre quand
-- même les options et dit que les descriptions ne l'ont pas été (lib/menu-options/save.ts). À appliquer à la main dans
-- l'éditeur SQL de Supabase dès la fusion (docs/migrations/README.md).
-- ============================================================

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_description_length') THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_description_length
      CHECK (description IS NULL OR char_length(description) <= 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_description_source_known') THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_description_source_known
      CHECK (description_source IS NULL OR description_source IN ('generated', 'restaurateur', 'pdf'));
  END IF;
END $$;

COMMENT ON COLUMN menu_items.description IS
  'Description du plat (300 lettres au plus). Écrite d''après le nom seulement, ou par le restaurateur. Jamais un ingrédient, une viande ou un label absent du nom.';
COMMENT ON COLUMN menu_items.description_source IS
  'D''où vient la description : generated (d''après le nom), restaurateur (écrite ou retouchée par lui), pdf (reprise de son PDF).';

-- Les compteurs de description de la trace (ADR 0065)
ALTER TABLE menu_option_setups ADD COLUMN IF NOT EXISTS descriptions_generated INTEGER NOT NULL DEFAULT 0 CHECK (descriptions_generated >= 0);
ALTER TABLE menu_option_setups ADD COLUMN IF NOT EXISTS descriptions_kept      INTEGER NOT NULL DEFAULT 0 CHECK (descriptions_kept >= 0);
ALTER TABLE menu_option_setups ADD COLUMN IF NOT EXISTS descriptions_edited    INTEGER NOT NULL DEFAULT 0 CHECK (descriptions_edited >= 0);
ALTER TABLE menu_option_setups ADD COLUMN IF NOT EXISTS descriptions_cleared   INTEGER NOT NULL DEFAULT 0 CHECK (descriptions_cleared >= 0);
