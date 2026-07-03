-- ============================================================
-- M29b : CORRECTIF URGENT — handle_new_user (m29) casse toute
-- création de compte ("Database error creating new user").
-- Version défensive : chaque lecture de métadonnée est isolée
-- (un champ illisible ne bloque JAMAIS l'inscription), cast
-- explicite ::jsonb (tolère raw_user_meta_data en json ou jsonb),
-- schéma qualifié + search_path fixé.
-- Idempotente : sûre à relancer.
-- ============================================================

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

-- ── Auto-test 1 : l'INSERT du trigger passe-t-il tel quel ? ──
-- (échoue visiblement ici si le problème est ailleurs que dans la fonction)
DO $$
DECLARE v_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.profiles (id, email, display_name, phone, birth_date, zones)
  VALUES (v_id, v_id || '@selftest.local', 'Selftest', NULL, NULL, '{}');
  DELETE FROM public.profiles WHERE id = v_id;
  RAISE NOTICE 'Auto-test insert profiles : OK';
END $$;

-- ── Auto-test 2 : définition active de la fonction ──
SELECT pg_get_functiondef('public.handle_new_user'::regproc) AS definition_active;
