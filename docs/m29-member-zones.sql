-- ============================================================
-- M29 : ADR 0018 — Zones du membre & découverte d'équipes
-- Idempotente : sûre à relancer
--
-- 1. profiles.zones : 1 à 3 zones déclarées par le membre (texte
--    libre, même maille ville/quartier que restaurants.sector).
-- 2. teams.zone : zone d'une équipe, pour la découverte « équipes
--    dans ta zone ». NULL = pas déclarée (joignable par code).
-- 3. handle_new_user : recopie zones + phone + birth_date depuis
--    les métadonnées d'inscription (phone/birth_date étaient
--    envoyés par le formulaire mais perdus jusqu'ici).
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS zones TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS zone TEXT;

CREATE INDEX IF NOT EXISTS idx_teams_restaurant_zone
  ON teams (restaurant_id, zone) WHERE is_active;

-- Trigger profil : zones (JSON array), phone, birth_date depuis les métadonnées
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, phone, birth_date, zones)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::DATE,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'zones')),
      '{}'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérification
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'zones') AS profiles_zones,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'zone')     AS teams_zone;
