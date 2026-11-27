-- ============================================================
-- Les articles publiés automatiquement (ADR 0112)
--
-- À APPLIQUER APRÈS 20261126-1300-restaurant-posts.sql (elle crée `restaurant_posts` et sa trace).
--
-- Quoi :
--   restaurant_post_auto_settings  par établissement : publication automatique allumée ou non, types d'occasion
--                                  choisis, qui a accepté, quand, quelle version du texte ; qui a arrêté, quand.
--                                  Aucune ligne = éteinte.
--   restaurant_post_occasions      une occasion d'écrire (événement, match, météo, promo) : les faits utilisés,
--                                  le jour de publication, l'état (prévue, prévenu, publiée, refusée, écartée) et
--                                  sa raison, le message qui prévient, la fin de l'article. C'est la trace : rien
--                                  n'y est effacé quand un article est écarté ou refusé.
--   restaurant_posts.expires_at    fin automatique : la lecture publique cache un article échu.
--   restaurant_posts.source_credit la mention de source écrite sous un article automatique (« agenda.brussels »).
--   restaurant_posts.origin        accepte 'auto'.
--   restaurant_post_events.kind    accepte les gestes de la publication automatique.
--
-- Au plus un article automatique par établissement et par jour : index unique partiel.
--
-- Sécurité : RLS activée SANS policy = service role uniquement. Aucune donnée sur un lecteur ni sur un client.
--
-- Sans cette migration : la publication automatique est « pas encore activée » (console et tâche planifiée), le
-- blog écrit à la main marche exactement comme avant.
--
-- Idempotente, non cassante. À APPLIQUER À LA MAIN dans l'éditeur SQL Supabase.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.restaurant_posts') IS NULL OR to_regclass('public.restaurant_post_events') IS NULL THEN
    RAISE EXCEPTION 'Applique d''abord docs/migrations/20261126-1300-restaurant-posts.sql';
  END IF;
END $$;

ALTER TABLE restaurant_posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE restaurant_posts ADD COLUMN IF NOT EXISTS source_credit TEXT CHECK (source_credit IS NULL OR char_length(source_credit) <= 200);

-- Les contraintes CHECK écrites avec la colonne portent le nom `<table>_<colonne>_check` : on les repose élargies.
ALTER TABLE restaurant_posts DROP CONSTRAINT IF EXISTS restaurant_posts_origin_check;
ALTER TABLE restaurant_posts ADD CONSTRAINT restaurant_posts_origin_check CHECK (origin IN ('gerant', 'nina', 'auto'));

ALTER TABLE restaurant_post_events DROP CONSTRAINT IF EXISTS restaurant_post_events_kind_check;
ALTER TABLE restaurant_post_events ADD CONSTRAINT restaurant_post_events_kind_check CHECK (kind IN (
  'publie', 'retire', 'masque', 'demasque', 'supprime', 'signale', 'refuse',
  'auto_active', 'auto_arret', 'auto_prevenu', 'auto_publie', 'auto_refus', 'auto_ecarte'
));

CREATE INDEX IF NOT EXISTS restaurant_posts_expiry_idx ON restaurant_posts (expires_at) WHERE status = 'en_ligne' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS restaurant_post_auto_settings (
  restaurant_id  TEXT         PRIMARY KEY REFERENCES restaurants (id) ON DELETE CASCADE,
  enabled        BOOLEAN      NOT NULL DEFAULT FALSE,
  kinds          TEXT[]       NOT NULL DEFAULT '{}' CHECK (kinds <@ ARRAY['promo', 'evenement', 'match', 'meteo']::TEXT[]),
  -- Qui répond de ce qui est publié. NULL après la suppression de son compte : la publication est alors arrêtée.
  accepted_by    UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_at    TIMESTAMPTZ,
  -- La version de la phrase d'acceptation montrée à ce moment-là (lib/restaurant-posts/auto/types.ts).
  terms_version  TEXT         CHECK (terms_version IS NULL OR char_length(terms_version) <= 40),
  disabled_by    UUID,
  disabled_at    TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Allumée seulement avec une acceptation datée.
  CONSTRAINT restaurant_post_auto_accepted
    CHECK (NOT enabled OR (accepted_at IS NOT NULL AND terms_version IS NOT NULL))
);

ALTER TABLE restaurant_post_auto_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE restaurant_post_auto_settings IS
  'Publication automatique des articles par établissement (ADR 0112). Éteinte sans ligne ; service role uniquement.';

CREATE TABLE IF NOT EXISTS restaurant_post_occasions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   TEXT         NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  kind            TEXT         NOT NULL CHECK (kind IN ('promo', 'evenement', 'match', 'meteo')),
  -- Ce qui désigne l'occasion chez sa source : une occasion n'est proposée qu'une fois à un établissement.
  source_key      TEXT         NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 200),
  -- Le nom court montré dans la console (« Brocante de la place… »).
  label           TEXT         NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  title           TEXT         NOT NULL CHECK (char_length(title) <= 80),
  -- Les seuls faits qui servent à composer le texte.
  facts           JSONB        NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  occasion_day    DATE         NOT NULL,
  publish_day     DATE         NOT NULL,
  publish_at      TIMESTAMPTZ  NOT NULL,
  expires_at      TIMESTAMPTZ  NOT NULL,
  variant         INTEGER      NOT NULL DEFAULT 0 CHECK (variant >= 0),
  status          TEXT         NOT NULL DEFAULT 'prevu' CHECK (status IN ('prevu', 'prevenu', 'publie', 'refuse', 'ecarte')),
  reason          TEXT         CHECK (reason IS NULL OR char_length(reason) <= 60),
  reason_detail   TEXT         CHECK (reason_detail IS NULL OR char_length(reason_detail) <= 300),
  post_id         UUID         REFERENCES restaurant_posts (id) ON DELETE SET NULL,
  -- La ligne de `message_sends` du message qui prévient : sa preuve d'arrivée décide de la publication.
  send_id         UUID,
  notified_at     TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  -- 'auto' : publié sans réaction ; 'maintenant' : quelqu'un a appuyé sur publier.
  published_mode  TEXT         CHECK (published_mode IS NULL OR published_mode IN ('auto', 'maintenant')),
  modified_at     TIMESTAMPTZ,
  refused_via     TEXT         CHECK (refused_via IS NULL OR refused_via IN ('lien', 'console')),
  -- Qui a refusé ou publié depuis la console. NULL par le lien de l'e-mail.
  decided_by      UUID,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_post_occasions_source_idx ON restaurant_post_occasions (restaurant_id, source_key);
-- Un article automatique par jour au plus.
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_post_occasions_day_idx
  ON restaurant_post_occasions (restaurant_id, publish_day) WHERE status IN ('prevu', 'prevenu', 'publie');
CREATE INDEX IF NOT EXISTS restaurant_post_occasions_due_idx ON restaurant_post_occasions (publish_day) WHERE status IN ('prevu', 'prevenu');
CREATE INDEX IF NOT EXISTS restaurant_post_occasions_post_idx ON restaurant_post_occasions (post_id) WHERE post_id IS NOT NULL;

ALTER TABLE restaurant_post_occasions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE restaurant_post_occasions IS
  'Occasions d''article et leur issue (ADR 0112) : prévenus, publiés sans réaction, refusés, écartés et pourquoi. Service role uniquement.';
