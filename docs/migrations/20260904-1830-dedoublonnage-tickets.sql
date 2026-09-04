-- ============================================================
-- 2026-09-04 18:30 — Dédoublonnage des tickets par empreinte de contenu
-- (phase C du chantier d'activation).
--
-- POURQUOI
-- Le seul verrou anti-doublon était `orders.duplicate_key`, dérivé du numéro de
-- commande lu par l'OCR (ADR 0008, rendu configurable par l'ADR 0019). Un seul
-- chiffre mal lu — `…/08228` relu `…/08223` — produit une clé différente, donc
-- DEUX commandes validées pour un seul ticket physique, et deux cadeaux dus.
-- Constaté à Belchicken Kraainem pendant le test de lancement.
--
-- QUOI
-- 1. `orders.content_fingerprint` : empreinte du CONTENU du ticket
--    (établissement + montant + lignes d'articles normalisées et triées),
--    calculée par lib/receipt-fingerprint.ts. Indépendante du numéro de
--    commande, donc insensible à une erreur de lecture. L'heure n'y est pas :
--    la tolérance de ±2 min est appliquée à la comparaison, pas au hachage.
-- 2. `orders.image_phash` : hachage perceptuel de la photo (lib/image-phash.ts),
--    calculé côté SERVEUR sur l'image reçue — jamais fourni par le client.
-- 3. `duplicate_reviews` : journal des rapprochements. Un doublon certain y est
--    tracé (`auto_rejected`) ; un cas ambigu y attend une décision humaine
--    (`pending`), les deux tickets côte à côte dans la console.
--
-- RLS
-- `duplicate_reviews` : RLS activée SANS policy = service-role uniquement. La
-- règle qui a déclenché le rapprochement et le seuil de confusion OCR sont de
-- la mécanique anti-fraude — ni le membre ni le restaurateur ne doivent pouvoir
-- la lire (même principe que `receipt_scans`, ADR 0036 §4, et
-- `restaurant_receipt_config`, ADR 0019).
--
-- SANS CETTE MIGRATION
-- Le code est tolérant : la soumission retente son insertion sans les deux
-- colonnes, le chargement des candidats se rabat sur une sélection réduite, et
-- le journal est simplement sauté (lib/duplicate-guard.ts). Aucun membre n'est
-- bloqué — le dédoublonnage renforcé est seulement inactif.
--
-- Idempotente, rejouable.
-- ============================================================

-- ── 1. Empreinte et hachage d'image sur les commandes ───────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS image_phash TEXT;

COMMENT ON COLUMN orders.content_fingerprint IS
  'Empreinte du contenu du ticket (resto + montant + lignes normalisées triées), SHA-256 tronqué à 32 car. — lib/receipt-fingerprint.ts. Ne contient PAS l''heure : la tolérance ±2 min est appliquée à la comparaison.';
COMMENT ON COLUMN orders.image_phash IS
  'Hachage perceptuel 64 bits (16 car. hex) de la photo du ticket, calculé côté serveur — lib/image-phash-server.ts. NULL si l''image n''a pas pu être décodée.';

-- Recherche des candidats : même établissement, journée du ticket. Pas d'index
-- UNIQUE — deux clients PEUVENT commander la même chose le même jour ; c'est la
-- conjonction empreinte + heure + membre qui fait le doublon, et elle se décide
-- dans le code, pas dans une contrainte.
CREATE INDEX IF NOT EXISTS idx_orders_fingerprint
  ON orders (restaurant_id, order_date, content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

-- Fenêtre « même membre, moins de 24 h » (signaux image et heure+montant).
CREATE INDEX IF NOT EXISTS idx_orders_user_recent
  ON orders (user_id, restaurant_id, submitted_at DESC);

-- ── 2. Journal des rapprochements ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duplicate_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- La commande soumise. NULL quand la soumission a été refusée d'emblée
  -- (doublon certain) : aucune ligne `orders` n'a alors été créée.
  order_id         UUID REFERENCES orders(id) ON DELETE CASCADE,
  -- La commande déjà en base à laquelle elle a été rapprochée.
  matched_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Règle qui a tranché (lib/duplicate-detection.ts) et sa phrase explicative.
  rule           TEXT NOT NULL,
  detail         TEXT,

  -- Ce que le système a fait, puis ce qu'un humain en a dit.
  --   auto_rejected      : doublon certain, soumission refusée sur-le-champ
  --   pending            : cas ambigu, en attente d'une décision humaine
  --   confirmed_duplicate: un admin a confirmé le doublon
  --   legit              : un admin a confirmé deux commandes distinctes
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('auto_rejected', 'pending', 'confirmed_duplicate', 'legit')),
  decided_at     TIMESTAMPTZ,
  decided_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- File d'attente de la console : les cas non tranchés, les plus récents d'abord.
CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_pending
  ON duplicate_reviews (restaurant_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_order
  ON duplicate_reviews (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE duplicate_reviews ENABLE ROW LEVEL SECURITY; -- service-role only

COMMENT ON TABLE duplicate_reviews IS
  'Phase C — journal des rapprochements de tickets. Service-role uniquement : la règle déclenchée est de la mécanique anti-fraude (même principe que receipt_scans, ADR 0036 §4).';

-- ── Vérification ────────────────────────────────────────────────────────────
--   SELECT status, rule, count(*) FROM duplicate_reviews GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT count(*) FILTER (WHERE content_fingerprint IS NOT NULL) AS avec_empreinte,
--          count(*) FILTER (WHERE image_phash IS NOT NULL)         AS avec_phash,
--          count(*)                                                AS total
--     FROM orders;
