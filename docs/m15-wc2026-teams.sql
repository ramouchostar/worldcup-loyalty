-- ============================================================
-- M15 — Équipes réelles Coupe du Monde 2026 (48 équipes)
-- Format WC2026 : 12 groupes de 4 → 32 équipes → 16 → 8 → 4 → 2 → 1
-- Nouveau tour : round_of_32 (seizièmes de finale)
--
-- APPROCHE SAFE : ne jamais DELETE (FK profiles.team_id)
--   • UPDATE les équipes existantes qui ont qualifié
--   • Marquer non-qualifiés is_active=false, eliminated_at=NOW()
--   • INSERT les nouvelles équipes qualifiées
--   • INSERT community_scores (0/0) pour les nouvelles équipes
--
-- ⚠️  Équipes marquées INCERTAIN : vérifier avant de publier
-- ============================================================


-- ── 1. Marquer non-qualifiés comme éliminés ────────────────────────────────
-- (membres attachés à ces équipes verront "éliminée" et pourront transférer)

UPDATE teams SET is_active = false, eliminated_at = NOW()
WHERE country_code IN ('PL', 'SCO', 'DZ');
-- Pologne, Écosse, Algérie → n'ont pas qualifié pour WC2026


-- ── 2. Corriger les noms/flags des équipes existantes ─────────────────────

UPDATE teams SET name = 'Italie',        flag_emoji = '🇮🇹' WHERE country_code = 'IT';
UPDATE teams SET name = 'Croatie',       flag_emoji = '🇭🇷' WHERE country_code = 'HR';
UPDATE teams SET name = 'Pays-Bas',      flag_emoji = '🇳🇱' WHERE country_code = 'NL';
UPDATE teams SET name = 'Danemark',      flag_emoji = '🇩🇰' WHERE country_code = 'DK';
UPDATE teams SET name = 'Suisse',        flag_emoji = '🇨🇭' WHERE country_code = 'CH';
UPDATE teams SET name = 'Corée du Sud',  flag_emoji = '🇰🇷' WHERE country_code = 'KR';
UPDATE teams SET name = 'Arabie Saoudite', flag_emoji = '🇸🇦' WHERE country_code = 'SA';


-- ── 3. Insérer les nouvelles équipes qualifiées ───────────────────────────

INSERT INTO teams (name, flag_emoji, country_code) VALUES

  -- UEFA (manquants après élimination Pologne + Écosse)
  ('Hongrie',          '🇭🇺', 'HU'),
  ('Albanie',          '🇦🇱', 'AL'),   -- INCERTAIN : peut-être Slovaquie/Grèce/Tchéquie

  -- CONMEBOL (manquants)
  ('Équateur',         '🇪🇨', 'EC'),
  ('Venezuela',        '🇻🇪', 'VE'),

  -- CAF (manquants après élimination Algérie)
  ('Égypte',           '🇪🇬', 'EG'),
  ('Mali',             '🇲🇱', 'ML'),
  ('Afrique du Sud',   '🇿🇦', 'ZA'),
  ('Côte d''Ivoire',   '🇨🇮', 'CI'),

  -- AFC (manquants)
  ('Iran',             '🇮🇷', 'IR'),
  ('Australie',        '🇦🇺', 'AU'),
  ('Irak',             '🇮🇶', 'IQ'),
  ('Jordanie',         '🇯🇴', 'JO'),
  ('Ouzbékistan',      '🇺🇿', 'UZ'),   -- INCERTAIN : peut-être Émirats/Oman/Bahreïn

  -- CONCACAF (manquants)
  ('Panama',           '🇵🇦', 'PA'),
  ('Costa Rica',       '🇨🇷', 'CR'),
  ('Honduras',         '🇭🇳', 'HN'),   -- INCERTAIN : peut-être Jamaïque

  -- OFC
  ('Nouvelle-Zélande', '🇳🇿', 'NZ'),

  -- Barrages intercontinentaux (INCERTAIN — vérifier)
  ('Chili',            '🇨🇱', 'CL'),
  ('Indonésie',        '🇮🇩', 'ID');


-- ── 4. Community scores (0/0) pour chaque nouvelle équipe × restaurant ────

INSERT INTO community_scores (team_id, restaurant_id, member_count, total_spent)
SELECT t.id, r.restaurant_id, 0, 0
FROM teams t
CROSS JOIN (SELECT DISTINCT restaurant_id FROM community_scores) r
LEFT JOIN community_scores cs
       ON cs.team_id = t.id AND cs.restaurant_id = r.restaurant_id
WHERE cs.team_id IS NULL;


-- ── 5. Mise à jour du trigger : ajouter round_of_32 dans les bonus ────────
-- Nouvelle progression des récompenses d'avancement WC2026 :
--   Groupes       → pas de bonus
--   Seizièmes (32) → Churros 6 pcs
--   Huitièmes (16) → Finest burger  (upgrade depuis Churros)
--   Quarts (8)    → Menu 4 Tenders (upgrade depuis Finest burger)
--   Demi (4)      → Chef's Combo
--   Finale (2)    → Chef's Combo

CREATE OR REPLACE FUNCTION calculate_pending_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id             UUID;
  v_restaurant_id       TEXT;
  v_team_score          NUMERIC;
  v_round_reached       TEXT;
  v_team_active         BOOLEAN;
  v_restaurant_unlocked BOOLEAN;
  v_solo_item           TEXT;
  v_solo_cost           NUMERIC(6,2);
  v_community_item      TEXT;
  v_community_cost      NUMERIC(6,2);
  v_advancement_item    TEXT;
  v_advancement_cost    NUMERIC(6,2);
BEGIN
  IF NEW.status != 'validated' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'validated' THEN RETURN NEW; END IF;

  v_restaurant_id := NEW.restaurant_id;

  SELECT team_id INTO v_team_id
    FROM profiles WHERE id = NEW.user_id;

  IF v_team_id IS NULL THEN RETURN NEW; END IF;

  SELECT t_item, t_cost INTO v_solo_item, v_solo_cost
    FROM (VALUES
      (60::numeric, 'Chef''s Combo',  1.92::numeric),
      (40::numeric, 'Menu 4 Tenders', 1.93::numeric),
      (25::numeric, 'Finest burger',  0.94::numeric),
      (15::numeric, 'Churros 6 pcs',  0.31::numeric)
    ) AS t(t_threshold, t_item, t_cost)
    WHERE NEW.amount >= t_threshold
    ORDER BY t_threshold DESC
    LIMIT 1;

  SELECT cs.score, tm.round_reached, tm.is_active
    INTO v_team_score, v_round_reached, v_team_active
    FROM community_scores cs
    JOIN teams tm ON tm.id = v_team_id
    WHERE cs.team_id       = v_team_id
      AND cs.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    (SELECT is_unlocked FROM restaurant_thresholds
      WHERE restaurant_id = v_restaurant_id
      ORDER BY created_at DESC LIMIT 1),
    false
  ) INTO v_restaurant_unlocked;

  IF v_restaurant_unlocked THEN
    SELECT t_item, t_cost INTO v_community_item, v_community_cost
      FROM (VALUES
        (10000::numeric, 'Menu 4 Tenders', 1.93::numeric),
        ( 6000::numeric, 'Finest burger',  0.94::numeric),
        ( 3000::numeric, 'Churros 12 pcs', 0.63::numeric),
        ( 1000::numeric, 'Frites Medium',  0.24::numeric)
      ) AS t(t_threshold, t_item, t_cost)
      WHERE v_team_score >= t_threshold
      ORDER BY t_threshold DESC
      LIMIT 1;
  END IF;

  IF v_team_active THEN
    SELECT t_item, t_cost INTO v_advancement_item, v_advancement_cost
      FROM (VALUES
        ('final',         'Chef''s Combo',  1.92::numeric),
        ('semi_final',    'Chef''s Combo',  1.92::numeric),
        ('quarter_final', 'Menu 4 Tenders', 1.93::numeric),
        ('round_of_16',   'Finest burger',  0.94::numeric),
        ('round_of_32',   'Churros 6 pcs',  0.31::numeric)
      ) AS t(t_round, t_item, t_cost)
      WHERE v_round_reached = t_round
      LIMIT 1;
  END IF;

  IF v_solo_item IS NOT NULL
  OR v_community_item IS NOT NULL
  OR v_advancement_item IS NOT NULL
  THEN
    INSERT INTO pending_rewards (
      user_id, order_id, restaurant_id,
      solo_item,        solo_cost,
      community_item,   community_cost,
      advancement_item, advancement_cost,
      status
    ) VALUES (
      NEW.user_id, NEW.id, v_restaurant_id,
      v_solo_item,        v_solo_cost,
      v_community_item,   v_community_cost,
      v_advancement_item, v_advancement_cost,
      'available'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
