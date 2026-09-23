-- ============================================================
-- 2026-09-23 10:00 — La carte d'identité du ticket : tout capter, mesurer
-- avant de refuser (ADR 0066, bouclier ADR 0065)
--
-- Terrain Kraainem, 2026-09-20 : un ticket de 73,30 € photographié deux fois
-- a produit DEUX commandes validées (735 points en trop, corrigés à la main
-- le 2026-09-23). La seconde photo, prise de loin, a été lue de travers :
-- total 73,50 €, numéro inventé (`…/221/04145` au lieu de `…/223/01645`) et
-- des articles absents du menu (« Wagyu Roast », « Sakisoba Rice »). Tout
-- différait, donc aucune protection anti-doublon ne pouvait s'en apercevoir.
--
-- Quoi : on conserve à chaque lecture ce qui identifie un ticket et permet de
-- juger la lecture elle-même.
--   `receipt_scans` : date imprimée, canal (« Self-order kiosk »…), numéro de
--   séquence du jour, sous-total, remise, moyen de paiement, et le résultat
--   des contrôles de cohérence (`ocr_checks`, `ocr_checks_failed`).
--   `restaurant_receipt_config.receipt_profile` : ce que la découverte à
--   l'onboarding a compris du ticket de CET établissement, au-delà de la clé.
--
-- ⚠️ Phase 1 : rien n'est refusé sur ces contrôles. Ils sont mesurés sur de
-- vrais tickets d'abord (décision du porteur) ; la phase 2 les activera.
-- Jamais de donnée bancaire : le numéro de carte et les codes d'autorisation
-- ne sont pas lus (ADR 0025).
--
-- Sans cette migration : les lectures sont rangées sans ces champs
-- (lib/receipt-scans.ts réessaie sans eux). Idempotente.
-- ============================================================

ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_printed_date    DATE;
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_channel         TEXT;
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_daily_sequence  TEXT;
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_subtotal        NUMERIC(10,2);
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_discount_total  NUMERIC(10,2);
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_payment_method  TEXT;
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_checks          JSONB;
ALTER TABLE receipt_scans ADD COLUMN IF NOT EXISTS ocr_checks_failed   TEXT[];

-- Ce que l'onboarding a compris du ticket, au-delà de la clé de commande
-- (heure, canal, séquence du jour, bloc des totaux) — service role only,
-- comme le reste de restaurant_receipt_config.
ALTER TABLE restaurant_receipt_config ADD COLUMN IF NOT EXISTS receipt_profile JSONB;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'receipt_scans' AND column_name LIKE 'ocr_%';   -- 8 colonnes de plus
--   Après quelques jours de tickets — quels contrôles échouent, et à quelle fréquence :
--   SELECT unnest(ocr_checks_failed) AS controle, COUNT(*)
--     FROM receipt_scans WHERE scanned_at > NOW() - INTERVAL '7 days'
--    GROUP BY 1 ORDER BY 2 DESC;
