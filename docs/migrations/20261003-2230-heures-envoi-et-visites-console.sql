-- ============================================================
-- Apprendre l'heure d'envoi aux restaurateurs (ADR 0077 §4, PR C)
--
-- Quoi :
--   console_visits_hourly   ouvertures de la console par établissement × jour × heure
--                           (Bruxelles). Au plus une par personne et par heure (filtre
--                           côté navigateur), AUCUN identifiant : un compteur, pas un
--                           journal de présence. Signal rapide de « quand les gérants
--                           sont disponibles », en attendant que les clics suffisent.
--   message_timing          l'heure fixée par la plateforme pour une audience
--                           (« restaurant ») quand les seuils sont atteints. Sans ligne :
--                           les envois tournent entre les créneaux.
--   record_console_visit()  incrément atomique du compteur.
--
-- Sécurité : RLS activée SANS policy = service-role uniquement. La visite est comptée
-- par /api/admin/visit après vérification de l'accès console ; les visites du
-- super-admin en mode plateforme ne comptent pas. Fonction réservée au service-role.
--
-- Idempotent. Sans la migration : l'onglet « Meilleures heures » dit « tables absentes »,
-- les envois tournent entre les créneaux (fail-open).
-- ============================================================

CREATE TABLE IF NOT EXISTS console_visits_hourly (
  restaurant_id  text      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day            date      NOT NULL,
  hour           smallint  NOT NULL CHECK (hour BETWEEN 0 AND 23),
  visits         integer   NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, day, hour)
);

ALTER TABLE console_visits_hourly ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION record_console_visit(p_restaurant_id text, p_day date, p_hour smallint)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO console_visits_hourly (restaurant_id, day, hour, visits)
  VALUES (p_restaurant_id, p_day, p_hour, 1)
  ON CONFLICT (restaurant_id, day, hour)
  DO UPDATE SET visits = console_visits_hourly.visits + 1;
$$;

REVOKE ALL ON FUNCTION record_console_visit(text, date, smallint) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS message_timing (
  audience    text        PRIMARY KEY CHECK (audience IN ('restaurant')),
  slot        smallint    CHECK (slot IN (900, 1100, 1500, 1730)),
  updated_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE message_timing ENABLE ROW LEVEL SECURITY;
