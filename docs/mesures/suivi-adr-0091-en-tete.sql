-- ============================================================
-- Suivi de l'ADR 0091 — l'en-tête imprimé décide de l'établissement
-- LECTURE SEULE (aucune écriture) — à lancer dans l'éditeur SQL de Supabase,
-- 7 jours après la fusion de la PR 421 (fusionnée le 2026-11-09 à 22:14 UTC) : à partir du 2026-11-16.
-- Comptes uniquement : aucun nom, aucun identifiant de membre.
--
-- Ce qui dira que la règle est fausse :
--   · requête 3 : des refus « other » sur des tickets légitimes (en-tête mal lu) ;
--   · requête 4 : une part d'en-têtes exploitables bien en dessous de ~54 % (consigne de lecture à revoir).
-- Ce qui dira qu'elle sert : requête 2 (clés au code faux sauvées par l'en-tête).
-- ============================================================

-- 1. Ce que l'en-tête a décidé, par établissement
SELECT restaurant_id,
       COALESCE(ocr_trace->'header'->>'verdict', 'non lu') AS verdict_en_tete,
       COUNT(*) AS scans
  FROM receipt_scans
 WHERE scanned_at > '2026-11-09 22:14+00'
   AND restaurant_id IN ('kraainem', 'houba', 'de-bue')
 GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- 2. Clés sauvées par l'en-tête : le code disait « autre / inconnu », l'en-tête a gardé la clé
SELECT restaurant_id, COUNT(*) AS cles_sauvees
  FROM receipt_scans
 WHERE scanned_at > '2026-11-09 22:14+00'
   AND ocr_trace->'header'->>'overrode_code' = 'true'
 GROUP BY 1;

-- 3. Refus décidés par l'en-tête (verdict « other ») : nombreux ET légitimes = règle trop dure.
--    Pour un cas douteux, regarder le nom et l'adresse lus dans ocr_trace->'header'.
SELECT restaurant_id, ocr_trace->'header'->>'matched' AS designe, refusal_reason, COUNT(*) AS scans
  FROM receipt_scans
 WHERE scanned_at > '2026-11-09 22:14+00'
   AND ocr_trace->'header'->>'verdict' = 'other'
 GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- 4. Part des tickets lus dont l'en-tête est exploitable (own ou other) — ~54 % avant l'ADR
SELECT COUNT(*) FILTER (WHERE ocr_trace->'header'->>'verdict' IN ('own', 'other')) AS en_tete_decisif,
       COUNT(*) FILTER (WHERE ocr_order_number_raw IS NOT NULL OR ocr_amount IS NOT NULL) AS tickets_lus
  FROM receipt_scans
 WHERE scanned_at > '2026-11-09 22:14+00'
   AND restaurant_id IN ('kraainem', 'houba', 'de-bue');

-- 5. De Bue — seulement si la migration 20261019-1700 (code 253) est appliquée :
--    refus de code, puis corrections ramenées à 253.
SELECT refusal_reason, COUNT(*) FROM receipt_scans
 WHERE restaurant_id = 'de-bue' AND scanned_at > now() - interval '7 days'
   AND refusal_reason IN ('key_code_unknown', 'wrong_establishment') GROUP BY 1;

SELECT COUNT(*) AS cles_ramenees_a_253 FROM receipt_scans
 WHERE restaurant_id = 'de-bue' AND scanned_at > now() - interval '7 days'
   AND ocr_trace ? 'key_code_repaired';
