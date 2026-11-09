-- ============================================================
-- 2026-11-10 10:00 — Drapeau « écran d'arrivée en un seul bouton » par établissement (ADR 0097).
--
-- ÉTEINT PAR DÉFAUT : appliquer cette migration ne change rien pour personne. L'écran n'apparaît
-- que pour un établissement dont le drapeau est allumé, et seulement aux arrivées par le QR imprimé
-- (utm_source=qr_code) de visiteurs non connectés.
--
-- Sans cette migration : le code lit le drapeau en « fail-closed » (colonne absente = éteint), la
-- vitrine habituelle s'affiche. Idempotente.
-- ============================================================

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS arrival_one_button BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurants.arrival_one_button IS
  'ADR 0097 : allume l''écran d''arrivée en un seul bouton pour les arrivées par le QR imprimé. Éteint par défaut.';

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT id, arrival_one_button FROM restaurants WHERE is_demo = false;     -- tout à false
--
-- ── Allumer pour UN établissement (le test d'une semaine) — noter la date et l'heure ─────────
--   UPDATE restaurants SET arrival_one_button = true WHERE id = 'kraainem';
--
-- ── Éteindre (retour immédiat à la vitrine habituelle, sans déploiement) ────────────────────
--   UPDATE restaurants SET arrival_one_button = false WHERE id = 'kraainem';
