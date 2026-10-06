-- ============================================================
-- Calendrier des grands événements sportifs, saisi à la main
-- (suite des décisions du 2026-10-06 sur le combat et les Jeux ; ADR 0074 §8,
-- signaux extérieurs du copilote).
--
-- QUOI. Nouveau `kind = 'sport_event'` dans `reference_calendar` (ADR 0027 §5),
-- avec cinq colonnes : `sport`, `starts_at` (coup d'envoi précis, quand il est
-- connu), `audience` (communautés pour qui l'événement compte, vide = tout le
-- monde), `importance` (1 à 3) et `country` (pays du lieu, ISO-2).
-- `city` et `label` existent déjà.
--
-- POURQUOI À LA MAIN. Ces événements ont leur date fixée des mois à l'avance et
-- sont peu nombreux : un calendrier saisi coûte moins qu'une API et ne tombe
-- pas en panne. Les calendriers qui bougent chaque semaine (matchs de foot,
-- UFC) viennent d'API (lib/signals/football.ts, UFCalendar/ESPN à venir).
--
-- RÈGLE DE SAISIE. Rien n'entre ici sans source solide (organisateur,
-- fédération, Wikipédia qui les cite). Volontairement ABSENTS :
--   · la boxe (les grands combats ne sont annoncés que quelques semaines à
--     l'avance, et les sources trouvées étaient peu fiables) ;
--   · le GP de Belgique de F1 2027 (calendrier officiel pas encore publié :
--     dates provisoires 16-18 ou 23-25 juillet) ;
--   · les grèves (aucune annoncée pour fin 2026 ; les avis du 2026-10 ne
--     contiennent que des travaux).
--
-- JUGEMENTS ÉDITORIAUX (à discuter, pas des faits) : `importance` et
-- `audience`. 3 = événement mondial, 2 = grand événement pour la clientèle
-- bruxelloise, 1 = niche. Les `audience` (BE, FR, NL, MA, DZ, TN…) indiquent
-- les communautés que l'événement mobilise le plus ; chaque établissement
-- choisira les siennes. Les heures `starts_at` des finales UEFA viennent de
-- Wikipédia et se confirment à l'approche. Les heures des soirées de combat ne
-- sont pas saisies (fuseaux très variables, non confirmées).
--
-- SOURCES (lues le 2026-10-06) : Wikipédia « 2026 in Glory », « 2026 in ONE
-- Championship », « 2027 UEFA Champions League final », « 2027 UEFA Europa
-- League final », « 2027 UEFA Conference League final », « 2027 Africa Cup of
-- Nations » ; ESPN (calendrier PFL) ; domestiquecycling.com (UCI WorldTour
-- 2027) ; presse (flashscore, bluewin) pour le Tour de France 2027 ; NBC pour
-- le Super Bowl LXI ; CIO pour Los Angeles 2028.
--
-- RLS : inchangée, `reference_calendar` reste service-role only.
-- FORECAST : inchangé, il ne lit que `school_holiday` et `national_event`.
-- Idempotente : purge les `sport_event` saisis à la main puis réinsère ; ne
-- touche à aucun autre kind.
-- ============================================================

BEGIN;

ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS sport      TEXT;
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS starts_at  TIMESTAMPTZ;
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS audience   TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS importance SMALLINT;
ALTER TABLE reference_calendar ADD COLUMN IF NOT EXISTS country    TEXT;

ALTER TABLE reference_calendar DROP CONSTRAINT IF EXISTS reference_calendar_kind_check;
ALTER TABLE reference_calendar ADD CONSTRAINT reference_calendar_kind_check
  CHECK (kind IN ('school_holiday', 'national_event', 'exam_session', 'sport_event'));

ALTER TABLE reference_calendar DROP CONSTRAINT IF EXISTS reference_calendar_sport_event_check;
ALTER TABLE reference_calendar ADD CONSTRAINT reference_calendar_sport_event_check
  CHECK (
    kind <> 'sport_event'
    OR (sport IS NOT NULL AND importance IS NOT NULL AND importance BETWEEN 1 AND 3)
  );

COMMENT ON COLUMN reference_calendar.sport IS
  'sport_event uniquement : football, combat, cyclisme, football_americain, jeux_olympiques…';
COMMENT ON COLUMN reference_calendar.starts_at IS
  'sport_event uniquement : coup d''envoi précis (UTC) quand il est connu ; NULL = seule la date est sûre.';
COMMENT ON COLUMN reference_calendar.audience IS
  'sport_event uniquement : communautés que l''événement mobilise (codes ISO-2 : BE, FR, NL, MA, DZ…). Vide = tout le monde.';
COMMENT ON COLUMN reference_calendar.importance IS
  'sport_event uniquement : 3 = événement mondial, 2 = grand événement pour la clientèle bruxelloise, 1 = niche. Jugement éditorial.';
COMMENT ON COLUMN reference_calendar.country IS
  'sport_event uniquement : pays du lieu (ISO-2).';

-- Purge des saisies manuelles précédentes (jamais les autres kinds).
DELETE FROM reference_calendar WHERE kind = 'sport_event' AND source = 'manuel';

INSERT INTO reference_calendar
  (kind, community, starts_on, ends_on, label, expected_effect, sport, starts_at, audience, importance, city, country)
VALUES
  -- ── Combat (fin 2026) ────────────────────────────────────────────────────
  ('sport_event', NULL, '2026-10-16', '2026-10-16', 'PFL Chicago : Carmouche vs Bishop 2 (MMA)',                      NULL, 'combat', NULL, '{}',          1, 'Chicago',   'US'),
  ('sport_event', NULL, '2026-10-17', '2026-10-17', 'GLORY 110 (kickboxing), Lotto Arena',                             NULL, 'combat', NULL, '{BE}',        2, 'Anvers',    'BE'),
  ('sport_event', NULL, '2026-10-17', '2026-10-17', 'ONE Samurai 4 (MMA, kickboxing)',                                 NULL, 'combat', NULL, '{}',          1, 'Tokyo',     'JP'),
  ('sport_event', NULL, '2026-11-07', '2026-11-07', 'ONE Fight Night 49 (muay-thaï, MMA)',                             NULL, 'combat', NULL, '{}',          1, 'Bangkok',   'TH'),
  ('sport_event', NULL, '2026-11-14', '2026-11-14', 'PFL Dubaï : Nemkov vs Bilostenniy (MMA)',                         NULL, 'combat', NULL, '{}',          1, 'Dubaï',     'AE'),
  ('sport_event', NULL, '2026-11-28', '2026-11-28', 'GLORY Rivals 6 (kickboxing), Maaspoort',                          NULL, 'combat', NULL, '{NL,BE}',     1, 'Bois-le-Duc', 'NL'),
  ('sport_event', NULL, '2026-12-12', '2026-12-12', 'GLORY Collision 10 (kickboxing), GelreDome',                      NULL, 'combat', NULL, '{NL,BE}',     2, 'Arnhem',    'NL'),
  ('sport_event', NULL, '2026-12-12', '2026-12-12', 'ONE Fight Night 50 (muay-thaï, MMA)',                             NULL, 'combat', NULL, '{}',          1, 'Bangkok',   'TH'),
  ('sport_event', NULL, '2026-12-19', '2026-12-19', 'PFL Lyon : Lapilus vs McKee (MMA), LDLC Arena',                   NULL, 'combat', NULL, '{FR,BE}',     2, 'Lyon',      'FR'),
  -- ── 2027 ─────────────────────────────────────────────────────────────────
  ('sport_event', NULL, '2027-02-14', '2027-02-14', 'Super Bowl LXI, SoFi Stadium (coup d''envoi dans la nuit à Bruxelles)', NULL, 'football_americain', NULL, '{}', 2, 'Inglewood', 'US'),
  ('sport_event', NULL, '2027-04-04', '2027-04-04', 'Tour des Flandres',                                                NULL, 'cyclisme', NULL, '{BE}',     2, NULL,        'BE'),
  ('sport_event', NULL, '2027-04-11', '2027-04-11', 'Paris-Roubaix',                                                    NULL, 'cyclisme', NULL, '{BE,FR}',  1, NULL,        'FR'),
  ('sport_event', NULL, '2027-04-25', '2027-04-25', 'Liège-Bastogne-Liège',                                             NULL, 'cyclisme', NULL, '{BE}',     2, 'Liège',     'BE'),
  ('sport_event', NULL, '2027-05-26', '2027-05-26', 'Finale de la Ligue Europa, Francfort',                             NULL, 'football', TIMESTAMPTZ '2027-05-26 19:00:00+00', '{}',    2, 'Francfort', 'DE'),
  ('sport_event', NULL, '2027-06-02', '2027-06-02', 'Finale de la Ligue Conférence, Istanbul',                          NULL, 'football', TIMESTAMPTZ '2027-06-02 19:00:00+00', '{TR}',  1, 'Istanbul',  'TR'),
  ('sport_event', NULL, '2027-06-05', '2027-06-05', 'Finale de la Ligue des champions, Madrid',                         NULL, 'football', TIMESTAMPTZ '2027-06-05 16:00:00+00', '{}',    3, 'Madrid',    'ES'),
  ('sport_event', NULL, '2027-06-19', '2027-07-17', 'Coupe d''Afrique des nations 2027 (Kenya, Ouganda, Tanzanie)',     NULL, 'football', NULL, '{MA,DZ,TN,SN,CD,CI,CM}', 3, NULL, 'KE'),
  ('sport_event', NULL, '2027-07-02', '2027-07-25', 'Tour de France 2027 (départ d''Édimbourg, arrivée à Paris)',       NULL, 'cyclisme', NULL, '{BE,FR}',  2, NULL,        'GB'),
  -- ── 2028 ─────────────────────────────────────────────────────────────────
  ('sport_event', NULL, '2028-07-14', '2028-07-30', 'Jeux olympiques de Los Angeles 2028',                              NULL, 'jeux_olympiques', NULL, '{}', 3, 'Los Angeles', 'US');

COMMIT;

-- Vérification : 19 lignes attendues, dont 3 avec une heure précise (finales UEFA).
SELECT starts_on, ends_on, sport, importance, audience, starts_at, label
  FROM reference_calendar
 WHERE kind = 'sport_event'
 ORDER BY starts_on, label;
