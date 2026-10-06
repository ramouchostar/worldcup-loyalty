-- ============================================================
-- Événements locaux : copie compacte de l'agenda de visit.brussels
-- (agenda.brussels, données ouvertes de la Région de Bruxelles-Capitale) —
-- ADR 0074 §8, signaux extérieurs du copilote.
--
-- QUOI. Table `local_events` : UNE LIGNE PAR OCCURRENCE (événement × jour × séance),
-- avec les heures de début, de fin, d'ouverture des portes et de fin de soirée
-- (`night_life_until`), le lieu (nom, code postal, commune, coordonnées), les
-- indicateurs de la source (grande capacité, gratuit, annulé, complet) et son
-- classement. Générique : `source` + `external_id` permettent d'y verser aussi
-- Ticketmaster et UiTdatabank, avec des lignes comparables.
--
-- POURQUOI UNE COPIE. L'API n'a ni filtre de date, ni compression, ni requête
-- conditionnelle : lire l'agenda coûte 16 appels et 144 Mo. On le lit tous les
-- deux jours (cron) et on garde ici seulement ce qui peut compter pour un
-- restaurant (voir lib/signals/local-events.ts, `isNotable`) sur une fenêtre
-- glissante de 90 jours. Les lectures par établissement se font sur cette table.
--
-- DONNÉES PERSONNELLES. Aucune : l'API publie des e-mails et téléphones
-- d'organisateurs et de lieux, ils ne sont PAS recopiés ici.
--
-- LICENCE. Publié comme « données ouvertes » par visit.brussels et le CIRB
-- (annonce du CIRB, portail datastore.brussels). Le texte exact de la licence
-- n'a pas pu être lu depuis l'outil de lecture (portail en JavaScript) : à
-- confirmer auprès de visit.brussels avant un usage commercial large.
--
-- RLS : activée SANS policy = service-role only (rien n'est lu côté client).
-- Idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS local_events (
  id               UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  source           TEXT             NOT NULL,                 -- 'visitbrussels' | 'ticketmaster' | 'uitdatabank'
  external_id      TEXT             NOT NULL,                 -- « <id de l'événement>:<jour>T<heure de début> » (une séance)
  event_id         TEXT             NOT NULL,                 -- id de l'événement chez la source (regroupe les occurrences)
  name             TEXT             NOT NULL,
  category         TEXT             NOT NULL,                 -- normalisée : concert, spectacle, theatre, festival, fete, brocante, foire, sport, cinema, expo, autre
  source_category  TEXT,                                      -- valeur d'origine (sub_type)
  day              DATE             NOT NULL,                 -- jour calendaire à Bruxelles
  starts_at        TIMESTAMPTZ,                               -- UTC, NULL si l'heure n'est pas connue
  ends_at          TIMESTAMPTZ,
  doors_at         TIMESTAMPTZ,
  night_life_until TIMESTAMPTZ,                               -- fin de soirée (clubs, afterworks)
  venue_name       TEXT,
  venue_zip        TEXT,
  venue_city       TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  is_high_capacity BOOLEAN          NOT NULL DEFAULT FALSE,
  is_free          BOOLEAN          NOT NULL DEFAULT FALSE,
  is_canceled      BOOLEAN          NOT NULL DEFAULT FALSE,
  is_soldout       BOOLEAN          NOT NULL DEFAULT FALSE,
  ranking          REAL,                                      -- visit.brussels : de 0 à 2, prestige du lieu plus que taille de l'événement
  url              TEXT,
  synced_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

ALTER TABLE local_events ENABLE ROW LEVEL SECURITY; -- service-role only

CREATE INDEX IF NOT EXISTS idx_local_events_day     ON local_events (day);
CREATE INDEX IF NOT EXISTS idx_local_events_zip_day ON local_events (venue_zip, day);
CREATE INDEX IF NOT EXISTS idx_local_events_source_synced ON local_events (source, synced_at);

COMMENT ON TABLE local_events IS
  'Occurrences d''événements locaux (une ligne par événement et par jour), copie compacte des agendas ouverts. Lue par lib/signals/local-events.ts. Rafraîchie par /api/cron/local-events ; chaque passage est journalisé dans signal_sync_runs.';
COMMENT ON COLUMN local_events.ranking IS
  'visit.brussels : 0 à 2. Reflète surtout le prestige du lieu (Ancienne Belgique, Botanique = 2), pas la taille de l''événement : ne pas l''utiliser seul pour juger de l''affluence.';

COMMIT;

-- Vérification : table vide avant le premier passage du cron.
SELECT source, COUNT(*) AS lignes, MIN(day) AS premier_jour, MAX(day) AS dernier_jour
  FROM local_events GROUP BY source;
