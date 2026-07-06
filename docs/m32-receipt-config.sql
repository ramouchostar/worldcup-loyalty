-- ============================================================
-- M32 : ADR 0019 — config de clé unique de ticket par établissement
-- 1. restaurant_receipt_config : la clé qui identifie une commande
--    sur le format de ticket de CET établissement (découverte à
--    l'onboarding via photos d'exemple, confirmée par le resto).
--    Remplace le Bestelnummer codé en dur — les restos sans ligne
--    retombent sur la config legacy Bestelnummer côté code.
-- 2. Seed rétrocompat : Belchicken Kraainem garde sa config actuelle.
-- 3. orders.duplicate_key devient scopé par établissement
--    ("<restaurant_id>:<clé>") : l'index UNIQUE est global et deux
--    restos avec des numéros de tickets séquentiels simples
--    collisionneraient sinon.
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_receipt_config (
  restaurant_id    TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  has_reliable_key BOOLEAN     NOT NULL DEFAULT true,
  key_label        TEXT,                     -- ex. 'Bestelnummer', 'N° ticket'
  key_description  TEXT,                     -- description du format, injectée dans le prompt OCR
  key_pattern      TEXT,                     -- regex ANCRÉE (^...$), validée côté serveur avant sauvegarde
  key_examples     TEXT[]      NOT NULL DEFAULT '{}',
  position_hint    TEXT,                     -- ex. 'en haut, sous le logo'
  date_group       SMALLINT,                 -- groupe de capture contenant la date YYYY-MM-DD, NULL sinon
  confirmed_at     TIMESTAMPTZ,              -- NULL = proposition non confirmée par le restaurateur
  confirmed_by     UUID REFERENCES profiles(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS sans policy : service role uniquement. Le pattern sert à
-- l'anti-doublon — jamais exposé aux membres.
ALTER TABLE restaurant_receipt_config ENABLE ROW LEVEL SECURITY;

-- Seed rétrocompat : la config Bestelnummer historique de Belchicken.
INSERT INTO restaurant_receipt_config
  (restaurant_id, has_reliable_key, key_label, key_description, key_pattern,
   key_examples, position_hint, date_group, confirmed_at)
VALUES (
  'kraainem', true, 'Bestelnummer',
  'a code in format YYYY-MM-DD/NNN/NNNNN (e.g. 2026-06-01/258/03993)',
  '^(\d{4}-\d{2}-\d{2})/\d{3}/\d{5}$',
  ARRAY['2026-06-01/258/03993'],
  'printed near the top of the receipt', 1, NOW()
)
ON CONFLICT (restaurant_id) DO NOTHING;

-- duplicate_key scopé : "<restaurant_id>:<clé>". Idempotent (le WHERE
-- exclut les lignes déjà préfixées). ':' n'apparaît ni dans un
-- Bestelnummer ni dans une clé synthétique NOBN_ → aucun faux positif.
UPDATE orders
SET duplicate_key = restaurant_id || ':' || duplicate_key
WHERE duplicate_key NOT LIKE restaurant_id || ':%';
