-- ============================================================
-- La réserve des prévisions météo de MET Norway (ADR 0112 §9)
--
-- Quoi :
--   weather_forecast_cache  une ligne par point (latitude et longitude tronquées à deux décimales, environ 1 km) :
--                           la dernière réponse gardée (heures utiles seulement), la valeur « Last-Modified » reçue,
--                           l'instant avant lequel aucune nouvelle demande n'est permise, et la dernière panne.
--                           La ligne « * » suspend toutes les demandes après un refus (429, 403).
--
-- Pourquoi : les conditions de MET Norway demandent de garder chaque réponse et de ne pas redemander avant l'heure
-- « Expires », ni plus d'une fois toutes les 3 heures hors pays nordiques. La réserve doit survivre d'un appel au
-- suivant : sans elle, on ne peut pas tenir ces conditions.
--
-- Aucune donnée personnelle : ni établissement, ni membre, ni client.
--
-- Sécurité : RLS activée SANS policy = service role uniquement.
--
-- Sans cette migration : la source météo reste éteinte (« Pas encore possible » au réglage, dit au journal) ; les
-- autres occasions et le blog écrit à la main marchent comme avant. Elle ne dépend d'aucune autre ; la passer après
-- 20261126-1300 et 20261126-2330, avant de remplir MET_NORWAY_USER_AGENT.
--
-- Idempotente, non cassante. À APPLIQUER À LA MAIN dans l'éditeur SQL Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS weather_forecast_cache (
  key              TEXT         PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 40),
  ok               BOOLEAN      NOT NULL DEFAULT FALSE,
  status           INTEGER,
  error            TEXT         CHECK (error IS NULL OR char_length(error) <= 300),
  last_modified    TEXT         CHECK (last_modified IS NULL OR char_length(last_modified) <= 60),
  next_allowed_at  TIMESTAMPTZ  NOT NULL,
  confirmed_at     TIMESTAMPTZ,
  forecast         JSONB        CHECK (forecast IS NULL OR jsonb_typeof(forecast) = 'object'),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE weather_forecast_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE weather_forecast_cache IS
  'Réponses gardées de MET Norway (Locationforecast), une ligne par point à 2 décimales (ADR 0112). Service role uniquement.';
