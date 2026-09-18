-- ============================================================
-- 2026-09-18 02:50 — Consigne de lecture du Bestelnummer : EN BAS du ticket
--
-- Quoi : corrige la consigne de position (`position_hint`) des établissements
-- Belchicken créés avec l'ancienne valeur par défaut « printed near the top of
-- the receipt » (houba et de-bue, 2026-08-18). Elle prend la valeur exacte de
-- kraainem, dont les tickets sont identiques.
--
-- Pourquoi : terrain Houba du 2026-09-17 — 14 photos refusées pour 7 tickets
-- acceptés. Les petits tickets de borne n'impriment PAS le nom du resto en
-- haut : le Bestelnummer est leur seule preuve (lib/receipt-proof.ts). La
-- lecture OCR, invitée à le chercher « en haut », ne le trouvait pas et
-- refusait le ticket (« On n'a pas reconnu de ticket »).
--
-- ADR 0019 (clé de commande par établissement). Le défaut du code
-- (lib/receipt-config.ts, LEGACY_BESTELNUMMER_CONFIG) est corrigé dans la
-- même PR, pour les prochains établissements.
--
-- Sans cette migration : rien ne casse, mais les refus continuent à Houba et
-- De Bue. Idempotente : ne touche que les lignes encore sur l'ancienne valeur.
-- ============================================================

UPDATE restaurant_receipt_config
SET position_hint =
  'printed near the bottom of the receipt, in the payment block after the total (Betaalmethode / Bestelnummer / Kanaal)'
WHERE key_label = 'Bestelnummer'
  AND position_hint = 'printed near the top of the receipt';

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT restaurant_id, position_hint
--     FROM restaurant_receipt_config
--    WHERE key_label = 'Bestelnummer';
--   → kraainem, houba et de-bue : « printed near the bottom of the receipt… »
