-- ============================================================
-- WORLDCUP LOYALTY — M2 Base de données
-- Exécuter dans Supabase : SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- PARTIE 1 : TABLES
-- ============================================================

CREATE TABLE teams (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  flag_emoji      TEXT NOT NULL,
  country_code    TEXT NOT NULL UNIQUE,
  is_active       BOOLEAN DEFAULT true,
  eliminated_at   TIMESTAMPTZ,
  round_reached   TEXT DEFAULT 'group_stage',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name    TEXT NOT NULL DEFAULT '',
  phone           TEXT,
  email           TEXT,
  team_id         UUID REFERENCES teams(id),
  is_admin        BOOLEAN DEFAULT false,
  joined_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  team_id           UUID REFERENCES teams(id) NOT NULL,
  amount            NUMERIC(8,2) NOT NULL CHECK (amount > 0 AND amount <= 500),
  order_date        DATE NOT NULL,
  order_time        TIME NOT NULL,
  duplicate_key     TEXT NOT NULL UNIQUE,
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected')),
  rejection_reason  TEXT,
  validated_at      TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE community_scores (
  team_id           UUID REFERENCES teams(id) ON DELETE CASCADE PRIMARY KEY,
  member_count      INTEGER DEFAULT 0,
  total_spent       NUMERIC(10,2) DEFAULT 0,
  score             NUMERIC(14,2) GENERATED ALWAYS AS
                    (member_count * total_spent) STORED,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rewards (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level             INTEGER NOT NULL UNIQUE,
  score_threshold   NUMERIC(14,2) NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  gift_details      TEXT,
  cost_euros        NUMERIC(6,2) DEFAULT 0,
  requires_purchase BOOLEAN DEFAULT true,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE micro_rewards (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type              TEXT NOT NULL
    CHECK (type IN ('google_review', 'social_follow', 'social_share', 'referral')),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  gift_item         TEXT NOT NULL,
  gift_cost_euros   NUMERIC(6,2) NOT NULL,
  is_active         BOOLEAN DEFAULT true
);

CREATE TABLE micro_reward_claims (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reward_type       TEXT NOT NULL,
  proof_url         TEXT,
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected')),
  claimed_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reward_type)
);

CREATE TABLE transfers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  from_team_id      UUID REFERENCES teams(id),
  to_team_id        UUID REFERENCES teams(id) NOT NULL,
  transferred_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE restaurant_thresholds (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_label      TEXT NOT NULL,
  target_revenue    NUMERIC(10,2) NOT NULL,
  current_revenue   NUMERIC(10,2) DEFAULT 0,
  is_unlocked       BOOLEAN DEFAULT false,
  unlocked_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- PARTIE 2 : TRIGGERS
-- ============================================================

-- Trigger 1 : mise à jour community_scores.total_spent quand commande validée
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated' AND OLD.status != 'validated' THEN
    UPDATE community_scores
    SET total_spent = total_spent + NEW.amount,
        last_updated = NOW()
    WHERE team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_validated
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_community_score();

-- Trigger 2 : mise à jour member_count quand un membre change d'équipe
CREATE OR REPLACE FUNCTION update_member_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    UPDATE community_scores
    SET member_count = member_count - 1
    WHERE team_id = OLD.team_id;
  END IF;
  IF NEW.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    UPDATE community_scores
    SET member_count = member_count + 1
    WHERE team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_team_change
AFTER UPDATE OF team_id ON profiles
FOR EACH ROW EXECUTE FUNCTION update_member_counts();

-- Trigger 3 : profil créé automatiquement à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger 4 : incrémente member_count quand team_id est défini pour la première fois
CREATE OR REPLACE FUNCTION handle_first_team_join()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.team_id IS NULL AND NEW.team_id IS NOT NULL THEN
    UPDATE community_scores
    SET member_count = member_count + 1
    WHERE team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_first_team_join
AFTER UPDATE OF team_id ON profiles
FOR EACH ROW EXECUTE FUNCTION handle_first_team_join();


-- ============================================================
-- PARTIE 3 : DONNÉES INITIALES
-- ============================================================

-- 32 équipes Coupe du Monde 2026
INSERT INTO teams (name, flag_emoji, country_code) VALUES
  -- Europe (UEFA)
  ('Belgique',      '🇧🇪', 'BE'),
  ('France',        '🇫🇷', 'FR'),
  ('Espagne',       '🇪🇸', 'ES'),
  ('Portugal',      '🇵🇹', 'PT'),
  ('Allemagne',     '🇩🇪', 'DE'),
  ('Angleterre',    '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'ENG'),
  ('Pays-Bas',      '🇳🇱', 'NL'),
  ('Italie',        '🇮🇹', 'IT'),
  ('Croatie',       '🇭🇷', 'HR'),
  ('Danemark',      '🇩🇰', 'DK'),
  ('Suisse',        '🇨🇭', 'CH'),
  ('Pologne',       '🇵🇱', 'PL'),
  ('Serbie',        '🇷🇸', 'RS'),
  ('Autriche',      '🇦🇹', 'AT'),
  ('Turquie',       '🇹🇷', 'TR'),
  ('Écosse',        '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'SCO'),
  -- Afrique (CAF)
  ('Maroc',         '🇲🇦', 'MA'),
  ('Algérie',       '🇩🇿', 'DZ'),
  ('Sénégal',       '🇸🇳', 'SN'),
  ('Cameroun',      '🇨🇲', 'CM'),
  ('Tunisie',       '🇹🇳', 'TN'),
  ('Nigeria',       '🇳🇬', 'NG'),
  -- Amériques (CONMEBOL)
  ('Brésil',        '🇧🇷', 'BR'),
  ('Argentine',     '🇦🇷', 'AR'),
  ('Uruguay',       '🇺🇾', 'UY'),
  ('Colombie',      '🇨🇴', 'CO'),
  -- Amériques (CONCACAF)
  ('États-Unis',    '🇺🇸', 'US'),
  ('Mexique',       '🇲🇽', 'MX'),
  ('Canada',        '🇨🇦', 'CA'),
  -- Asie (AFC)
  ('Japon',         '🇯🇵', 'JP'),
  ('Corée du Sud',  '🇰🇷', 'KR'),
  ('Arabie Saoudite','🇸🇦', 'SA');

-- community_scores initiaux (0/0) pour chaque équipe
INSERT INTO community_scores (team_id, member_count, total_spent)
SELECT id, 0, 0 FROM teams;

-- Paliers de récompenses par défaut
INSERT INTO rewards (level, score_threshold, title, description, gift_details, cost_euros, requires_purchase) VALUES
  (1, 500,  'Frites offertes',       'Votre communauté a atteint le palier 1 !',   'Portion de Frites Medium',                    0.24, true),
  (2, 1500, 'Nuggets offerts',       'Votre communauté a atteint le palier 2 !',   'Portion de Nuggets (4 pcs)',                   0.52, true),
  (3, 3000, 'Menu offert',           'Votre communauté a atteint le palier 3 !',   'Menu au choix : Finest, Grill, 4 Tenders, 8 Nuggets', 1.80, true),
  (4, 6000, 'Repas complet offert',  'Votre communauté a atteint le palier 4 !',   'Burger + Frites + Boisson au choix',          2.30, true);

-- Micro-récompenses par défaut (pas de verrou restaurant)
INSERT INTO micro_rewards (type, title, description, gift_item, gift_cost_euros) VALUES
  ('google_review', 'Avis Google 5 étoiles',         'Laissez un avis 5 étoiles sur Google Maps pour Belchicken', 'Churros (6 pcs)',     0.31),
  ('social_follow', 'Abonnement Instagram/Facebook', 'Suivez nos comptes Instagram et Facebook',                  'Nuggets (4 pcs)',     0.52),
  ('social_share',  'Partage de la campagne',        'Partagez notre campagne World Cup sur vos réseaux',         'Frites Medium',       0.24),
  ('referral',      'Parrainage',                    'Invitez un ami à rejoindre votre communauté',               'Sauce XXL au choix',  0.58);

-- Seuil restaurant initial
INSERT INTO restaurant_thresholds (period_label, target_revenue)
VALUES ('Phase de groupes — Semaine 1', 3000.00);


-- ============================================================
-- PARTIE 4 : ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE micro_rewards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE micro_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_thresholds ENABLE ROW LEVEL SECURITY;

-- teams : lecture publique
CREATE POLICY "teams_public_read" ON teams FOR SELECT USING (true);

-- community_scores : lecture publique
CREATE POLICY "scores_public_read" ON community_scores FOR SELECT USING (true);

-- rewards : lecture publique
CREATE POLICY "rewards_public_read" ON rewards FOR SELECT USING (true);

-- micro_rewards : lecture publique
CREATE POLICY "micro_rewards_public_read" ON micro_rewards FOR SELECT USING (true);

-- restaurant_thresholds : lecture publique
CREATE POLICY "thresholds_public_read" ON restaurant_thresholds FOR SELECT USING (true);

-- profiles : chaque membre voit uniquement son propre profil
CREATE POLICY "profiles_own_read"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_own_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- orders : membre voit uniquement ses propres commandes
CREATE POLICY "orders_own_read"   ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_own_insert" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- micro_reward_claims : membre voit uniquement ses propres réclamations
CREATE POLICY "claims_own_read"   ON micro_reward_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "claims_own_insert" ON micro_reward_claims FOR INSERT WITH CHECK (auth.uid() = user_id);

-- transfers : membre voit uniquement ses propres transferts
CREATE POLICY "transfers_own_read"   ON transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transfers_own_insert" ON transfers FOR INSERT WITH CHECK (auth.uid() = user_id);
