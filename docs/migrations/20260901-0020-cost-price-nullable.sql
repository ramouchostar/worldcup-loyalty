-- ============================================================
-- 2026-09-01 00:20 — Article sans coût admis au catalogue (ADR 0046, lot 4/6)
--
-- Décision validée par le porteur : un article lu sur les tickets peut entrer
-- au catalogue SANS prix de revient (le restaurateur ne l'a pas toujours sous
-- la main au moment du formulaire). Il se rattache et son CA compte tout de
-- suite ; sa marge s'affiche « coût manquant » — jamais 100 % ni 0 — et il est
-- EXCLU de tout circuit de récompense tant que le coût manque (garde-fous
-- dans lib/rewards.ts, lib/jetons-gift.ts, lib/reward-defaults.ts).
--
-- Sans cette migration : le formulaire de complétion exige le prix de revient
-- (message explicite), rien ne casse. Idempotente.
-- ============================================================

ALTER TABLE menu_items ALTER COLUMN cost_price DROP NOT NULL;
