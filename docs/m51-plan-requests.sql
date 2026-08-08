-- ============================================================
-- M51 : Demandes de plan (ADR 0029 Phase 2 — paywall doux sans Stripe)
--
-- Le CTA du paywall « Demander le plan Croissance/Pro » enregistre une
-- demande que le super-admin voit sur /platform (section « Demandes de
-- plan ») et traite à la main : il active le plan (flip m48) ou ignore.
-- Service-role only (RLS activée, AUCUNE policy). Idempotent, non-cassant.
-- Disparaîtra au profit du checkout Stripe (Phase 5) — la table restera
-- comme trace des leads.
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_requests (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id  TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  requested_plan TEXT        NOT NULL CHECK (requested_plan IN ('croissance','pro')),
  feature        TEXT,       -- surface d'origine du clic (contexte commercial), libre
  requested_by   UUID        REFERENCES profiles(id),
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','handled')),
  handled_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE plan_requests ENABLE ROW LEVEL SECURITY; -- service-role only

-- Anti-spam : une seule demande EN ATTENTE par (resto, plan) — re-cliquer le
-- bouton ne crée pas de doublon (upsert côté app → « demande déjà envoyée »).
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_requests_pending
  ON plan_requests (restaurant_id, requested_plan) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_plan_requests_status ON plan_requests (status, created_at DESC);
