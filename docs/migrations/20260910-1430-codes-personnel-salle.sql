-- ============================================================
-- 2026-09-10 14:30 — Acquisition par le personnel en salle (ADR 0053)
--
-- POURQUOI
-- Première source d'acquisition constatée à Kraainem : le personnel en salle.
-- Chaque prénom reçoit un code et un QR personnel (badge imprimé ou affiché
-- depuis son téléphone) ; le gérant voit dans sa console qui apporte des
-- clients. Le personnel n'a PAS de compte (un seul siège à Kraainem, ADR
-- 0041) : les codes sont NOMMÉS (prénom seul, jamais le poste), créés et
-- désactivés par le gérant. Mécanique volontairement SÉPARÉE du parrainage
-- membre (referral_links exige un compte, unicité filleul à vie, jetons).
--
-- QUOI
--   staff_codes        : un code par prénom, activable/désactivable.
--   staff_acquisitions : quel code a amené quelle ADHÉSION (une seule
--                        attribution par membre et par resto ; le parrainage
--                        membre prime quand les deux cookies sont présents).
--   staff_landings     : arrivées par code et par jour belge — compteur
--                        agrégé sans donnée personnelle (patron ADR 0037).
--
-- RLS activée SANS policy = service-role uniquement (mécanique d'attribution
-- que ni le membre ni le personnel ne lisent en direct ; le gérant passe par
-- la console). Sans cette migration : rien ne casse — la section console
-- affiche « applique la migration », le cookie et les compteurs sont sautés
-- (fail-open, comme toujours).
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_codes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code          TEXT        NOT NULL UNIQUE,
  -- Prénom seul (« Sofia ») — jamais le poste : caissier ou serveur, aucune
  -- distinction (décision du porteur, 2026-09-10).
  label         TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_codes_restaurant ON staff_codes (restaurant_id);
ALTER TABLE staff_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_acquisitions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code_id       UUID        NOT NULL REFERENCES staff_codes(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Une seule attribution par membre et par établissement — la PREMIÈRE
  -- adhésion compte, jamais réattribuée.
  UNIQUE (user_id, restaurant_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_acquisitions_code ON staff_acquisitions (code_id);
ALTER TABLE staff_acquisitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_landings (
  restaurant_id TEXT     NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day           DATE     NOT NULL,
  code_id       UUID     NOT NULL REFERENCES staff_codes(id) ON DELETE CASCADE,
  count         INTEGER  NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, day, code_id)
);
ALTER TABLE staff_landings ENABLE ROW LEVEL SECURITY;

-- Incrément atomique (patron record_landing, m60).
CREATE OR REPLACE FUNCTION record_staff_landing(
  p_restaurant_id TEXT,
  p_day DATE,
  p_code_id UUID
) RETURNS VOID AS $$
BEGIN
  INSERT INTO staff_landings (restaurant_id, day, code_id, count)
  VALUES (p_restaurant_id, p_day, p_code_id, 1)
  ON CONFLICT (restaurant_id, day, code_id)
  DO UPDATE SET count = staff_landings.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION record_staff_landing(TEXT, DATE, UUID) FROM anon, authenticated;
