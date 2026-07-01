-- ============================================================
-- M27 : ADR 0015 §1-5 — cœur multi-établissements
--
-- Remplace profiles.restaurant_id (jamais réellement utilisé par le code,
-- cf. investigation ADR 0015) et profiles.team_id (colonne unique, un seul
-- établissement au total) par une table de liaison memberships : un membre
-- peut désormais appartenir à plusieurs établissements, une équipe max par
-- établissement.
--
-- Colonnes owner_id/status/sector sur restaurants volontairement absentes
-- ici — liées à l'onboarding self-service (§6-7) et à la carte secteur (§9),
-- hors scope de cette migration, ajoutées par leur propre migration future.
--
-- profiles.team_id / profiles.restaurant_id restent en base (pas de DROP
-- COLUMN) mais ne sont plus lues par le nouveau code — nettoyage futur une
-- fois la bascule confirmée stable.
-- ============================================================

-- 1. Établissements du réseau — remplace les env vars par déploiement (nom, liens sociaux)
CREATE TABLE IF NOT EXISTS restaurants (
  id               TEXT PRIMARY KEY,                 -- slug, ex. 'kraainem'
  name             TEXT NOT NULL,
  google_maps_url  TEXT,
  instagram_url    TEXT,
  tiktok_url       TEXT,
  facebook_url     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurants_public_read" ON restaurants;
CREATE POLICY "restaurants_public_read" ON restaurants FOR SELECT USING (true);

-- 2. Appartenance d'un membre à un établissement (remplace profiles.restaurant_id + profiles.team_id)
CREATE TABLE IF NOT EXISTS memberships (
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id TEXT REFERENCES restaurants(id) NOT NULL,
  team_id       UUID REFERENCES teams(id),        -- nullable tant que pas d'équipe choisie
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, restaurant_id)
);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_own_read" ON memberships;
CREATE POLICY "memberships_own_read" ON memberships FOR SELECT USING (auth.uid() = user_id);
-- Écritures via service role uniquement (même convention que teams — lib/teams.ts,
-- "Création / adhésion via service role, pas de policy INSERT sur teams")

CREATE INDEX IF NOT EXISTS idx_memberships_restaurant ON memberships (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_team ON memberships (team_id) WHERE team_id IS NOT NULL;

-- 3. transfers : cooldown changement d'équipe scopé par établissement (ADR 0015 §5)
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS restaurant_id TEXT REFERENCES restaurants(id);

-- 4. Seed : établissement(s) déjà réel(s) en base — compléter les liens
--    sociaux à la main depuis les env vars actuelles au moment de la migration
INSERT INTO restaurants (id, name)
VALUES ('kraainem', 'Belchicken Kraainem')
ON CONFLICT (id) DO NOTHING;

-- 5. Backfill : dérivé de teams.restaurant_id (fiable), PAS de profiles.restaurant_id
--    (colonne jamais réellement lue par le code — cf. investigation ADR 0015)
INSERT INTO memberships (user_id, restaurant_id, team_id)
SELECT p.id, t.restaurant_id, p.team_id
FROM profiles p
JOIN teams t ON t.id = p.team_id
WHERE p.team_id IS NOT NULL AND t.restaurant_id IS NOT NULL
ON CONFLICT (user_id, restaurant_id) DO NOTHING;

-- 6. Re-cibler la mise à jour de member_count/total_spent sur memberships
--    (remplace les triggers on_team_change + on_first_team_join sur profiles,
--    consolidés en une seule fonction couvrant INSERT et UPDATE — les anciens
--    triggers étaient tous les deux "AFTER UPDATE OF team_id", ce qui ne
--    couvrait pas le cas d'une ligne memberships créée directement avec un
--    team_id déjà renseigné)
DROP TRIGGER IF EXISTS on_team_change ON profiles;
DROP TRIGGER IF EXISTS on_first_team_join ON profiles;

CREATE OR REPLACE FUNCTION update_member_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_member_total_spent NUMERIC;
BEGIN
  -- Première équipe (INSERT direct avec team_id déjà renseigné, ou UPDATE depuis NULL)
  IF (TG_OP = 'INSERT' AND NEW.team_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.team_id IS NULL AND NEW.team_id IS NOT NULL) THEN
    UPDATE community_scores
    SET member_count = member_count + 1,
        last_updated = NOW()
    WHERE team_id = NEW.team_id AND restaurant_id = NEW.restaurant_id;
    RETURN NEW;
  END IF;

  -- Changement d'équipe (UPDATE, ancienne équipe non nulle et différente) —
  -- transfère aussi la dépense cumulée du membre vers la nouvelle équipe
  IF TG_OP = 'UPDATE' AND OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_member_total_spent
      FROM orders
      WHERE user_id = NEW.user_id AND status = 'validated' AND restaurant_id = NEW.restaurant_id;

    UPDATE community_scores
    SET member_count = member_count - 1,
        total_spent  = GREATEST(0, total_spent - v_member_total_spent),
        last_updated = NOW()
    WHERE team_id = OLD.team_id AND restaurant_id = NEW.restaurant_id;

    IF NEW.team_id IS NOT NULL THEN
      UPDATE community_scores
      SET member_count = member_count + 1,
          total_spent  = total_spent + v_member_total_spent,
          last_updated = NOW()
      WHERE team_id = NEW.team_id AND restaurant_id = NEW.restaurant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_membership_team_change
AFTER INSERT OR UPDATE OF team_id ON memberships
FOR EACH ROW EXECUTE FUNCTION update_member_counts();

-- Note (hors scope de cette migration) : calculate_pending_reward() (m5) lit
-- encore `SELECT team_id FROM profiles WHERE id = NEW.user_id`, mais son
-- trigger on_pending_reward_create a été supprimé en m20 — cette fonction
-- est du code mort aujourd'hui (le calcul se fait dans lib/rewards.ts,
-- appelé explicitement par app/api/orders/route.ts). Rien à faire ici ;
-- la vraie résolution du team_id à corriger est côté API route (voir
-- l'implémentation applicative de cette même tâche).
