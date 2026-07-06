-- ============================================================
-- M31 : ADR 0020 — lignes d'articles extraites du ticket (OCR)
-- 1. order_items : articles lus sur le ticket du membre, best
--    effort — jamais bloquant pour la validation de la commande.
--    menu_item_id rapproché du catalogue par nom normalisé,
--    NULL si aucun article ne correspond.
-- 2. orders.order_time (m13) existe déjà — aucune modification,
--    la route de soumission commence simplement à le remplir.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_index    SMALLINT      NOT NULL DEFAULT 0,   -- ordre d'apparition sur le ticket
  raw_name      TEXT          NOT NULL,             -- libellé brut lu par l'OCR
  quantity      NUMERIC(5,2)  NOT NULL DEFAULT 1,
  unit_price    NUMERIC(6,2),                       -- NULL si illisible
  menu_item_id  UUID          REFERENCES menu_items(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, line_index)                     -- idempotence à la ré-insertion
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Le membre lit les lignes de SES tickets : ce sont ses données
-- personnelles (comme "Mes stats"), les euros y sont autorisés
-- (ADR 0007). Écritures : service role uniquement (aucune policy
-- INSERT/UPDATE/DELETE).
CREATE POLICY "order_items_own_read" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item
  ON order_items (menu_item_id) WHERE menu_item_id IS NOT NULL;
