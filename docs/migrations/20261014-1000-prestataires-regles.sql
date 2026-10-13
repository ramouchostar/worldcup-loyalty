-- ============================================================
-- Réserver un prestataire — « j'accepte les règles » (ADR 0084 §3, PR N)
--
-- Les règles du jeu sont écrites dans le produit (lib/mission-rules.ts, avec une VERSION) et acceptées par case à
-- cocher : le restaurateur à chaque brief qu'il envoie, le prestataire une fois par version, avant son premier devis.
-- Cette table garde la preuve : qui, quand, quelle version, pour quelle mission.
--
--   rules_acceptances   une ligne par acceptation. Restaurateur : (mission, version) unique. Prestataire : (prestataire,
--                       version) unique. La trace de la mission (`mission_events`, « rules_accepted ») existe aussi, avec
--                       ou sans cette table.
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la migration : la case reste exigée et tracée dans
-- `mission_events`, mais le prestataire n'est pas bloqué faute de pouvoir lire son acceptation (le code le dit dans le journal).
-- ============================================================

CREATE TABLE IF NOT EXISTS rules_acceptances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience      TEXT NOT NULL CHECK (audience IN ('restaurant', 'provider')),
  version       TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  -- Restaurateur : le profil, l'établissement et la mission. Prestataire : son identifiant.
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  restaurant_id TEXT,
  mission_id    UUID REFERENCES missions(id) ON DELETE CASCADE,
  provider_id   UUID REFERENCES providers(id) ON DELETE CASCADE,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rules_acceptances_subject CHECK (
    (audience = 'restaurant' AND mission_id IS NOT NULL AND provider_id IS NULL)
    OR (audience = 'provider' AND provider_id IS NOT NULL AND mission_id IS NULL)
  )
);

ALTER TABLE rules_acceptances ENABLE ROW LEVEL SECURITY; -- service-role only

-- Une acceptation par mission et version (restaurateur), par prestataire et version (prestataire) : deux clics n'en font qu'une.
CREATE UNIQUE INDEX IF NOT EXISTS rules_acceptances_restaurant_uniq ON rules_acceptances (mission_id, version) WHERE audience = 'restaurant';
CREATE UNIQUE INDEX IF NOT EXISTS rules_acceptances_provider_uniq ON rules_acceptances (provider_id, version) WHERE audience = 'provider';
