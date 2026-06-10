-- M16 : Table wc2026_matches — calendrier complet + résultats WC2026
-- Source : football-data.org, importée une fois via /api/admin/import-schedule
-- Utilisée par le cron pour savoir quels matchs vérifier

CREATE TABLE IF NOT EXISTS wc2026_matches (
  fd_id           INTEGER PRIMARY KEY,      -- ID football-data.org
  stage           TEXT NOT NULL,            -- GROUP_STAGE, ROUND_OF_32, ROUND_OF_16, ...
  group_name      TEXT,                     -- GROUP_A ... GROUP_L (null pour knockout)
  kickoff_utc     TIMESTAMPTZ NOT NULL,
  home_tla        TEXT,                     -- null pour matchs knockout non encore définis
  away_tla        TEXT,
  home_score      INTEGER,
  away_score      INTEGER,
  penalties_home  INTEGER,
  penalties_away  INTEGER,
  winner          TEXT,                     -- HOME_TEAM | AWAY_TEAM | DRAW | null
  status          TEXT NOT NULL DEFAULT 'SCHEDULED',
  synced_at       TIMESTAMPTZ               -- dernière fois que le cron a mis à jour ce match
);

CREATE INDEX IF NOT EXISTS idx_wc2026_matches_kickoff ON wc2026_matches(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_wc2026_matches_status  ON wc2026_matches(status);
