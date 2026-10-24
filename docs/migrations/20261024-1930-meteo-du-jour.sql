-- ============================================================
-- Météo du jour photographiée (ADR 0087 §3)
--
-- Quoi :
--   restaurant_day_weather   la météo d'UN jour pour UN établissement, résumée par
--                            service (midi, soir — lib/signals/weather.ts), lue sur
--                            Google Weather (historique des 24 dernières heures) le
--                            soir même par la tâche des rappels du CA.
--
-- Pourquoi : expliquer un CA inhabituel (« Soir : pluie, 6 mm »). Google ne garde que
-- 24 h d'historique : sans photo prise le jour même, la météo d'un jour saisi le
-- lendemain ou plus tard n'existe plus.
--
-- Sécurité : RLS activée SANS policy = service-role uniquement.
--
-- Idempotent. Sans la migration : la remarque dit « météo inconnue », rien ne casse.
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_day_weather (
  restaurant_id  text        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day            date        NOT NULL,
  services       jsonb       NOT NULL,
  source         text        NOT NULL DEFAULT 'google_weather',
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, day)
);

ALTER TABLE restaurant_day_weather ENABLE ROW LEVEL SECURITY;
