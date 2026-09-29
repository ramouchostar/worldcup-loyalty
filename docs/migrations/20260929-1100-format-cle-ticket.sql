-- ============================================================
-- 2026-09-29 11:00 — Le format de la clé du ticket et le code de l'établissement (ADR 0073)
--
-- La clé imprimée par les bornes Belchicken : AAAA-MM-JJ / code / numéro.
--   • Le numéro est « 0 », un chiffre de 1 à 9, puis 1 à 3 chiffres : 3 à 5 caractères
--     (036, 0121, 01645). Mesuré sur 92 clés distinctes lues à l'identique par trois
--     modèles : 89 en 5 caractères, 3 en 4, 1 en 3 ; jamais un 0 en deuxième position.
--     Le motif d'avant (5 chiffres exactement) refusait des tickets réels : 20 photos
--     sur 199 (4 tickets distincts), dont 3 confirmées à l'œil.
--   • Le code du milieu est celui de l'établissement : 223 Kraainem, 258 Houba (15
--     photos sur 15). De Bue : aucun ticket observé, `store_code` reste NULL — la forme
--     seule est vérifiée, jusqu'au premier ticket confirmé à l'œil.
--   • La description donnée au modèle ne porte plus de code d'exemple : « 258 » (Houba)
--     y figurait pour les trois établissements, et Haiku l'a recopié à Kraainem.
--
-- ⚠ Ne touche que les trois établissements réels ; les comptes de démonstration gardent
-- leur configuration. Idempotente, sûre à rejouer.
-- Sans cette migration : le code déployé se comporte comme avant (motif à 5 chiffres,
-- aucun contrôle du code d'établissement) — rien ne casse, le gain attend.
-- ============================================================

ALTER TABLE restaurant_receipt_config ADD COLUMN IF NOT EXISTS store_code TEXT;

UPDATE restaurant_receipt_config
   SET key_pattern     = '^(\d{4}-\d{2}-\d{2})/\d{3}/0[1-9]\d{1,3}$',
       key_description = 'a code printed as YYYY-MM-DD/NNN/0NNNN: the date, a 3-digit code, then a number that always starts with 0 followed by a digit from 1 to 9. That last number has 3 to 5 characters in total (for example 036, 0121 or 01645). Copy it exactly as printed: never pad it with extra zeros, never shorten it, never add or drop a digit',
       key_examples    = '{}',
       updated_at      = NOW()
 WHERE restaurant_id IN ('kraainem', 'houba', 'de-bue');

UPDATE restaurant_receipt_config SET store_code = '223' WHERE restaurant_id = 'kraainem';
UPDATE restaurant_receipt_config SET store_code = '258' WHERE restaurant_id = 'houba';

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT restaurant_id, store_code, key_pattern, key_examples
--     FROM restaurant_receipt_config WHERE restaurant_id IN ('kraainem', 'houba', 'de-bue');
--   → kraainem 223, houba 258, de-bue NULL ; key_examples vide.
--
-- ── Commandes DÉJÀ validées dont la clé ne colle pas (lecture seule, à ne pas corriger sans décision) ──
--   SELECT o.restaurant_id,
--          count(*)                                                              AS commandes_avec_numero,
--          count(*) FILTER (WHERE o.order_number !~ '^\d{4}-\d{2}-\d{2}/\d{3}/0[1-9]\d{1,3}$') AS mauvaise_forme,
--          count(*) FILTER (WHERE c.store_code IS NOT NULL
--                             AND split_part(o.order_number, '/', 2) <> c.store_code)          AS mauvais_code
--     FROM orders o JOIN restaurant_receipt_config c USING (restaurant_id)
--    WHERE o.order_number IS NOT NULL AND o.restaurant_id IN ('kraainem', 'houba', 'de-bue')
--    GROUP BY 1;
--   → Le 2026-09-29 : 12 commandes de Kraainem sur 82 portaient un code autre que 223
--     (dont 4 en 258 = Houba). La liste détaillée est produite en lecture seule
--     (banc d'essai OCR, donnees/audit-cles-existantes.csv).
--
-- ── Suivi des refus liés à la clé (à lancer après quelques jours) ──
--   SELECT reason, sum(count) AS refus
--     FROM funnel_events
--    WHERE step = 'ticket_rejected' AND day >= '2026-09-30'
--      AND reason IN ('wrong_establishment', 'key_code_unknown', 'header_rejected', 'unreadable')
--    GROUP BY 1 ORDER BY 2 DESC;
--   SELECT ocr_trace->>'key_issue' AS motif, count(*)
--     FROM receipt_scans WHERE ocr_trace ? 'key_issue' GROUP BY 1;
