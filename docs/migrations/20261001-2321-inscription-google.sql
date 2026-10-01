-- ============================================================
-- 2026-10-01 23:21 — Inscription restaurateur depuis Google (ADR 0075)
--
-- restaurants.google_place_id TEXT, unique quand renseigné
--   Pourquoi : une fiche Google = un établissement (ADR 0075 §7). Empêche un
--   second compte d'inscrire la même fiche (doublon, concurrent).
-- restaurants.phone TEXT
--   Le téléphone lu sur la fiche Google, corrigeable à l'inscription.
-- restaurants.signup_prefill JSONB
--   Trace du pré-remplissage (ADR 0075 § Traces) : { source: 'google'|'manuel',
--   corrected: ['name','sector',…] } — les champs que le restaurateur a changés
--   par rapport à Google. Un champ corrigé souvent = lecture Google à revoir.
--
-- Sans cette migration : l'inscription marche (fail-open), sans téléphone, sans
-- trace, et sans le garde-fou anti-doublon (signalé en console serveur).
-- RLS : inchangée (écritures service role).
-- Idempotente.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS signup_prefill  JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_google_place_id_key
  ON restaurants (google_place_id)
  WHERE google_place_id IS NOT NULL;
