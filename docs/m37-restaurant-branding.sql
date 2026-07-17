-- ============================================================
-- M37 : Charte graphique par établissement (logo + couleurs)
--
-- Chaque restaurant peut soumettre son logo et jusqu'à 3 couleurs. L'app
-- s'adapte : ces valeurs surchargent les variables CSS de marque (--brand-red
-- / --brand-dark / --brand-gold) sur ses surfaces membre (/r/[id]) et admin
-- (/admin/[id]). Colonnes nullables → un resto sans charte garde l'identité
-- Boosteats par défaut. Voir lib/branding.ts.
--
--   brand_primary → accent principal (boutons, liens)   [défaut #C8102E]
--   brand_dark    → en-têtes / fonds sombres             [défaut #1A1A2E]
--   brand_accent  → mises en avant / badges              [défaut #F5A623]
--   logo_url      → chemin dans le bucket public restaurant-logos
--
-- Idempotente.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS logo_url      TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary TEXT,
  ADD COLUMN IF NOT EXISTS brand_dark    TEXT,
  ADD COLUMN IF NOT EXISTS brand_accent  TEXT;

-- Contrôle de format : hex #RRGGBB ou NULL (défense en profondeur — l'API
-- valide déjà, mais empêche toute écriture directe d'une valeur non-couleur
-- qui casserait le rendu CSS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_brand_hex_chk') THEN
    ALTER TABLE restaurants ADD CONSTRAINT restaurants_brand_hex_chk CHECK (
      (brand_primary IS NULL OR brand_primary ~ '^#[0-9A-Fa-f]{6}$') AND
      (brand_dark    IS NULL OR brand_dark    ~ '^#[0-9A-Fa-f]{6}$') AND
      (brand_accent  IS NULL OR brand_accent  ~ '^#[0-9A-Fa-f]{6}$')
    );
  END IF;
END $$;
