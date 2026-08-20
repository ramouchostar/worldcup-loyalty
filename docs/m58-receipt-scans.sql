-- ============================================================
-- M58 : conservation des tickets scannés (ADR 0036)
--
-- Jusqu'ici l'image d'un ticket n'était gardée QUE si la soumission allait
-- jusqu'au bout : l'aperçu OCR (/api/orders/parse-receipt) envoyait la photo
-- à Claude Vision puis la jetait. Tout ce qui échouait entre les deux —
-- entête non reconnue, membre qui abandonne, refus serveur (cf. les 6 scans
-- perdus de Kraainem les 18-19/08/2026) — ne laissait AUCUNE trace : ni
-- image, ni lecture OCR, rien à comparer.
--
-- `receipt_scans` garde une ligne par appel Vision : l'image, ce que le
-- modèle a lu, et la commande qui en est sortie (ou pas). C'est l'outil de
-- contrôle qualité de l'OCR : image ↔ lecture ↔ encodage.
--
-- Rétention : 30 jours pour TOUTE image de ticket, devenue commande ou non
-- (purge quotidienne /api/cron/purge-receipts). Les lignes `orders` et leurs
-- montants, eux, restent — seule l'image s'efface.
--
-- Service-role only (RLS activée, AUCUNE policy) : la lecture OCR brute et
-- la confiance sont des internes anti-fraude (ADR 0019), jamais exposés au
-- membre ni au restaurateur. Idempotent, sûr à rejouer.
-- ============================================================

CREATE TABLE IF NOT EXISTS receipt_scans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,

  -- Chemin dans le bucket privé `receipts` (jamais une URL publique, ADR 0003).
  -- NULL après purge : la ligne survit à l'image pour garder la statistique.
  storage_path   TEXT,
  scanned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purged_at      TIMESTAMPTZ,

  -- Ce que Claude Vision a lu, tel quel.
  ocr_order_number         TEXT,
  ocr_amount               NUMERIC(10,2),
  ocr_confidence           INTEGER,
  ocr_order_time           TEXT,
  ocr_has_restaurant_header BOOLEAN,
  ocr_items                JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Ce qu'est devenu le scan.
  --   parsed          : lu, rendu au membre, pas (encore) soumis
  --   header_rejected : refusé à l'aperçu (« pas un ticket <resto> »)
  --   submitted       : devenu la commande `order_id`
  outcome        TEXT NOT NULL DEFAULT 'parsed'
                 CHECK (outcome IN ('parsed', 'header_rejected', 'submitted')),
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL
);

-- Consultation console plateforme : les plus récents d'abord, filtrables par resto.
CREATE INDEX IF NOT EXISTS idx_receipt_scans_recent
  ON receipt_scans (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_scans_resto
  ON receipt_scans (restaurant_id, scanned_at DESC);
-- Balayage de la purge quotidienne : uniquement ce qui porte encore une image.
CREATE INDEX IF NOT EXISTS idx_receipt_scans_a_purger
  ON receipt_scans (scanned_at) WHERE storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_scans_order
  ON receipt_scans (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE receipt_scans ENABLE ROW LEVEL SECURITY; -- service-role only

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT outcome, count(*), count(storage_path) AS avec_image
--     FROM receipt_scans GROUP BY outcome;
