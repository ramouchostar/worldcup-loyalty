-- ============================================================
-- M48 : Socle monétisation — droits d'accès par établissement (ADR 0029)
--
-- Phase 1 du chantier de monétisation : la FONDATION, rien n'est encore gaté.
-- Deux tables, TOUTES service-role only (RLS activée, AUCUNE policy) — jamais
-- lues ni écrites côté client. Le plan concerne le RESTAURATEUR ; le membre ne
-- paie jamais et n'est jamais concerné (ADR 0007/0028 intacts).
--
-- Absence de ligne dans restaurant_subscriptions = plan 'gratuit' implicite
-- (le resolver lib/entitlements.ts en tient compte) → non-cassant pour les
-- établissements existants. Idempotent. Les colonnes de facturation Stripe
-- (stripe_customer_id, …) arriveront en Phase 5 (m51), pas ici.
-- ============================================================

-- 1. Abonnement d'un établissement : 1 ligne par resto, plan courant + statut.
--    'gratuit' par défaut. plan_activated_at = 1er passage payant (audit).
--    status permet à Stripe (Phase 5) de couper l'accès payant (past_due /
--    canceled → le resolver retombe en 'gratuit') sans supprimer la ligne.
CREATE TABLE IF NOT EXISTS restaurant_subscriptions (
  restaurant_id     TEXT        PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  plan              TEXT        NOT NULL DEFAULT 'gratuit'
                      CHECK (plan IN ('gratuit','croissance','pro')),
  status            TEXT        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','past_due','canceled')),
  plan_activated_at TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE restaurant_subscriptions ENABLE ROW LEVEL SECURITY; -- service-role only

-- 2. Essais par fonction : 1 ligne par (resto, fonction), posée quand la
--    fonction devient data-ready / à la 1re utilisation (Phase 2). ON CONFLICT
--    DO NOTHING → un essai ne se ré-arme jamais (idempotent). trial_ends_at
--    est calculé par l'app (durée ajustable par fonction, ADR 0029 §5).
--    Les clés 'feature' reflètent les surfaces payantes : A→croissance
--    (forecast, sales, insights, broadcast_scheduled, barometer_advanced),
--    B→pro (sector_benchmarks).
CREATE TABLE IF NOT EXISTS feature_trials (
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  feature       TEXT        NOT NULL CHECK (feature IN (
                  'forecast','sales','insights','broadcast_scheduled',
                  'barometer_advanced','sector_benchmarks')),
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, feature)
);
ALTER TABLE feature_trials ENABLE ROW LEVEL SECURITY; -- service-role only
