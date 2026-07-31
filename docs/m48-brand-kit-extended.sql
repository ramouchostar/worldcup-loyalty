-- ============================================================
-- M48 : Charte graphique v2 — site web, police, image hero
--
-- Étend le kit de marque par établissement (m37 : logo + 3 couleurs) avec :
--   website_url     → lien du site du resto, saisi dans "Infos & liens"
--                      (SettingsForm.tsx). Sert de source à la détection de
--                      design (lib/design-detect.ts) — jamais affiché aux
--                      membres autrement qu'un lien.
--   brand_font      → police choisie parmi une liste fermée (évite d'injecter
--                      une police/domaine arbitraire). NULL = pile système
--                      par défaut Boosteats. Voir lib/branding.ts FONT_OPTIONS.
--   hero_image_url  → chemin dans le bucket restaurant-logos (même bucket que
--                      le logo), utilisé en fond de la carte hero du
--                      dashboard membre (ADR 0010 §Section 1). NULL = fond
--                      brand-dark actuel inchangé.
--
-- Idempotente.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS website_url    TEXT,
  ADD COLUMN IF NOT EXISTS brand_font     TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_brand_font_chk') THEN
    ALTER TABLE restaurants ADD CONSTRAINT restaurants_brand_font_chk CHECK (
      brand_font IS NULL OR brand_font IN ('inter', 'poppins', 'playfair', 'dm_sans', 'bebas_neue')
    );
  END IF;
END $$;
