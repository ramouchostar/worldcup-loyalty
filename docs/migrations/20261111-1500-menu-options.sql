-- ============================================================
-- Options des articles du catalogue (ADR 0099, proposé)
--
-- Ce que le client choisit en plus d'un article : taille, sauce, suppléments, retraits (« sans oignons »).
-- Quatre sortes de groupes (inclus, variante, extra, retrait), un minimum et un maximum de sélections, une
-- quantité maximale par option, un choix coché d'office, et des sous-groupes ouverts par un choix.
--
-- Une BIBLIOTHÈQUE d'options par établissement : la sauce « Samouraï » existe une seule fois, et son prix
-- vit dans chaque groupe qui la propose (0 € dans « Sauce au choix », +1,50 € dans « Sauces en plus »). Les
-- allergènes se renseignent une fois, sur la bibliothèque (NULL = pas renseigné, '{}' = aucun confirmé).
--
-- Les options ne vont PAS dans menu_items : cette table sert aux cadeaux (ADR 0013, reward_eligible) et au
-- rapprochement des tickets par le nom (ADR 0067) ; y mêler « Cornichon » ou « Fries Medium » fausserait les
-- suggestions. Une option peut pointer vers un article (menu_item_id) pour en reprendre la photo et le coût.
--
-- Données euros : RLS activée SANS policy = service role uniquement (ADR 0007). Idempotente. Le code qui lit
-- ces tables reste tolérant à leur absence (lib/menu-options/store.ts). À appliquer à la main dans l'éditeur
-- SQL de Supabase dès la fusion (docs/migrations/README.md).
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_option_library (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT         NOT NULL,
  name          TEXT         NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  -- Clé de reconnaissance (sans accent, sans casse, sans ponctuation) : « Samouraï » = « samourai. »
  name_key      TEXT         NOT NULL CHECK (char_length(name_key) BETWEEN 1 AND 80),
  allergens     TEXT[],
  menu_item_id  UUID         REFERENCES menu_items(id) ON DELETE SET NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, name_key)
);

CREATE TABLE IF NOT EXISTS menu_option_groups (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT         NOT NULL,
  title         TEXT         NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  kind          TEXT         NOT NULL CHECK (kind IN ('inclus', 'variante', 'extra', 'retrait')),
  min_choices   INTEGER      NOT NULL DEFAULT 0 CHECK (min_choices >= 0),
  -- NULL = sans limite (les plateformes écrivent 99 : traduit à l'import)
  max_choices   INTEGER      CHECK (max_choices IS NULL OR max_choices >= 1),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (max_choices IS NULL OR max_choices >= min_choices)
);

CREATE TABLE IF NOT EXISTS menu_option_choices (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id      UUID          NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
  library_id    UUID          NOT NULL REFERENCES menu_option_library(id) ON DELETE RESTRICT,
  price_delta   NUMERIC(6,2)  NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  -- Combien de fois la même option peut être prise (1 = case à cocher)
  max_qty       INTEGER       NOT NULL DEFAULT 1 CHECK (max_qty BETWEEN 1 AND 20),
  is_default    BOOLEAN       NOT NULL DEFAULT false,
  is_available  BOOLEAN       NOT NULL DEFAULT true,
  position      INTEGER       NOT NULL DEFAULT 0,
  UNIQUE (group_id, library_id)
);

-- Les sous-groupes qu'un choix ouvre (le menu dont on choisit les frites, puis la boisson de ces frites).
CREATE TABLE IF NOT EXISTS menu_option_choice_groups (
  choice_id     UUID     NOT NULL REFERENCES menu_option_choices(id) ON DELETE CASCADE,
  group_id      UUID     NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
  position      INTEGER  NOT NULL DEFAULT 0,
  PRIMARY KEY (choice_id, group_id)
);

-- Les groupes d'un article, dans l'ordre : un groupe sert à plusieurs articles.
CREATE TABLE IF NOT EXISTS menu_item_option_groups (
  menu_item_id  UUID     NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id      UUID     NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
  position      INTEGER  NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_item_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_option_library_restaurant ON menu_option_library (restaurant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_menu_option_groups_restaurant ON menu_option_groups (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_option_choices_group ON menu_option_choices (group_id, position);
CREATE INDEX IF NOT EXISTS idx_menu_option_choice_groups_group ON menu_option_choice_groups (group_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_option_groups_group ON menu_item_option_groups (group_id);

ALTER TABLE menu_option_library       ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_option_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_option_choices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_option_choice_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_option_groups   ENABLE ROW LEVEL SECURITY;

-- ─── Défense en profondeur : jamais d'option ni de groupe d'un autre établissement (ADR 0015 §7) ───
-- Le code vérifie déjà l'appartenance (service role) ; ces déclencheurs empêchent qu'une erreur de code
-- rattache l'option ou l'article d'un restaurant au groupe d'un autre.

CREATE OR REPLACE FUNCTION menu_option_choices_same_restaurant() RETURNS TRIGGER AS $$
DECLARE g_rest TEXT; l_rest TEXT;
BEGIN
  SELECT restaurant_id INTO g_rest FROM menu_option_groups  WHERE id = NEW.group_id;
  SELECT restaurant_id INTO l_rest FROM menu_option_library WHERE id = NEW.library_id;
  IF g_rest IS DISTINCT FROM l_rest THEN
    RAISE EXCEPTION 'menu_option_choices : le groupe et l''option ne sont pas du même établissement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_option_choices_same_restaurant ON menu_option_choices;
CREATE TRIGGER trg_menu_option_choices_same_restaurant
  BEFORE INSERT OR UPDATE OF group_id, library_id ON menu_option_choices
  FOR EACH ROW EXECUTE FUNCTION menu_option_choices_same_restaurant();

CREATE OR REPLACE FUNCTION menu_option_choice_groups_same_restaurant() RETURNS TRIGGER AS $$
DECLARE p_rest TEXT; c_rest TEXT;
BEGIN
  SELECT g.restaurant_id INTO p_rest
    FROM menu_option_choices ch JOIN menu_option_groups g ON g.id = ch.group_id WHERE ch.id = NEW.choice_id;
  SELECT restaurant_id INTO c_rest FROM menu_option_groups WHERE id = NEW.group_id;
  IF p_rest IS DISTINCT FROM c_rest THEN
    RAISE EXCEPTION 'menu_option_choice_groups : le choix et le sous-groupe ne sont pas du même établissement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_option_choice_groups_same_restaurant ON menu_option_choice_groups;
CREATE TRIGGER trg_menu_option_choice_groups_same_restaurant
  BEFORE INSERT OR UPDATE OF choice_id, group_id ON menu_option_choice_groups
  FOR EACH ROW EXECUTE FUNCTION menu_option_choice_groups_same_restaurant();

CREATE OR REPLACE FUNCTION menu_item_option_groups_same_restaurant() RETURNS TRIGGER AS $$
DECLARE i_rest TEXT; g_rest TEXT;
BEGIN
  SELECT restaurant_id INTO i_rest FROM menu_items         WHERE id = NEW.menu_item_id;
  SELECT restaurant_id INTO g_rest FROM menu_option_groups WHERE id = NEW.group_id;
  IF i_rest IS DISTINCT FROM g_rest THEN
    RAISE EXCEPTION 'menu_item_option_groups : l''article et le groupe ne sont pas du même établissement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_item_option_groups_same_restaurant ON menu_item_option_groups;
CREATE TRIGGER trg_menu_item_option_groups_same_restaurant
  BEFORE INSERT OR UPDATE OF menu_item_id, group_id ON menu_item_option_groups
  FOR EACH ROW EXECUTE FUNCTION menu_item_option_groups_same_restaurant();

-- updated_at automatique (bibliothèque et groupes)
CREATE OR REPLACE FUNCTION touch_menu_options_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_menu_option_library ON menu_option_library;
CREATE TRIGGER trg_touch_menu_option_library BEFORE UPDATE ON menu_option_library
  FOR EACH ROW EXECUTE FUNCTION touch_menu_options_updated_at();

DROP TRIGGER IF EXISTS trg_touch_menu_option_groups ON menu_option_groups;
CREATE TRIGGER trg_touch_menu_option_groups BEFORE UPDATE ON menu_option_groups
  FOR EACH ROW EXECUTE FUNCTION touch_menu_options_updated_at();
