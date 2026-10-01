-- ============================================================
-- 2026-10-01 11:00 — D'où vient un établissement inscrit (UTM)
--
-- restaurants.signup_attribution JSONB
--   Pourquoi : on envoie des rapports d'audit (ADR 0069/0071) sans pouvoir dire
--   combien ont débouché sur une inscription. Le middleware capture les UTM du
--   premier lien restaurateur (cookie `partner_attribution`, 30 jours), et
--   createPartnerRestaurant les écrit ici : utm_source / utm_medium /
--   utm_campaign / utm_content (= id du rapport d'audit) / landing / at.
--   Sans la colonne, la création passe quand même (fail-open), sans source.
--
-- Lecture : SELECT id, name, created_at, signup_attribution FROM restaurants
--           WHERE signup_attribution->>'utm_source' = 'audit';
-- RLS : inchangée (écriture service role).
-- Idempotente.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS signup_attribution JSONB;

CREATE INDEX IF NOT EXISTS restaurants_signup_utm_source_idx
  ON restaurants ((signup_attribution->>'utm_source'))
  WHERE signup_attribution IS NOT NULL;
