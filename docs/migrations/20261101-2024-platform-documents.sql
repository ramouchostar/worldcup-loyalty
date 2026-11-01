-- ============================================================
-- Documents internes de la plateforme (ADR 0033 §4)
--
-- Textes réservés aux associés (super-admin), lus par le serveur avec la clé
-- service-role : d'abord le cas client Kraainem du kit de visite
-- (/platform/kit). Ils vivent en base et non dans le code parce que le dépôt
-- GitHub est public et que ces textes contiennent des chiffres de clients.
-- RLS activée sans policy (= service-role only). Idempotent. Aucun DROP.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_documents (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_documents IS
  'Textes internes des associés (kit de visite, cas clients). Service-role uniquement : jamais exposé côté membre ni restaurateur.';
