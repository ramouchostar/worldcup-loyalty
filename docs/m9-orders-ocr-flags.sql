-- ============================================================
-- Migration M9 : Champs OCR sur orders
-- Préparation pour l'auto-validation #12
-- ocr_amount  : montant extrait par Claude Vision
-- ocr_confidence : 0–100 score de confiance OCR
-- flag_reasons   : tableau des codes de flagging admin
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ocr_amount     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ocr_confidence SMALLINT
    CHECK (ocr_confidence IS NULL OR (ocr_confidence BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS flag_reasons   TEXT[]  DEFAULT '{}';

COMMENT ON COLUMN orders.ocr_amount     IS 'Montant extrait par Claude Vision — NULL si non encore traité';
COMMENT ON COLUMN orders.ocr_confidence IS 'Score OCR 0-100 — NULL si non traité, < 70 déclenche flag admin';
COMMENT ON COLUMN orders.flag_reasons   IS 'Codes raisons de flagging : high_amount, low_confidence, unreadable_bestelnummer, amount_mismatch, no_restaurant_header, too_many_today';
