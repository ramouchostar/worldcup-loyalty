-- ============================================================
-- Pub : demandes, paiements, crédit, campagnes, statistiques, journaux
-- (ADR 0085 + ADR 0086, PR 2 du plan « Boosteats Pub »)
--
--   restaurant_billing      coordonnées de facturation d'un établissement (raison sociale, TVA, adresse)
--   ad_requests             une demande de pub du restaurateur et son état (ADR 0086 §1)
--   ad_payment_notices      chaque paiement attendu puis reçu : montant, communication structurée,
--                           qui l'a confirmé, numéro de facture Accountable (ADR 0086 §3, §5)
--   ad_credit_transactions  le registre du crédit pub (budget seul, frais exclus) ; jamais de solde
--   ad_campaigns            le lien identifiant chez la régie → établissement (ADR 0085 §3) ;
--                           restaurant_id NULL = campagne non rattachée
--   ad_daily_stats          dépense et résultats par campagne et par jour (réécrits sur 7 jours)
--   ad_sync_runs            une ligne par passage de la tâche de lecture (la trace)
--   ad_api_calls            chaque écriture chez une régie : quoi, réponse — aucun échec silencieux
--
-- Montants en centimes entiers. RLS activée SANS policy = service-role only : tout passe par le
-- serveur (le restaurateur lit les siennes via une route qui vérifie son siège). Idempotente.
-- Sans la migration : la page Pub et /platform/pub disent « pas encore disponible », rien d'autre
-- ne change. Aucun impact membre (ADR 0007).
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_billing (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  legal_name    TEXT NOT NULL CHECK (char_length(legal_name) BETWEEN 2 AND 160),
  vat_number    TEXT CHECK (vat_number IS NULL OR vat_number ~ '^[A-Z]{2}[0-9A-Z]{8,12}$'),
  address       TEXT NOT NULL CHECK (char_length(address) BETWEEN 5 AND 300),
  updated_by    UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      TEXT NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  -- Numéro de la demande chez cet établissement (1, 2, …) : entre dans la communication structurée.
  seq                INT  NOT NULL CHECK (seq BETWEEN 1 AND 9999999),
  regie              TEXT NOT NULL DEFAULT 'META' CHECK (regie IN ('META', 'TIKTOK')),
  objective          TEXT NOT NULL CHECK (objective ~ '^[A-Z]{2,20}$'),
  version            INT  NOT NULL DEFAULT 1 CHECK (version >= 1),
  status             TEXT NOT NULL DEFAULT 'paiement_attendu' CHECK (status IN
                       ('paiement_attendu', 'payee', 'preparee', 'a_corriger',
                        'en_diffusion', 'en_pause', 'terminee', 'annulee')),
  budget_cents       INT  NOT NULL CHECK (budget_cents >= 10000),
  daily_budget_cents INT  CHECK (daily_budget_cents IS NULL OR daily_budget_cents >= 100),
  fee_pct            NUMERIC(5,2) NOT NULL CHECK (fee_pct BETWEEN 0 AND 100),
  vat_rate           NUMERIC(5,2) NOT NULL CHECK (vat_rate BETWEEN 0 AND 100),
  total_cents        INT  NOT NULL CHECK (total_cents >= budget_cents),
  starts_on          DATE,
  ends_on            DATE CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  -- Zone (centre, rayon), public : la forme exacte se fixe avec la création automatique (PR 7).
  targeting          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { kind: 'instagram_post', media_id } | { kind: 'upload', path, mime }
  creative           JSONB,
  structured_ref     TEXT NOT NULL,
  correction_reason  TEXT,
  terms_accepted_at  TIMESTAMPTZ,
  requested_by       UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ,
  prepared_at        TIMESTAMPTZ,
  launched_at        TIMESTAMPTZ,
  launched_by        UUID,
  ended_at           TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  UNIQUE (restaurant_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_requests_structured_ref_key ON ad_requests (structured_ref);
CREATE INDEX IF NOT EXISTS ad_requests_status_idx ON ad_requests (status, created_at);

CREATE TABLE IF NOT EXISTS ad_payment_notices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES ad_requests(id) ON DELETE RESTRICT,
  restaurant_id    TEXT NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  -- 'initial' = la demande ; 'recharge' = un complément qui relève le plafond.
  kind             TEXT NOT NULL CHECK (kind IN ('initial', 'recharge')),
  budget_cents     INT  NOT NULL CHECK (budget_cents > 0),
  fee_cents        INT  NOT NULL CHECK (fee_cents >= 0),
  vat_cents        INT  NOT NULL DEFAULT 0 CHECK (vat_cents >= 0),
  expected_cents   INT  NOT NULL CHECK (expected_cents > 0),
  structured_ref   TEXT NOT NULL,
  method           TEXT CHECK (method IS NULL OR method IN ('revolut_link', 'transfer', 'other')),
  received_cents   INT  CHECK (received_cents IS NULL OR received_cents >= 0),
  received_on      DATE,
  -- 'manual' tant que Revolut n'a pas d'API (ADR 0086 §2) ; 'webhook' le jour où il en a une.
  confirm_source   TEXT CHECK (confirm_source IS NULL OR confirm_source IN ('manual', 'webhook')),
  confirmed_by     UUID,
  confirmed_at     TIMESTAMPTZ,
  invoice_number   TEXT,
  invoice_issued_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ad_payment_notices_open_idx ON ad_payment_notices (confirmed_at, created_at);
CREATE INDEX IF NOT EXISTS ad_payment_notices_request_idx ON ad_payment_notices (request_id);

CREATE TABLE IF NOT EXISTS ad_credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     TEXT NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  request_id        UUID NOT NULL REFERENCES ad_requests(id) ON DELETE RESTRICT,
  kind              TEXT NOT NULL CHECK (kind IN ('versement', 'correction')),
  amount_cents      INT  NOT NULL CHECK (amount_cents <> 0),
  payment_notice_id UUID REFERENCES ad_payment_notices(id) ON DELETE RESTRICT,
  note              TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind <> 'versement' OR (amount_cents > 0 AND payment_notice_id IS NOT NULL)),
  CHECK (kind <> 'correction' OR note IS NOT NULL)
);
-- Un paiement ne crédite qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS ad_credit_one_per_payment
  ON ad_credit_transactions (payment_notice_id) WHERE kind = 'versement';
CREATE INDEX IF NOT EXISTS ad_credit_request_idx ON ad_credit_transactions (request_id);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regie            TEXT NOT NULL CHECK (regie IN ('META', 'TIKTOK')),
  external_id      TEXT NOT NULL,
  name             TEXT NOT NULL,
  restaurant_id    TEXT REFERENCES restaurants(id) ON DELETE RESTRICT,
  request_id       UUID REFERENCES ad_requests(id) ON DELETE SET NULL,
  objective        TEXT,
  version          INT,
  status           TEXT,
  effective_status TEXT,
  spend_cap_cents  INT,
  -- 'name' = lu dans le nom à la première lecture ; 'manual' = rattachée sur /platform ; NULL = non rattachée.
  attach_source    TEXT CHECK (attach_source IS NULL OR attach_source IN ('name', 'manual')),
  attach_problem   TEXT,
  warnings         TEXT[] NOT NULL DEFAULT '{}',
  attached_by      UUID,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (regie, external_id),
  CHECK ((restaurant_id IS NULL) = (attach_source IS NULL))
);
CREATE INDEX IF NOT EXISTS ad_campaigns_restaurant_idx ON ad_campaigns (restaurant_id);
CREATE INDEX IF NOT EXISTS ad_campaigns_unattached_idx ON ad_campaigns (last_seen_at) WHERE restaurant_id IS NULL;

CREATE TABLE IF NOT EXISTS ad_daily_stats (
  campaign_id  UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  spend_cents  INT  NOT NULL DEFAULT 0 CHECK (spend_cents >= 0),
  impressions  INT  NOT NULL DEFAULT 0,
  reach        INT  NOT NULL DEFAULT 0,
  clicks       INT  NOT NULL DEFAULT 0,
  results      INT  NOT NULL DEFAULT 0,
  result_kind  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, day)
);

CREATE TABLE IF NOT EXISTS ad_sync_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regie        TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  ok           BOOLEAN,
  campaigns_read INT NOT NULL DEFAULT 0,
  attached     INT NOT NULL DEFAULT 0,
  unattached   INT NOT NULL DEFAULT 0,
  errors       INT NOT NULL DEFAULT 0,
  error_detail JSONB
);
CREATE INDEX IF NOT EXISTS ad_sync_runs_started_idx ON ad_sync_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS ad_api_calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regie       TEXT NOT NULL,
  -- 'system' (tâche) ou l'identifiant de la personne qui a déclenché l'appel.
  actor       TEXT NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  -- Paramètres envoyés, JAMAIS le jeton.
  params      JSONB,
  http_status INT,
  ok          BOOLEAN NOT NULL,
  response    JSONB,
  error       TEXT,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE SET NULL,
  request_id  UUID REFERENCES ad_requests(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ad_api_calls_at_idx ON ad_api_calls (at DESC);
CREATE INDEX IF NOT EXISTS ad_api_calls_failed_idx ON ad_api_calls (at DESC) WHERE NOT ok;

ALTER TABLE restaurant_billing     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_payment_notices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_daily_stats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_sync_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_api_calls           ENABLE ROW LEVEL SECURITY;

-- Contrôle : SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'ad\_%' OR table_name = 'restaurant_billing';
