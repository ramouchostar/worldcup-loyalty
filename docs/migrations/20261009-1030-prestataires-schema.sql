-- ============================================================
-- Réserver un prestataire — le schéma (ADR 0084, PR B)
--
-- Un restaurateur réserve un prestataire (vidéaste, photographe, graphiste,
-- imprimeur) ; le prestataire chiffre ; l'argent est retenu jusqu'à la
-- validation. Cette migration ne pose QUE les tables : la logique (prix,
-- annulation, états, brief) vit dans lib/mission-*.ts, testée à part.
--
-- Tout l'argent est en CENTIMES entiers (jamais de flottants). Les euros ne
-- remontent jamais vers un membre (ADR 0007) : aucune de ces tables n'est lue
-- par une surface membre.
--
-- RLS activée SANS policy = service-role only (comme message_sends, m51). Les
-- API de l'app font les contrôles d'accès (restaurateur de l'établissement,
-- prestataire de la mission, super-admin).
--
-- Idempotente. Aucune donnée existante touchée. Sans la migration, rien ne
-- casse : aucun écran existant ne lit ces tables (le module arrive en PR C+).
-- ============================================================

-- ── Conditions de la place de marché (une seule ligne) ─────────
CREATE TABLE IF NOT EXISTS marketplace_settings (
  id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  commission_bps      INTEGER NOT NULL DEFAULT 1250 CHECK (commission_bps BETWEEN 0 AND 10000),
  pro_commission_bps  INTEGER NOT NULL DEFAULT 500  CHECK (pro_commission_bps BETWEEN 0 AND 10000),
  -- Jamais moins de 20 % d'acompte, même si on tente de l'écrire.
  deposit_bps         INTEGER NOT NULL DEFAULT 2000 CHECK (deposit_bps BETWEEN 2000 AND 10000),
  max_retouch_rounds  SMALLINT NOT NULL DEFAULT 2   CHECK (max_retouch_rounds BETWEEN 0 AND 5),
  auto_validate_days  SMALLINT NOT NULL DEFAULT 7   CHECK (auto_validate_days BETWEEN 3 AND 30),
  shoot_min_days      SMALLINT NOT NULL DEFAULT 7   CHECK (shoot_min_days BETWEEN 1 AND 60),
  updated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pro_commission_bps <= commission_bps)
);

INSERT INTO marketplace_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
ALTER TABLE marketplace_settings ENABLE ROW LEVEL SECURITY; -- service-role only

-- ── Prestataires ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Vide tant que l'invitation n'est pas acceptée.
  user_id            UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  email              TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  metiers            TEXT[] NOT NULL DEFAULT '{}'
                     CHECK (metiers <@ ARRAY['video', 'photo', 'design', 'impression']::TEXT[]),
  status             TEXT NOT NULL DEFAULT 'invited'
                     CHECK (status IN ('invited', 'active', 'suspended', 'excluded')),
  -- Sanctions graduées (ADR 0084 §4) : avertissements, puis visibilité réduite, puis exclusion.
  warnings           SMALLINT NOT NULL DEFAULT 0 CHECK (warnings >= 0),
  visibility_reduced BOOLEAN NOT NULL DEFAULT FALSE,
  -- Compte Stripe Connect (PR G) ; vide jusque-là.
  stripe_account_id  TEXT,
  bio                TEXT,
  invited_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS providers_email_unique ON providers (LOWER(email));
CREATE INDEX IF NOT EXISTS providers_status_idx ON providers (status);
ALTER TABLE providers ENABLE ROW LEVEL SECURITY; -- service-role only

-- ── Modèles de brief (les questionnaires sont des données) ─────
CREATE TABLE IF NOT EXISTS brief_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metier      TEXT NOT NULL CHECK (metier IN ('video', 'photo', 'design', 'impression')),
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- Liste de questions { key, label, kind, required, options?, minLength?, hint? } (voir lib/mission-brief.ts).
  questions   JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Budget plancher (centimes) ; NULL = pas de plancher configuré.
  budget_floor_cents INTEGER CHECK (budget_floor_cents IS NULL OR budget_floor_cents >= 0),
  -- Budget minimal par format pour juger l'ambition réaliste : { "Film": 300000 }.
  ambition_budget_cents JSONB NOT NULL DEFAULT '{}'::JSONB,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (metier, version)
);

-- Un seul modèle actif par métier : le modèle précédent reste, désactivé, pour les missions déjà envoyées.
CREATE UNIQUE INDEX IF NOT EXISTS brief_templates_one_active
  ON brief_templates (metier) WHERE active;
ALTER TABLE brief_templates ENABLE ROW LEVEL SECURITY; -- service-role only

-- ── Missions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- Rempli à l'envoi du brief (un prestataire désigné, pas d'appel d'offres au départ).
  provider_id      UUID REFERENCES providers(id) ON DELETE SET NULL,
  metier           TEXT NOT NULL CHECK (metier IN ('video', 'photo', 'design', 'impression')),
  status           TEXT NOT NULL DEFAULT 'brief'
                   CHECK (status IN ('brief', 'envoye', 'devis', 'accepte', 'date_bloquee', 'production',
                                     'livre', 'retouche', 'valide', 'verse', 'annule', 'litige', 'suspendu')),
  template_id      UUID REFERENCES brief_templates(id) ON DELETE SET NULL,
  -- Réponses au questionnaire ; figées à l'envoi (brief_locked_at).
  brief            JSONB NOT NULL DEFAULT '{}'::JSONB,
  brief_locked_at  TIMESTAMPTZ,
  requested_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Tournage / livraison : la date LIE le restaurateur.
  shoot_date       DATE,
  shoot_start      TEXT CHECK (shoot_start IS NULL OR shoot_start ~ '^[0-2][0-9]:[0-5][0-9]$'),
  team_notified_at TIMESTAMPTZ,
  j2_confirmed_provider_at   TIMESTAMPTZ,
  j2_confirmed_restaurant_at TIMESTAMPTZ,

  -- Argent (centimes), figé au paiement avec le plan du restaurateur à cet instant.
  accepted_quote_id UUID,
  quote_cents       INTEGER CHECK (quote_cents IS NULL OR quote_cents >= 0),
  plan_at_payment   TEXT CHECK (plan_at_payment IS NULL OR plan_at_payment IN ('gratuit', 'croissance', 'pro')),
  paid_cents        INTEGER CHECK (paid_cents IS NULL OR paid_cents >= 0),
  provider_cents    INTEGER CHECK (provider_cents IS NULL OR provider_cents >= 0),
  platform_cents    INTEGER CHECK (platform_cents IS NULL OR platform_cents >= 0),
  deposit_cents     INTEGER CHECK (deposit_cents IS NULL OR deposit_cents >= 0),

  -- Retours : deux tours inclus.
  retouch_rounds_used SMALLINT NOT NULL DEFAULT 0 CHECK (retouch_rounds_used >= 0),
  delivered_at        TIMESTAMPTZ,
  reminders_sent      SMALLINT NOT NULL DEFAULT 0 CHECK (reminders_sent BETWEEN 0 AND 2),
  validated_at        TIMESTAMPTZ,

  cancelled_at      TIMESTAMPTZ,
  cancelled_by      TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('restaurant', 'provider', 'platform', 'system')),
  cancellation_note TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS missions_restaurant_status_idx ON missions (restaurant_id, status);
CREATE INDEX IF NOT EXISTS missions_provider_status_idx   ON missions (provider_id, status);
CREATE INDEX IF NOT EXISTS missions_shoot_date_idx        ON missions (shoot_date) WHERE shoot_date IS NOT NULL;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY; -- service-role only

-- ── Devis ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mission_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  -- Prix du devis (P) : le prestataire en reçoit 87,5 %. Ferme pour ce brief.
  price_cents    INTEGER NOT NULL CHECK (price_cents > 0),
  hours          NUMERIC(5, 1) CHECK (hours IS NULL OR hours > 0),
  delivery_days  SMALLINT CHECK (delivery_days IS NULL OR delivery_days > 0),
  included       TEXT[] NOT NULL DEFAULT '{}',
  excluded       TEXT[] NOT NULL DEFAULT '{}',
  hypotheses     TEXT,
  proposed_date  DATE,
  status         TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'declined', 'superseded')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mission_quotes_mission_idx ON mission_quotes (mission_id, created_at);
-- Un seul devis accepté par mission.
CREATE UNIQUE INDEX IF NOT EXISTS mission_quotes_one_accepted ON mission_quotes (mission_id) WHERE status = 'accepted';
ALTER TABLE mission_quotes ENABLE ROW LEVEL SECURITY; -- service-role only

-- ── La trace : chaque passage, chaque refus, chaque relance ────
-- kind : 'status' (passage d'état), 'brief_refused' (champ manquant, avec le code dans meta),
--        'quote_declined', 'late_cancel', 'reminder_sent', 'j2_unconfirmed', 'payment_failed',
--        'retouch_refused' (remarque vague), 'warning', 'dispute_opened'…
-- Aucun échec silencieux (ADR 0065) : tout refus a sa ligne.
CREATE TABLE IF NOT EXISTS mission_events (
  id            BIGSERIAL PRIMARY KEY,
  mission_id    UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_kind    TEXT NOT NULL CHECK (actor_kind IN ('restaurant', 'provider', 'platform', 'system')),
  actor_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason        TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mission_events_mission_idx ON mission_events (mission_id, created_at);
CREATE INDEX IF NOT EXISTS mission_events_kind_idx    ON mission_events (kind, created_at);
ALTER TABLE mission_events ENABLE ROW LEVEL SECURITY; -- service-role only
