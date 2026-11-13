-- ADR 0102 — CA lu par HubRise, en lecture seule (pilote Kraainem).
--
-- Quoi :
--   pos_connections   une connexion HubRise = un point de vente lu pour un établissement ;
--                     le jeton d'accès vit dans Supabase Vault, la table n'en garde que l'id.
--   pos_orders        une ligne par commande HubRise, SANS donnée client (ADR 0025) ;
--                     jour de vente calculé côté serveur (bascule à 5 h, Bruxelles).
--   pos_reference_days le chiffre de référence d'un canal pour un jour (relevé Uber Eats
--                     Manager…), noté par un super-admin pour mesurer l'écart (ADR 0102 §4).
--   pos_journal       la trace : rappels refusés, relectures de nuit, jeton refusé (401).
--   pos_store_token / pos_read_token / pos_forget_token : accès au coffre Vault,
--                     réservés au service.
--
-- Pourquoi : mesurer d'abord, à côté de la saisie ; rien n'est écrit dans
-- daily_revenue_entries ni restaurant_sales (ADR 0102 §4, phase 1).
--
-- RLS : activée sans policy sur les quatre tables = service-role seulement.
-- Idempotente.

CREATE TABLE IF NOT EXISTS pos_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'hubrise' CHECK (provider IN ('hubrise')),
  account_id          TEXT,
  account_name        TEXT,
  location_id         TEXT NOT NULL,
  location_name       TEXT,
  token_secret_id     UUID,
  callback_url        TEXT,
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by        UUID,
  disconnected_at     TIMESTAMPTZ,
  last_ok_at          TIMESTAMPTZ,
  last_failed_at      TIMESTAMPTZ,
  last_failed_reason  TEXT
);
-- Une seule connexion active par établissement et par point de vente HubRise.
CREATE UNIQUE INDEX IF NOT EXISTS pos_connections_active_restaurant
  ON pos_connections (restaurant_id, provider) WHERE disconnected_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pos_connections_active_location
  ON pos_connections (provider, location_id) WHERE disconnected_at IS NULL;
ALTER TABLE pos_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pos_orders (
  provider            TEXT NOT NULL DEFAULT 'hubrise',
  external_id         TEXT NOT NULL,
  restaurant_id       TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id         TEXT NOT NULL,
  placed_at           TIMESTAMPTZ NOT NULL,
  sales_day           DATE NOT NULL,
  channel             TEXT,
  service_type        TEXT,
  status              TEXT NOT NULL,
  total               NUMERIC(10,2),
  currency            TEXT,
  discounts           NUMERIC(10,2),
  charges             NUMERIC(10,2),
  items               JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_received_via  TEXT NOT NULL CHECK (first_received_via IN ('callback', 'sync')),
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_id)
);
CREATE INDEX IF NOT EXISTS pos_orders_restaurant_day ON pos_orders (restaurant_id, sales_day);
ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pos_reference_days (
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sales_day      DATE NOT NULL,
  channel        TEXT NOT NULL,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  source         TEXT,
  noted_by       UUID,
  noted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, sales_day, channel)
);
ALTER TABLE pos_reference_days ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pos_journal (
  id             BIGSERIAL PRIMARY KEY,
  at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  connection_id  UUID REFERENCES pos_connections(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,
  detail         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS pos_journal_at ON pos_journal (at DESC);
ALTER TABLE pos_journal ENABLE ROW LEVEL SECURITY;

-- ── Coffre (Supabase Vault) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pos_store_token(p_connection_id UUID, p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE
  v_old UUID;
  v_new UUID;
BEGIN
  SELECT token_secret_id INTO v_old FROM pos_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'connexion inconnue'; END IF;
  v_new := vault.create_secret(p_token, 'pos_token_' || p_connection_id::text || '_' || extract(epoch FROM now())::bigint, 'Jeton HubRise (ADR 0102)');
  UPDATE pos_connections SET token_secret_id = v_new WHERE id = p_connection_id;
  IF v_old IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_old; END IF;
END $$;

CREATE OR REPLACE FUNCTION pos_read_token(p_connection_id UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, vault AS $$
  SELECT s.decrypted_secret
  FROM pos_connections c JOIN vault.decrypted_secrets s ON s.id = c.token_secret_id
  WHERE c.id = p_connection_id;
$$;

CREATE OR REPLACE FUNCTION pos_forget_token(p_connection_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_old UUID;
BEGIN
  SELECT token_secret_id INTO v_old FROM pos_connections WHERE id = p_connection_id;
  UPDATE pos_connections SET token_secret_id = NULL WHERE id = p_connection_id;
  IF v_old IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_old; END IF;
END $$;

REVOKE ALL     ON FUNCTION pos_store_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION pos_store_token(UUID, TEXT) TO service_role;
REVOKE ALL     ON FUNCTION pos_read_token(UUID)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION pos_read_token(UUID)        TO service_role;
REVOKE ALL     ON FUNCTION pos_forget_token(UUID)      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION pos_forget_token(UUID)      TO service_role;
