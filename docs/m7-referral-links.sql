-- ============================================================
-- M7 — Liens de parrainage WhatsApp (Issue #15)
-- Remplace referral_submissions (validation manuelle admin)
-- par un système automatique basé sur des liens uniques
-- ============================================================


-- ============================================================
-- TABLE referral_links
-- Un code unique par membre par établissement
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_links (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id TEXT        NOT NULL,
  code          TEXT        NOT NULL,
  clicks        INTEGER     DEFAULT 0,
  conversions   INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, restaurant_id),
  UNIQUE (code)
);

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_links_own_read" ON referral_links
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_referral_links_code
  ON referral_links (code);


-- ============================================================
-- TABLE referrals
-- Une ligne par ami inscrit via le lien — referee_id UNIQUE
-- garantit qu'un ami ne peut être attribué qu'à un seul parrain
-- ============================================================

CREATE TABLE IF NOT EXISTS referrals (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id   UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  referee_id    UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_id TEXT        NOT NULL,
  referred_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (referee_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_own_read" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_id, restaurant_id);


-- ============================================================
-- TRIGGER : incrémente conversions quand une référence est insérée
-- ============================================================

CREATE OR REPLACE FUNCTION handle_referral_conversion()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE referral_links
  SET conversions = conversions + 1
  WHERE user_id       = NEW.referrer_id
    AND restaurant_id = NEW.restaurant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_referral_conversion ON referrals;
CREATE TRIGGER on_referral_conversion
  AFTER INSERT ON referrals
  FOR EACH ROW EXECUTE FUNCTION handle_referral_conversion();
