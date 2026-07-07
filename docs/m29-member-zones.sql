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

-- Trigger profil : zones (JSON array), phone, birth_date depuis les métadonnées.
-- ⚠️ Version DÉFENSIVE (m29b) : la première version de ce fichier cassait
-- toute inscription (fonction non qualifiée + search_path absent dans le
-- contexte Supabase Auth). La définition ci-dessous est celle de m29b —
-- rejouer ce fichier après m29b ne peut plus régresser. Incident réel :
-- migrations rejouées en lot le 2026-07-06 → inscriptions cassées en prod.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta  JSONB  := '{}'::jsonb;
  v_zones TEXT[] := '{}';
  v_birth DATE   := NULL;
BEGIN
  BEGIN
    v_meta := COALESCE(NEW.raw_user_meta_data::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_meta := '{}'::jsonb;
  END;

  BEGIN
    IF jsonb_typeof(v_meta->'zones') = 'array' THEN
      v_zones := ARRAY(SELECT jsonb_array_elements_text(v_meta->'zones'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_zones := '{}';
  END;

  BEGIN
    v_birth := NULLIF(v_meta->>'birth_date', '')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_birth := NULL;
  END;

  INSERT INTO public.profiles (id, email, display_name, phone, birth_date, zones)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_meta->>'display_name', split_part(NEW.email, '@', 1)),
    NULLIF(v_meta->>'phone', ''),
    v_birth,
    v_zones
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Vérification
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'zones') AS profiles_zones,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'zone')     AS teams_zone;
