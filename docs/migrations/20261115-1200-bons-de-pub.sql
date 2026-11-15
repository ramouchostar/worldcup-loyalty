-- ADR 0104 §2 — Une pub avec offre mène à un bon, scanné en caisse.
--
-- Quoi :
--   ad_vouchers       un bon obtenu sur la page /bon/<établissement>/<n° de demande> :
--                     code court (6 caractères, sans 0/O ni 1/I), jeton du QR de caisse,
--                     empreinte salée de l'IP (plafond 20 bons par heure, jamais l'IP en
--                     clair), date d'utilisation et qui l'a validé. AUCUNE donnée personnelle.
--   ad_voucher_views  une ligne par affichage de la page du bon (provenance : meta ou
--                     direct) : l'étage entre les clics de Meta et les bons obtenus.
--
-- Pourquoi : le mot clé dit au comptoir ne se comptait pas (pub Houba, novembre 2026).
--   Clics → vues → bons obtenus → bons utilisés : la pub se mesure jusqu'à la caisse.
--
-- Sans cette migration : la page du bon dit « offre indisponible », la pub garde
--   son lien vers l'itinéraire Google Maps, la console n'affiche aucun chiffre de bon.
--
-- RLS : activée sans policy = service-role seulement. Idempotente.

CREATE TABLE IF NOT EXISTS ad_vouchers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code          TEXT NOT NULL CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  token         TEXT NOT NULL UNIQUE CHECK (char_length(token) >= 24),
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at   TIMESTAMPTZ,
  redeemed_by   UUID,
  UNIQUE (restaurant_id, code)
);

CREATE INDEX IF NOT EXISTS ad_vouchers_request_idx ON ad_vouchers (request_id);
CREATE INDEX IF NOT EXISTS ad_vouchers_ip_idx ON ad_vouchers (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS ad_voucher_views (
  id         BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('meta', 'direct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_voucher_views_request_idx ON ad_voucher_views (request_id);

ALTER TABLE ad_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_voucher_views ENABLE ROW LEVEL SECURITY;
