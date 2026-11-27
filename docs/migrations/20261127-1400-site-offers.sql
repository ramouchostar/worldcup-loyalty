-- ============================================================
-- Les offres de la page de commande (ADR 0110) et le lien d'un article automatique avec son offre (ADR 0112)
--
-- Le gérant écrit une offre et la publie ; la page la montre sans changer aucun prix, la remise se fait au comptoir.
--
-- À APPLIQUER APRÈS 20261113-2330-site-orders.sql (elle crée `site_orders`), 20261126-1300-restaurant-posts.sql et
-- 20261126-2330-restaurant-posts-auto.sql.
--
--   site_offers        une offre : titre, conditions, plat facultatif, premier et dernier jour, jours de la semaine,
--                      état (brouillon, publiee, arretee), qui l'a écrite, publiée, arrêtée et pourquoi, offre recopiée.
--   site_offer_events  affichée, ouverte, appliquée, pas appliquée ; commande facultative. Aucune donnée personnelle.
--   site_orders.offer_ids      les offres que le serveur jugeait valables à l'enregistrement de la commande.
--   restaurant_posts.offer_id  l'offre qu'annonce un article automatique : l'article n'est lu que tant qu'elle vaut.
--
-- Sécurité : RLS activée SANS policy = service role uniquement, seul le serveur décide de ce qui sort.
--
-- Sans cette migration : la page de commande reste comme avant (aucune offre), la console dit « pas encore activé », les
-- commandes partent sans offre, et « Mes promos » ne se coche pas.
--
-- Idempotente, non cassante. À APPLIQUER À LA MAIN dans l'éditeur SQL Supabase.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.site_orders') IS NULL THEN
    RAISE EXCEPTION 'Applique d''abord docs/migrations/20261113-2330-site-orders.sql';
  END IF;
  IF to_regclass('public.restaurant_posts') IS NULL OR to_regclass('public.restaurant_post_occasions') IS NULL THEN
    RAISE EXCEPTION 'Applique d''abord docs/migrations/20261126-1300-restaurant-posts.sql puis 20261126-2330-restaurant-posts-auto.sql';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS site_offers (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  TEXT         NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  title          TEXT         NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  conditions     TEXT         CHECK (conditions IS NULL OR char_length(conditions) BETWEEN 1 AND 280),
  -- Le plat concerné, du même établissement (vérifié par le serveur). Pas de clé étrangère : un plat supprimé de la carte
  -- masque l'offre, il ne l'efface pas.
  menu_item_id   UUID,
  first_day      DATE         NOT NULL,
  last_day       DATE         NOT NULL,
  -- Jours où elle vaut, 1 = lundi … 7 = dimanche. NULL = tous les jours.
  weekdays       SMALLINT[]   CHECK (weekdays IS NULL OR (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::SMALLINT[])),
  state          TEXT         NOT NULL DEFAULT 'brouillon' CHECK (state IN ('brouillon', 'publiee', 'arretee')),
  created_by     UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_by   UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  published_at   TIMESTAMPTZ,
  stopped_by     UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  stopped_at     TIMESTAMPTZ,
  stop_reason    TEXT         CHECK (stop_reason IS NULL OR stop_reason IN ('stock', 'equipe', 'erreur', 'autre')),
  copied_from    UUID         REFERENCES site_offers (id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT site_offers_days CHECK (last_day >= first_day AND last_day - first_day <= 30),
  CONSTRAINT site_offers_published CHECK (state = 'brouillon' OR published_at IS NOT NULL),
  CONSTRAINT site_offers_stopped CHECK (state <> 'arretee' OR (stopped_at IS NOT NULL AND stop_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS site_offers_restaurant_idx ON site_offers (restaurant_id, state, last_day);

ALTER TABLE site_offers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE site_offers IS
  'Offres de la page de commande (ADR 0110), écrites par le gérant ou le manager. Aucun prix ne change. Service role uniquement.';

CREATE TABLE IF NOT EXISTS site_offer_events (
  id             BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id       UUID         NOT NULL REFERENCES site_offers (id) ON DELETE CASCADE,
  restaurant_id  TEXT         NOT NULL,
  kind           TEXT         NOT NULL CHECK (kind IN ('affichee', 'ouverte', 'appliquee', 'pas_appliquee')),
  order_id       UUID,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Une réponse du comptoir porte toujours sa commande ; un affichage ou une ouverture n'en a jamais.
  CONSTRAINT site_offer_events_order CHECK ((order_id IS NOT NULL) = (kind IN ('appliquee', 'pas_appliquee')))
);

-- Une seule réponse par commande et par offre : le comptoir peut la corriger. Les affichages (sans commande) ne sont pas
-- concernés, deux valeurs vides ne se gênent pas.
CREATE UNIQUE INDEX IF NOT EXISTS site_offer_events_answer_idx ON site_offer_events (offer_id, order_id);
CREATE INDEX IF NOT EXISTS site_offer_events_offer_idx ON site_offer_events (offer_id, kind);
CREATE INDEX IF NOT EXISTS site_offer_events_restaurant_idx ON site_offer_events (restaurant_id, created_at DESC);

ALTER TABLE site_offer_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE site_offer_events IS
  'Trace des offres (ADR 0110) : affichée, ouverte, appliquée ou non au comptoir. Aucune donnée personnelle. Service role uniquement.';

ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS offer_ids UUID[];
CREATE INDEX IF NOT EXISTS site_orders_offers_idx ON site_orders USING GIN (offer_ids) WHERE offer_ids IS NOT NULL;

-- Pas de clé étrangère : une offre introuvable cache l'article, elle ne le détache pas.
ALTER TABLE restaurant_posts ADD COLUMN IF NOT EXISTS offer_id UUID;
CREATE INDEX IF NOT EXISTS restaurant_posts_offer_idx ON restaurant_posts (offer_id) WHERE offer_id IS NOT NULL;
