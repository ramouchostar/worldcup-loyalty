-- M19 : Reset autoritatif de la liste WC2026
-- Approche : marquer TOUT inactif, puis activer exactement les 48 équipes qualifiées.
-- Idempotent — peut être rejoué sans risque.

-- ── Étape 1 : tout mettre inactif ────────────────────────────────────────────
UPDATE teams SET is_active = false, eliminated_at = NOW();

-- ── Étape 2 : activer les équipes déjà présentes dans la DB ─────────────────
UPDATE teams
SET is_active = true, eliminated_at = NULL
WHERE country_code IN (
  'ZA',  -- Afrique du Sud
  'DZ',  -- Algérie
  'DE',  -- Allemagne
  'ENG', -- Angleterre
  'SA',  -- Arabie saoudite
  'AR',  -- Argentine
  'AU',  -- Australie
  'AT',  -- Autriche
  'BE',  -- Belgique
  'BA',  -- Bosnie-et-Herzégovine
  'BR',  -- Brésil
  'CV',  -- Cap-Vert
  'CO',  -- Colombie
  'KR',  -- Corée du Sud
  'CI',  -- Côte d'Ivoire
  'HR',  -- Croatie
  'CW',  -- Curaçao
  'SCO', -- Écosse
  'EG',  -- Égypte
  'EC',  -- Équateur
  'ES',  -- Espagne
  'US',  -- États-Unis
  'FR',  -- France
  'GH',  -- Ghana
  'HT',  -- Haïti
  'IQ',  -- Irak
  'IR',  -- Iran
  'JO',  -- Jordanie
  'MA',  -- Maroc
  'MX',  -- Mexique
  'NO',  -- Norvège
  'NZ',  -- Nouvelle-Zélande
  'UZ',  -- Ouzbékistan
  'PA',  -- Panamá
  'PY',  -- Paraguay
  'NL',  -- Pays-Bas
  'PT',  -- Portugal
  'QA',  -- Qatar
  'CD',  -- RD Congo
  'SN',  -- Sénégal
  'SE',  -- Suède
  'CH',  -- Suisse
  'CZ',  -- Tchéquie
  'TN',  -- Tunisie
  'TR',  -- Turquie
  'UY',  -- Uruguay
  'CA',  -- Canada
  'JP'   -- Japon
);

-- ── Étape 3 : insérer les équipes manquantes (si pas encore dans la DB) ──────
INSERT INTO teams (name, flag_emoji, country_code, is_active, round_reached)
VALUES
  ('Bosnie-et-Herzégovine', '🇧🇦', 'BA', true, 'group_stage'),
  ('Cap-Vert',              '🇨🇻', 'CV', true, 'group_stage'),
  ('Curaçao',               '🇨🇼', 'CW', true, 'group_stage'),
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
      eliminated_at = NULL;

-- ── Étape 4 : community_scores pour les nouvelles équipes ────────────────────
INSERT INTO community_scores (team_id, restaurant_id, member_count, total_spent)
SELECT t.id, r.restaurant_id, 0, 0
FROM teams t
CROSS JOIN (SELECT DISTINCT restaurant_id FROM community_scores) r
WHERE t.country_code IN ('BA','CV','CW','GH','HT','NO','PY','QA','CD','SE','CZ')
  AND t.is_active = true
ON CONFLICT DO NOTHING;

-- ── Vérification : doit retourner exactement 48 lignes ───────────────────────
SELECT COUNT(*) AS equipes_actives FROM teams WHERE is_active = true;
