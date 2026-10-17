-- ============================================================
-- Code client des établissements réels : BE001, BE002… (ADR 0085 §1)
--
-- Un seul compte publicitaire Meta sert tous les clients : le code client,
-- en tête du nom de chaque campagne, dit à qui elle appartient. Il est
-- attribué EN BASE (déclencheur), une seule fois, quand un établissement
-- devient un vrai client (status = 'active' ET is_demo = false), dans l'ordre
-- d'entrée. Un compte démo n'en a jamais ; un établissement pending le reçoit
-- à sa validation. Jamais réutilisé ni modifié : un code changé déplacerait
-- les résultats d'une campagne vers un autre client.
--
-- Rattrapage : les établissements réels déjà actifs reçoivent leur code dans
-- l'ordre COALESCE(activated_at, created_at) — vérifié en lecture seule le
-- 2026-10-16 : kraainem → BE001, houba → BE002, de-bue → BE003.
--
-- Pas de donnée sensible : la colonne suit la RLS existante de restaurants.
-- Idempotent (IF NOT EXISTS / OR REPLACE, rattrapage limité aux lignes sans
-- code). Sans cette migration, /platform n'affiche simplement aucun code.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS client_code TEXT;

COMMENT ON COLUMN restaurants.client_code IS
  'ADR 0085 — code client (BE001…) attribué une fois, en base, à la première entrée comme établissement réel (active, non démo). Jamais réutilisé ni modifié. Clé de rattachement des campagnes publicitaires.';

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_client_code_key
  ON restaurants (client_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_client_code_format'
  ) THEN
    ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_client_code_format
      CHECK (client_code IS NULL OR client_code ~ '^[A-Z]{2}[0-9]{3}$');
  END IF;
END $$;

-- Prochain code d'un pays : le plus grand numéro déjà donné + 1. Comme un code
-- n'est jamais retiré, le maximum suffit à ne jamais réutiliser un numéro.
CREATE OR REPLACE FUNCTION next_client_code(p_country TEXT DEFAULT 'BE')
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_country || lpad(
    (COALESCE(MAX(substring(client_code FROM 3)::INT), 0) + 1)::TEXT, 3, '0')
  FROM restaurants
  WHERE client_code LIKE p_country || '%';
$$;

-- Appelée par le déclencheur seulement, jamais par l'API.
REVOKE EXECUTE ON FUNCTION next_client_code(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION restaurants_client_code_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
-- Definer : l'attribution marche quel que soit le rôle qui valide l'établissement.
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un code donné ne bouge plus.
  IF TG_OP = 'UPDATE' AND OLD.client_code IS NOT NULL
     AND NEW.client_code IS DISTINCT FROM OLD.client_code THEN
    RAISE EXCEPTION 'restaurants.client_code est définitif (ADR 0085) : % ne peut pas devenir %',
      OLD.client_code, COALESCE(NEW.client_code, 'NULL');
  END IF;

  IF NEW.client_code IS NULL
     AND NEW.status = 'active'
     AND COALESCE(NEW.is_demo, false) = false THEN
    -- Deux validations simultanées ne doivent pas lire le même maximum.
    PERFORM pg_advisory_xact_lock(hashtext('restaurants.client_code'));
    NEW.client_code := next_client_code('BE');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurants_client_code_guard ON restaurants;
CREATE TRIGGER restaurants_client_code_guard
  BEFORE INSERT OR UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION restaurants_client_code_guard();

-- Rattrapage, dans l'ordre d'entrée.
DO $$
DECLARE
  r RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('restaurants.client_code'));
  FOR r IN
    SELECT id FROM restaurants
     WHERE client_code IS NULL
       AND status = 'active'
       AND COALESCE(is_demo, false) = false
     ORDER BY COALESCE(activated_at, created_at), created_at, id
  LOOP
    UPDATE restaurants SET client_code = next_client_code('BE') WHERE id = r.id;
  END LOOP;
END $$;

-- Contrôle : SELECT id, client_code FROM restaurants WHERE client_code IS NOT NULL ORDER BY client_code;
