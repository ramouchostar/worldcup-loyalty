-- ============================================================
-- Sièges d'admin multi-rôles par établissement (ADR 0040)
--
-- Problème résolu : `restaurants.owner_id` n'autorise qu'UN SEUL admin par
-- établissement (ADR 0015 §7) — inviter quelqu'un d'autre (ADR 0032) évince
-- le précédent à l'acceptation. Or un restaurant est tenu par plusieurs
-- personnes. ADR 0032 avait déjà anticipé ce chemin dans ses alternatives
-- écartées : « le jour où [cette table] existe, l'invitation attribuera un
-- rôle au lieu d'écrire owner_id ».
--
-- Trois rôles : gérant, manager, équipe. Quotas 2 gérants / 2 managers par
-- établissement, équipe illimité — plafond tenu EN BASE (trigger), jamais en
-- code applicatif. Au-delà du plafond, tout nouveau siège gérant/manager est
-- automatiquement forcé en équipe (pas un rejet : la règle produit force la
-- réinscription du rôle, elle ne bloque pas l'invitation).
--
-- `restaurants.owner_id` est CONSERVÉ (aucune migration destructive, tout le
-- code existant continue de fonctionner) et devient DÉRIVÉ : le trigger de
-- synchronisation ne fait que la toute première attribution (le premier
-- gérant inséré) — un 2ᵉ gérant n'écrase jamais owner_id. Le « transfert de
-- gérance explicite » (choisir QUI devient owner_id sans retrait) reste hors
-- périmètre de cette migration.
--
-- Le retrait d'un siège est permis (§7) mais protégé par un plancher d'un
-- gérant minimum par établissement (trigger BEFORE DELETE) ; si le gérant
-- retiré était owner_id, un gérant restant reprend automatiquement la place
-- (trigger AFTER DELETE) pour ne jamais laisser la colonne dérivée orpheline.
--
-- Idempotent, sûr à rejouer.
-- ============================================================


-- ============================================================
-- 1. restaurant_admins
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_admins (
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL CHECK (role IN ('gerant', 'manager', 'equipe')),
  invited_by    UUID        REFERENCES profiles(id),   -- NULL = self-service, création plateforme, ou backfill
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, user_id)
);

ALTER TABLE restaurant_admins ENABLE ROW LEVEL SECURITY;

-- Contrairement à owner_invites (m55, AUCUNE policy) : un jeton d'invitation
-- est un secret porteur d'un droit, sa seule lecture suffit à l'exploiter,
-- donc service-role only sans exception. Une ligne restaurant_admins n'est
-- QUE l'appartenance de l'utilisateur lui-même à un établissement — l'exposer
-- à SON propre titulaire ne fuit rien sur les autres. middleware.ts doit
-- pouvoir vérifier « suis-je admin de ce restaurant ? » sans la clé
-- service-role (règle du fichier : le middleware ne l'embarque jamais) —
-- même précédent que profiles_own_read (m2) pour is_admin/is_super_admin.
-- Pas de "CREATE POLICY IF NOT EXISTS" en Postgres : DROP + CREATE, même
-- schéma idempotent que les triggers plus bas.
DROP POLICY IF EXISTS "restaurant_admins_own_read" ON restaurant_admins;
CREATE POLICY "restaurant_admins_own_read" ON restaurant_admins
  FOR SELECT USING (auth.uid() = user_id);

-- « Mes établissements » (lib/post-login.ts, app/admin/page.tsx, carte gérant
-- sur /r/[id]) : lookup par user_id seul, sur tous les établissements.
CREATE INDEX IF NOT EXISTS idx_restaurant_admins_user
  ON restaurant_admins (user_id);


-- ============================================================
-- 2. Plafond de sièges — trigger, pas un index
-- ============================================================
-- Un index unique partiel ne peut exprimer qu'« au plus UNE » ligne
-- correspondant à un prédicat (cf. uq_owner_invites_active) : il ne peut ni
-- compter jusqu'à deux, ni réécrire une ligne. La règle produit demande les
-- deux (compter ET forcer en équipe au-delà) → seul un trigger convient.
--
-- Le verrou explicite sur la ligne `restaurants` sérialise les écritures
-- concurrentes visant le MÊME établissement : sans lui, deux transactions
-- concurrentes pourraient toutes les deux lire count=1 (< 2) et insérer
-- toutes les deux — le plafond serait franchi malgré la vérification.

CREATE OR REPLACE FUNCTION enforce_restaurant_admin_seat_quota() RETURNS TRIGGER AS $$
DECLARE
  seat_count INT;
  quota      INT := 2; -- même plafond gérant et manager aujourd'hui ; en variable pour diverger un jour sans retoucher la fonction
BEGIN
  IF NEW.role NOT IN ('gerant', 'manager') THEN
    RETURN NEW; -- équipe = illimité, rien à vérifier
  END IF;

  PERFORM 1 FROM restaurants WHERE id = NEW.restaurant_id FOR UPDATE;

  SELECT COUNT(*) INTO seat_count
  FROM restaurant_admins
  WHERE restaurant_id = NEW.restaurant_id
    AND role = NEW.role
    AND user_id <> NEW.user_id; -- exclut la ligne en cours de MAJ (changement de rôle d'un siège existant)

  IF seat_count >= quota THEN
    -- Forçage silencieux vers équipe : c'est la règle produit (« tout siège
    -- au-delà du plafond est forcé en équipe »), appliquée ici pour couvrir
    -- aussi bien l'app que tout accès SQL direct. L'appelant DOIT relire le
    -- rôle réellement persisté (RETURNING role) : il peut différer du rôle
    -- proposé sur le lien d'invitation.
    NEW.role := 'equipe';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pas de "CREATE TRIGGER IF NOT EXISTS" en Postgres : DROP + CREATE est le
-- schéma idempotent standard pour un trigger.
DROP TRIGGER IF EXISTS trg_restaurant_admin_seat_quota ON restaurant_admins;
CREATE TRIGGER trg_restaurant_admin_seat_quota
  BEFORE INSERT OR UPDATE OF role ON restaurant_admins
  FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_admin_seat_quota();


-- ============================================================
-- 3. Synchronisation restaurants.owner_id ← premier gérant
-- ============================================================
-- AFTER INSERT (pas BEFORE) : lit toujours NEW.role APRÈS le trigger de
-- quota ci-dessus, jamais le rôle proposé avant rétrogradation éventuelle.

CREATE OR REPLACE FUNCTION sync_restaurant_owner_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'gerant' THEN
    -- Seulement si owner_id est encore NULL : ce trigger ne fait QUE la
    -- première attribution. Un 2ᵉ gérant n'écrase jamais owner_id — c'est un
    -- pointeur vers « le » gérant historique pour le code legacy
    -- (isRestaurantOwner, lib/admin-guard.ts), pas un miroir du dernier
    -- gérant ajouté. Le transfert de gérance est hors périmètre ici.
    UPDATE restaurants SET owner_id = NEW.user_id
      WHERE id = NEW.restaurant_id AND owner_id IS NULL;
  END IF;
  RETURN NULL; -- trigger AFTER : valeur de retour ignorée
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_restaurant_owner_id ON restaurant_admins;
CREATE TRIGGER trg_sync_restaurant_owner_id
  AFTER INSERT ON restaurant_admins
  FOR EACH ROW EXECUTE FUNCTION sync_restaurant_owner_id();


-- ============================================================
-- 4. owner_invites.role — rôle proposé, confirmé (pas choisi) à l'acceptation
-- ============================================================

ALTER TABLE owner_invites
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'gerant'
    CHECK (role IN ('gerant', 'manager', 'equipe'));

COMMENT ON COLUMN owner_invites.role IS
  'Rôle PROPOSÉ par l''inviteur (ADR 0040), CONFIRMÉ — pas librement choisi — par l''invité à l''acceptation. Default gérant pour compatibilité avec les lignes déjà existantes.';


-- ============================================================
-- 5. Backfill — un siège gérant par owner_id déjà attribué
-- ============================================================
-- Idempotent : chaque établissement a au plus un owner_id aujourd'hui, donc
-- aucune ligne ne peut franchir le plafond de 2 via ce backfill.

INSERT INTO restaurant_admins (restaurant_id, user_id, role, invited_by, created_at)
SELECT id, owner_id, 'gerant', NULL, NOW()
FROM restaurants
WHERE owner_id IS NOT NULL
ON CONFLICT (restaurant_id, user_id) DO NOTHING;


-- ============================================================
-- 7. Retrait d'un siège — plancher d'un gérant + resynchro owner_id
-- ============================================================
-- Miroir du §2 côté suppression : jamais tenu en code applicatif, un accès
-- SQL direct doit rester protégé. Deux invariants :
--   (a) un établissement ne peut jamais tomber à zéro gérant par une
--       suppression (BEFORE DELETE, bloque si c'est le dernier) ;
--   (b) si le gérant retiré était restaurants.owner_id, un gérant restant
--       (le plus ancien) reprend la place (AFTER DELETE) — sinon owner_id
--       pointerait vers un compte qui n'a plus aucun siège, cassant tout le
--       code legacy qui le lit (lib/restaurant.ts::isRestaurantOwner, etc.).
-- Le verrou explicite sur la ligne restaurants sérialise les retraits
-- concurrents visant le MÊME établissement, même raisonnement qu'au §2.

CREATE OR REPLACE FUNCTION enforce_restaurant_admin_min_gerant() RETURNS TRIGGER AS $$
DECLARE
  remaining_gerants INT;
BEGIN
  IF OLD.role <> 'gerant' THEN
    RETURN OLD; -- manager/équipe : pas de plancher
  END IF;

  PERFORM 1 FROM restaurants WHERE id = OLD.restaurant_id FOR UPDATE;

  SELECT COUNT(*) INTO remaining_gerants
  FROM restaurant_admins
  WHERE restaurant_id = OLD.restaurant_id AND role = 'gerant' AND user_id <> OLD.user_id;

  IF remaining_gerants = 0 THEN
    RAISE EXCEPTION 'Impossible de retirer le dernier gérant de cet établissement.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restaurant_admin_min_gerant ON restaurant_admins;
CREATE TRIGGER trg_restaurant_admin_min_gerant
  BEFORE DELETE ON restaurant_admins
  FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_admin_min_gerant();

-- AFTER DELETE (pas BEFORE) : ne s'exécute que si la suppression a
-- effectivement eu lieu, donc jamais quand le trigger ci-dessus a bloqué.
CREATE OR REPLACE FUNCTION resync_restaurant_owner_id_after_removal() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'gerant' THEN
    UPDATE restaurants SET owner_id = (
      SELECT user_id FROM restaurant_admins
      WHERE restaurant_id = OLD.restaurant_id AND role = 'gerant'
      ORDER BY created_at ASC LIMIT 1
    )
    WHERE id = OLD.restaurant_id AND owner_id = OLD.user_id;
  END IF;
  RETURN NULL; -- trigger AFTER : valeur de retour ignorée
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resync_restaurant_owner_id ON restaurant_admins;
CREATE TRIGGER trg_resync_restaurant_owner_id
  AFTER DELETE ON restaurant_admins
  FOR EACH ROW EXECUTE FUNCTION resync_restaurant_owner_id_after_removal();


-- ============================================================
-- 8. Vérification finale
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'restaurant_admins') AS table_ok,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE tgname = 'trg_restaurant_admin_seat_quota') AS quota_trigger_ok,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE tgname = 'trg_sync_restaurant_owner_id') AS sync_trigger_ok,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE tgname = 'trg_restaurant_admin_min_gerant') AS min_gerant_trigger_ok,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE tgname = 'trg_resync_restaurant_owner_id') AS resync_trigger_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'owner_invites' AND column_name = 'role') AS invite_role_col_ok,
  (SELECT COUNT(*) FROM restaurant_admins WHERE role = 'gerant') AS backfilled_gerants,
  (SELECT COUNT(*) FROM restaurants WHERE owner_id IS NOT NULL) AS restaurants_with_owner;
