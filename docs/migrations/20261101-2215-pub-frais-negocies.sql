-- ============================================================
-- Pub : frais de service négociés par établissement (ADR 0086 amendé le 2026-11-01)
--
-- Quoi : restaurant_subscriptions.ad_fee_pct — taux de frais Pub négocié avec CE
--   restaurateur, en % du budget. NULL = le tarif du forfait (AD_FEE_PCT :
--   Gratuit 20 %, Croissance 15 %, Pro 5 %).
-- Pourquoi : Houba et De Bue passent en Croissance avec des frais Pub à 10 %
--   (décision de Mehdi du 2026-11-01) sans changer le tarif Croissance des autres.
--   Les taux négociés se posent à la main en prod (UPDATE), JAMAIS dans ce fichier :
--   le dépôt est public, un tarif client n'y figure pas.
-- Sans elle : la lecture du taux échoue, le code retombe sur le tarif du forfait
--   (fail-open), et chaque demande garde le taux réellement appliqué (ad_requests.fee_pct).
-- RLS inchangée (table service-role only). Idempotente.
-- ============================================================

ALTER TABLE restaurant_subscriptions ADD COLUMN IF NOT EXISTS ad_fee_pct numeric(5,2);

DO $$ BEGIN
  ALTER TABLE restaurant_subscriptions
    ADD CONSTRAINT restaurant_subscriptions_ad_fee_pct_check CHECK (ad_fee_pct IS NULL OR (ad_fee_pct >= 0 AND ad_fee_pct <= 50));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contrôle : SELECT restaurant_id, plan, ad_fee_pct FROM restaurant_subscriptions WHERE ad_fee_pct IS NOT NULL;
