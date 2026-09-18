-- ============================================================
-- 2026-09-18 08:00 — Lectures de ticket : garder la clé brute, tracer la
-- seconde lecture (audit des refus « numéro non lu », ADR 0058 / 0036)
--
-- Quoi : deux colonnes sur `receipt_scans`.
--   - `ocr_order_number_raw` : la clé de commande telle que le modèle l'a lue,
--     AVANT le contrôle de format. Aujourd'hui une clé hors format est jetée :
--     impossible de savoir si un format inconnu revient (ex. un Bestelnummer
--     « 2026-09-17/223/036 » à 3 chiffres vu sur une photo refusée à
--     Kraainem). Avec elle, on changera la règle sur des chiffres, pas sur un
--     cas.
--   - `ocr_key_second_read` : vrai quand la clé a été trouvée par la seconde
--     lecture (modèle plus précis, relancé seulement si le total est lu et la
--     clé manque). Mesure ce que la seconde lecture rattrape.
--
-- Même règle de conservation que le reste de la lecture (30 jours, ADR 0036),
-- service role uniquement (RLS inchangée). Aucun euro exposé.
--
-- Sans cette migration : les lectures sont rangées sans ces deux champs
-- (lib/receipt-scans.ts réessaie sans eux). Idempotente.
-- ============================================================

ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_order_number_raw TEXT;
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_key_second_read BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'receipt_scans'
--      AND column_name IN ('ocr_order_number_raw', 'ocr_key_second_read');   -- 2 lignes
--   Après quelques jours de tickets :
--   SELECT ocr_order_number_raw, COUNT(*) FROM receipt_scans
--    WHERE ocr_order_number IS NULL AND ocr_order_number_raw IS NOT NULL
--    GROUP BY 1 ORDER BY 2 DESC;
