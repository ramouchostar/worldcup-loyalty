-- ============================================================
-- 2026-09-07 19:30 — Tracer le scan d'un visiteur (audit parcours ticket)
--
-- receipt_scans.user_id était NOT NULL (m58) : storeScan était sauté pour un
-- visiteur sans compte, donc l'étage le plus décisif de l'entonnoir (le scan
-- AVANT le compte, ADR 0040/0045) n'existait dans aucune table. On rend la
-- colonne nullable : une ligne de scan visiteur porte user_id NULL et
-- storage_path NULL — la lecture OCR est conservée, JAMAIS l'image
-- (minimisation ADR 0025 : pas de compte, pas de photo archivée).
--
-- Sans cette migration : rien ne casse — storeScan est best-effort, l'insert
-- d'un scan visiteur échoue en silence et l'entonnoir reste aveugle comme
-- avant. Idempotente.
-- ============================================================

ALTER TABLE receipt_scans ALTER COLUMN user_id DROP NOT NULL;
