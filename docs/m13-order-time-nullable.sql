-- ============================================================
-- M13 — order_time devient nullable
-- L'ancien formulaire manuel capturait l'heure.
-- Depuis ADR 0008 (Bestelnummer), la date est dans order_number —
-- l'heure n'est plus collectée ni utile.
-- ============================================================

ALTER TABLE orders
  ALTER COLUMN order_time DROP NOT NULL;
