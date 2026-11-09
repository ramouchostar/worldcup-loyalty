-- ============================================================
-- Refus par famille de téléphone (ADR 0096) — LECTURE SEULE, comptes uniquement.
-- Sert à décider si un décodeur de QR pour iPhone vaut son poids : le contrôle du QR de l'affiche
-- sur le téléphone ne marche que sur Chrome Android (BarcodeDetector) ; sur iPhone la photo de
-- l'affiche part au serveur et coûte une lecture payante.
-- Seuls les scans enregistrés APRÈS la mise en service portent `ocr_trace.device` : filtre ci-dessous.
-- À lancer dans l'éditeur SQL de Supabase après ~2 semaines d'arrivées.
--
-- Règle de décision proposée : si les refus « qr_detected » d'iPhone dépassent ~1 % des scans iPhone,
-- ou ~10 par semaine, le décodeur vaut le coup ; sinon on laisse.
-- ============================================================

-- 1. Scans et refus, par famille de téléphone
SELECT ocr_trace->>'device' AS telephone,
       COUNT(*)                                             AS scans,
       COUNT(*) FILTER (WHERE refusal_reason IS NOT NULL)   AS refus,
       COUNT(*) FILTER (WHERE refusal_reason = 'qr_detected') AS refus_qr_affiche
  FROM receipt_scans
 WHERE ocr_trace ? 'device'
 GROUP BY 1 ORDER BY 2 DESC;

-- 2. Les motifs de refus, par famille de téléphone
SELECT ocr_trace->>'device' AS telephone, refusal_reason, COUNT(*) AS scans
  FROM receipt_scans
 WHERE ocr_trace ? 'device' AND refusal_reason IS NOT NULL
 GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- 3. Rythme hebdomadaire des refus « QR de l'affiche » sur iPhone
SELECT date_trunc('week', scanned_at)::date AS semaine, COUNT(*) AS refus_qr_iphone
  FROM receipt_scans
 WHERE ocr_trace->>'device' = 'ios' AND refusal_reason = 'qr_detected'
 GROUP BY 1 ORDER BY 1;
