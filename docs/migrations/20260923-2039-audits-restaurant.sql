-- ADR 0068 — Audit d'un restaurant depuis la plateforme : chaque audit est gardé.
--
-- Quoi :
--   restaurant_audits          un audit (l'établissement Google audité, son état, ses notes,
--                              ses signaux, les réponses du gérant, ses recommandations, son coût)
--   restaurant_audit_sections  un volet d'un audit (fiche, avis, concurrents, réseaux) : données
--                              brutes, résultat, source, coût, motif d'échec
--   restaurant_audit_versions  les versions finales figées (ADR 0068 §6), une ligne par version
--   restaurant_audit_shares    les liens publics d'une version (jeton haché, expiration, révocation,
--                              nombre d'ouvertures)
--
-- Pourquoi : garder tous les audits (historique par établissement, comparaison dans trois mois),
-- mesurer le coût réel par source, et pouvoir rouvrir une version déjà envoyée au gérant.
--
-- Sécurité : RLS activée SANS policy = service-role uniquement. Seule la console plateforme
-- (super-admin, contrôle côté serveur) et la page publique à jeton (lecture serveur) y accèdent.
-- Les données brutes d'avis sont stockées SANS nom ni profil d'auteur (ADR 0025).
--
-- Si la migration n'est pas appliquée : l'onglet Audit affiche « tables absentes » et les audits
-- ne sont pas enregistrés ; rien d'autre dans l'app n'en dépend (fail-open).

CREATE TABLE IF NOT EXISTS restaurant_audits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id        text,                       -- identifiant Google Places (ChIJ…)
  cid             text,                       -- identifiant Google Maps (CID), utilisé par DataForSEO
  name            text NOT NULL,
  address         text,
  postal_code     text,
  status          text NOT NULL DEFAULT 'en_cours'
                  CHECK (status IN ('en_cours', 'mesure', 'revise', 'final', 'echec')),
  scores          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { fiche, avis, concurrents, reseaux, global }
  signals         jsonb,                                -- AuditSignals (lib/audit/signals.ts)
  answers         jsonb,                                -- OwnerAnswers (volet E)
  recommendations jsonb,                                -- sortie de recommend() / reviseWithAnswers()
  cost_usd        numeric(10, 4) NOT NULL DEFAULT 0,
  calls           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { dataforseo: n, places: n, lecteur: n, claude: n }
  created_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_audits_place_idx ON restaurant_audits (place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_audits_created_idx ON restaurant_audits (created_at DESC);

CREATE TABLE IF NOT EXISTS restaurant_audit_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id    uuid NOT NULL REFERENCES restaurant_audits (id) ON DELETE CASCADE,
  section     text NOT NULL CHECK (section IN ('fiche', 'avis', 'concurrents', 'reseaux')),
  status      text NOT NULL DEFAULT 'en_cours'
              CHECK (status IN ('en_cours', 'ok', 'echec', 'non_branche')),
  source      text,                            -- 'dataforseo', 'lecteur', 'places', 'instagram_graph', 'tiktok'
  raw         jsonb,
  result      jsonb,
  error       text,
  cost_usd    numeric(10, 4) NOT NULL DEFAULT 0,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (audit_id, section)
);

CREATE TABLE IF NOT EXISTS restaurant_audit_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id   uuid NOT NULL REFERENCES restaurant_audits (id) ON DELETE CASCADE,
  version    integer NOT NULL,
  snapshot   jsonb NOT NULL,
  pdf_path   text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, version)
);

CREATE TABLE IF NOT EXISTS restaurant_audit_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id     uuid NOT NULL REFERENCES restaurant_audit_versions (id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,         -- sha256 du jeton ; le jeton clair n'est jamais stocké
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '90 days',
  revoked_at     timestamptz,
  views          integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE restaurant_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_audit_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_audit_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_audit_shares ENABLE ROW LEVEL SECURITY;
