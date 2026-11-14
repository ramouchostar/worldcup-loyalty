-- ADR 0103 — CA total lu dans Belpeople, en lecture seule (pilote Kraainem).
--
-- Quoi :
--   pos_connections : on autorise provider = 'belpeople' (jusqu'ici 'hubrise'
--     seul). Une connexion Belpeople range l'e-mail + le mot de passe du compte
--     dans Supabase Vault (JSON, via pos_store_token), location_id = store_id
--     Belpeople (« 223 » pour Kraainem). Jamais d'identifiant en clair.
--   pos_daily_sales : une ligne par jour de vente lue chez un fournisseur
--     (Belpeople donne le CA TOTAL, tous canaux). SANS donnée client.
--
-- Pourquoi : mesurer le CA total à côté de la saisie (ADR 0103 §4), sans rien
-- écrire dans daily_revenue_entries tant que l'écart n'est pas vérifié.
--
-- RLS : pos_daily_sales en RLS sans policy = service-role seulement.
-- Idempotente.

-- 1) Autoriser le fournisseur 'belpeople' sur pos_connections.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'pos_connections'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%provider%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE pos_connections DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE pos_connections
  ADD CONSTRAINT pos_connections_provider_check CHECK (provider IN ('hubrise', 'belpeople'));

-- 2) Les ventes par jour lues chez un fournisseur (agrégat, pas de commande).
CREATE TABLE IF NOT EXISTS pos_daily_sales (
  provider        TEXT NOT NULL,
  restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  store_ref       TEXT NOT NULL,
  sales_day       DATE NOT NULL,
  gross_inc_vat   NUMERIC(12,2),
  gross_exc_vat   NUMERIC(12,2),
  orders_count    INTEGER,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, restaurant_id, sales_day)
);
CREATE INDEX IF NOT EXISTS pos_daily_sales_restaurant_day ON pos_daily_sales (restaurant_id, sales_day);
ALTER TABLE pos_daily_sales ENABLE ROW LEVEL SECURITY;
