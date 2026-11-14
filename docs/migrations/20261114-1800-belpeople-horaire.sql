-- ADR 0103 (suite) — ventes par heure lues dans Belpeople (agg_sales_hourly),
-- pour les heures pleines et creuses du personnel (console/plateforme).
--
-- Quoi : pos_hourly_sales, une ligne par heure lue chez un fournisseur, SANS
-- donnée client. Alimentée par le même cron que le CA par jour.
-- RLS : service-role seulement. Idempotente.

CREATE TABLE IF NOT EXISTS pos_hourly_sales (
  provider        TEXT NOT NULL,
  restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  store_ref       TEXT NOT NULL,
  hour_start      TIMESTAMPTZ NOT NULL,
  gross_inc_vat   NUMERIC(12,2),
  orders_count    INTEGER,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, restaurant_id, hour_start)
);
CREATE INDEX IF NOT EXISTS pos_hourly_sales_restaurant_hour ON pos_hourly_sales (restaurant_id, hour_start);
ALTER TABLE pos_hourly_sales ENABLE ROW LEVEL SECURITY;
