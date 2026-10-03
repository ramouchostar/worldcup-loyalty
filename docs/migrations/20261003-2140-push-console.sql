-- ============================================================
-- Push de la console restaurateur (ADR 0077 §2, PR B)
--
-- Quoi :
--   console_push_subscriptions  un appareil abonné aux alertes de la console d'UN
--                               établissement, pour UNE personne (gérant, manager,
--                               propriétaire). Séparée de push_subscriptions (membres) :
--                               l'unicité (user_id, endpoint) de celle-ci empêche un
--                               même téléphone d'être abonné côté client et côté console.
--
-- Pourquoi : le bilan mensuel de l'équipe en salle et la relance « crée les QR » sont
-- des sujets importants (porteur) ; le push accompagne l'e-mail de la même étape.
--
-- Sécurité : RLS activée SANS policy = service-role uniquement. L'abonnement passe par
-- /api/admin/push, qui vérifie l'accès console (requireAdmin) avant d'écrire.
--
-- Idempotent. Sans la migration : la carte « Activer » échoue proprement (message),
-- aucun push console ne part, les e-mails partent comme avant (fail-open).
-- ============================================================

CREATE TABLE IF NOT EXISTS console_push_subscriptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restaurant_id  text        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  endpoint       text        NOT NULL,
  p256dh         text        NOT NULL,
  auth           text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, restaurant_id, endpoint)
);

ALTER TABLE console_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_console_push_user_restaurant
  ON console_push_subscriptions (user_id, restaurant_id);
