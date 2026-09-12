-- ============================================================
-- 2026-09-12 11:20 — Images produits sur le catalogue menu (ADR 0013)
--
-- Pourquoi : les établissements veulent illustrer leurs articles (cadeaux,
-- aperçu de commande, catalogue admin). Les photos existent déjà côté
-- restaurateur (ce sont celles de ses plateformes de livraison) — il en est
-- propriétaire et nous les fournit.
--
-- Deux colonnes sur menu_items :
--   image_path   → chemin DANS le bucket public `menu-images` (jamais une URL
--                  externe : on re-héberge systématiquement, sinon l'image
--                  meurt le jour où la plateforme source change de CDN, et on
--                  ferait un hotlink chez un tiers). NULL = pas d'image.
--   image_source → provenance, pour la traçabilité des droits ('upload',
--                  'ubereats', 'deliveroo', 'takeaway'…). Purement indicatif.
--
-- Aucune donnée euro ajoutée : menu_items reste service-role only (RLS sans
-- policy, posée par m22) — seuls le nom et l'image sortent côté membre, comme
-- pour le cadeau jetons (ADR 0017).
-- Idempotente.
-- ============================================================

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_path   TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_source TEXT;

COMMENT ON COLUMN menu_items.image_path IS
  'Chemin dans le bucket public menu-images (restaurant_id/slug.ext). Jamais une URL externe.';
COMMENT ON COLUMN menu_items.image_source IS
  'Provenance de la photo pour traçabilité des droits : upload | ubereats | deliveroo | takeaway.';

-- Bucket public `menu-images` — même modèle que `restaurant-logos` (m37/m48) :
-- lecture publique (les images s'affichent côté membre), écriture service-role.
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'menu_images_public_read'
  ) THEN
    CREATE POLICY menu_images_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'menu-images');
  END IF;
END $$;
