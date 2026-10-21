-- ============================================================
-- Réserver un prestataire — les avis après une mission validée (ADR 0084 §5 decies, PR W)
--
-- Deux sens, un avis chacun par mission, définitif :
--   restaurant_to_provider  note 1 à 5 + commentaire facultatif ; la moyenne (dès 3 avis) et les derniers commentaires, SANS nom
--                           de restaurant, s'affichent sur le profil du prestataire lu par les restaurateurs.
--   provider_to_restaurant  note PRIVÉE, lue par la plateforme seule (dossier de litige, page des avis).
-- La plateforme peut masquer un avis (`hidden_at`) : il ne compte plus dans la moyenne ni dans les commentaires affichés.
--
--   mission_reviews   une ligne par avis ; UNIQUE (mission, sens) : deux clics ne font pas deux avis.
--
-- RLS activée SANS policy = service-role only. Idempotente. Sans la migration : les cartes d'avis répondent « pas encore
-- disponible », le profil n'affiche aucune moyenne ; le reste du module ne change pas.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('restaurant_to_provider', 'provider_to_restaurant')),
  rating      INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 600),
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  hidden_at   TIMESTAMPTZ,
  hidden_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, direction)
);

ALTER TABLE mission_reviews ENABLE ROW LEVEL SECURITY; -- service-role only

-- La moyenne et les commentaires d'un prestataire (avis visibles seulement).
CREATE INDEX IF NOT EXISTS mission_reviews_provider_idx ON mission_reviews (provider_id, direction, created_at DESC) WHERE hidden_at IS NULL;
