-- M18 : Synchronisation liste WC2026 — 48 équipes (source : officielle 2026-06-10)
--
-- Éliminations (dans DB mais non qualifiées) :
--   Pologne, Serbie, Hongrie, Danemark, Cameroun, Nigeria, Mali,
--   Venezuela, Costa Rica, Honduras, Chili, Indonésie
--
-- Ajouts (qualifiées mais absentes de la DB) :
--   Bosnie-et-Herzégovine, Cap-Vert, Ghana, Haïti, Norvège, Paraguay,
--   Qatar, RD Congo, Suède, Tchéquie
--
-- Note : Italie déjà éliminée par M17 (correct), Irak reste actif (qualifié)

-- ── 1. Éliminer les équipes non qualifiées ───────────────────────────────────
UPDATE teams
SET is_active = false, eliminated_at = NOW()
WHERE country_code IN (
  'PL',  -- Pologne
  'RS',  -- Serbie
  'HU',  -- Hongrie
  'DK',  -- Danemark
  'CM',  -- Cameroun
  'NG',  -- Nigeria
  'ML',  -- Mali
  'VE',  -- Venezuela
  'CR',  -- Costa Rica
  'HN',  -- Honduras
  'CL',  -- Chili
  'ID'   -- Indonésie
) AND is_active = true;

-- ── 2. Ajouter les équipes qualifiées manquantes ─────────────────────────────
INSERT INTO teams (name, flag_emoji, country_code, is_active, round_reached) VALUES
  ('Bosnie-et-Herzégovine', '🇧🇦', 'BA', true, 'group_stage'),
  ('Cap-Vert',              '🇨🇻', 'CV', true, 'group_stage'),
  ('Ghana',                 '🇬🇭', 'GH', true, 'group_stage'),
  ('Haïti',                 '🇭🇹', 'HT', true, 'group_stage'),
  ('Norvège',               '🇳🇴', 'NO', true, 'group_stage'),
  ('Paraguay',              '🇵🇾', 'PY', true, 'group_stage'),
  ('Qatar',                 '🇶🇦', 'QA', true, 'group_stage'),
  ('RD Congo',              '🇨🇩', 'CD', true, 'group_stage'),
  ('Suède',                 '🇸🇪', 'SE', true, 'group_stage'),
  ('Tchéquie',              '🇨🇿', 'CZ', true, 'group_stage')
ON CONFLICT (country_code) DO UPDATE
  SET is_active    = true,
      eliminated_at = NULL,
      round_reached = 'group_stage';

-- ── 3. community_scores pour les nouvelles équipes ───────────────────────────
INSERT INTO community_scores (team_id, restaurant_id, member_count, total_spent)
SELECT t.id, r.restaurant_id, 0, 0
FROM teams t
CROSS JOIN (SELECT DISTINCT restaurant_id FROM community_scores) r
WHERE t.country_code IN ('BA','CV','GH','HT','NO','PY','QA','CD','SE','CZ')
ON CONFLICT DO NOTHING;
