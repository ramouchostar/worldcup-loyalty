-- ============================================================
-- Canal général de broadcast + communications de service (ADR 0039)
--
-- Deux manques constatés à Kraainem le 2026-08-21 :
--
-- 1. `sendBroadcast` sélectionnait les membres par `team_id`. Or 13 membres
--    sur 16 n'ont pas d'équipe (ADR 0034) : ils étaient INVISIBLES pour
--    l'outil. Un broadcast « à tous » partait en réalité à 1 personne.
--    Le correctif est côté code (audience par établissement) — rien en base.
--
-- 2. Le filtre de consentement marketing s'appliquait à TOUT message, y
--    compris « ton ticket n'est pas passé, c'est réparé » — qui n'est pas
--    du marketing mais l'exécution du programme auquel le membre a adhéré.
--    D'où la distinction `service` / `promo` (ADR 0039 §2), qui a besoin :
--      • d'un type de journal distinct, pour que les deux enveloppes
--        anti-spam ne se mangent pas l'une l'autre ;
--      • d'une colonne sur les annonces programmées, pour que le cron sache
--        ce qu'il envoie.
--
-- Idempotente, sûre à rejouer. Le code fonctionne sans elle (fail-open) :
-- sans cette migration, un message de service est journalisé en
-- `admin_broadcast` et une annonce programmée repart en `promo`.
-- ============================================================

-- ── 1. Journal : un type dédié aux communications de service ──────────────
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN (
    'tier_upgrade',
    'member_inactive',
    'tier_approaching',
    'advancement',
    'admin_broadcast',   -- promotion composée par le restaurateur (consentement)
    'admin_service',     -- information de service (exécution du contrat)
    'tier_nudge',
    'birthday',
    'winback'
  ));

-- ── 2. Annonces programmées : garder la nature jusqu'à l'envoi ────────────
ALTER TABLE scheduled_broadcasts
  ADD COLUMN IF NOT EXISTS nature TEXT NOT NULL DEFAULT 'promo';

ALTER TABLE scheduled_broadcasts DROP CONSTRAINT IF EXISTS scheduled_broadcasts_nature_check;
ALTER TABLE scheduled_broadcasts ADD CONSTRAINT scheduled_broadcasts_nature_check
  CHECK (nature IN ('service', 'promo'));

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT trigger_type, count(*) FROM notification_log GROUP BY 1;
--   SELECT nature, count(*) FROM scheduled_broadcasts GROUP BY 1;
