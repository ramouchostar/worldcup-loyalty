-- ADR 0103 §6 — « Ventes par plat » sur toute la caisse (pilote Kraainem).
--
-- Quoi : pos_product_sales, une ligne par jour, par canal et par produit lue
--   chez Belpeople (v_agg_products_sold_daily), pour le seul magasin autorisé.
--   Des QUANTITÉS seulement (Belpeople ne donne pas le CA par plat) ; le CA et
--   la marge sont estimés à l'affichage avec les prix et coûts de la carte.
--   SANS donnée client.
--
-- Pourquoi : la page console « Ventes par plat » montrait seulement les tickets
--   des membres ; Mehdi veut le total de la caisse (2026-11-14).
--
-- Sans cette migration : la lecture de nuit le dit dans son journal (le CA du
--   jour et les heures sont enregistrés quand même) et la page garde la vue
--   « Clients du programme » seule.
--
-- RLS : activée sans policy = service-role seulement. Idempotente.

CREATE TABLE IF NOT EXISTS pos_product_sales (
  provider       TEXT NOT NULL,
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  store_ref      TEXT NOT NULL,
  sales_day      DATE NOT NULL,
  channel_id     INTEGER NOT NULL DEFAULT 0,
  channel_name   TEXT,
  product_id     INTEGER NOT NULL,
  product_name   TEXT NOT NULL,
  items_sold     INTEGER NOT NULL DEFAULT 0 CHECK (items_sold >= 0),
  read_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, restaurant_id, sales_day, channel_id, product_id)
);
CREATE INDEX IF NOT EXISTS pos_product_sales_restaurant_day ON pos_product_sales (restaurant_id, sales_day);
ALTER TABLE pos_product_sales ENABLE ROW LEVEL SECURITY;
