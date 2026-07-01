-- ============================================================
-- M28 : ADR 0015 §6-7 — fondations onboarding self-service
--
-- Ajoute la propriété d'établissement (owner_id) et le statut de mise en
-- ligne (pending/active/disabled), ainsi que le rôle super-admin
-- plateforme (distinct de profiles.is_admin, qui reste "admin
-- établissement" au sens actuel — inchangé, les 12 pages /admin/**
-- existantes ne sont pas touchées par cette migration).
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'disabled'));

-- Établissement déjà en production — déjà validé de facto, ne doit pas
-- disparaître derrière le nouveau statut par défaut.
UPDATE restaurants SET status = 'active' WHERE id = 'kraainem';

-- Rôle super-admin plateforme — approuve les nouveaux établissements,
-- voit les statistiques cross-restaurant (ADR 0015 §7).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
