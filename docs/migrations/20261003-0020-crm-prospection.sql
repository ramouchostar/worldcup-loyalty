-- ============================================================
-- CRM de prospection restaurateurs dans /platform (ADR 0076)
--
-- Quoi :
--   crm_prospects        un établissement qu'on pourrait signer : coordonnées publiques,
--                        gérant (registre BCE), fiche Google, stratégie et offre, statut
--                        dans l'entonnoir, prochaine action, motif de perte.
--   crm_prospect_events  le journal : chaque changement de statut, appel, message, visite,
--                        note. C'est lui qui compte la semaine (contacts, audits, signés)
--                        et les taux de conversion réels — jamais une saisie à part.
--
-- Pourquoi : tenir 5 établissements signés par semaine exige de voir chaque lundi combien
-- de contacts et d'audits il a fallu, et de savoir quelle stratégie convertit.
--
-- Sécurité : données de contact de professionnels (RGPD, intérêt légitime B2B) — RLS
-- activée SANS policy = service-role uniquement, lues seulement par la console plateforme
-- (super-admin vérifié côté serveur). Le dépôt est public : AUCUNE ligne de prospect n'est
-- écrite dans une migration, elles s'importent depuis la console. `do_not_contact` porte le
-- droit d'opposition : un prospect qui refuse d'être recontacté le reste.
--
-- Idempotent. Si la migration n'est pas appliquée : l'onglet CRM affiche « tables absentes »,
-- rien d'autre dans l'app n'en dépend (fail-open).
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_prospects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  place_id        text UNIQUE,                 -- Google Places (ChIJ…), quand la fiche est reliée
  address         text,
  postal_code     text,
  commune         text,
  category        text,                        -- cuisine / type (« smash burger », « pita »…)
  locations       int  NOT NULL DEFAULT 1 CHECK (locations BETWEEN 1 AND 50),
  opened_year     int,
  phone           text,                        -- numéro publié par l'établissement
  email           text,                        -- adresse publiée par l'établissement
  website         text,
  instagram       text,
  facebook        text,
  delivery        text[] NOT NULL DEFAULT '{}', -- ubereats, deliveroo, takeaway
  rating          numeric(2, 1),
  reviews_count   int,
  maps_uri        text,
  owner_name      text,                        -- gérant publié (BCE, site, presse)
  owner_role      text,
  owner_contact   text,                        -- contact du gérant publié à titre professionnel
  company_number  text,                        -- numéro BCE
  signals         text[] NOT NULL DEFAULT '{}', -- constats vérifiables utiles à la vente
  sources         text[] NOT NULL DEFAULT '{}', -- URL d'où vient chaque contact
  strategy        text NOT NULL DEFAULT 'pilier'
                  CHECK (strategy IN ('pilier', 'reputation', 'jeune', 'enseigne')),
  offer           text NOT NULL DEFAULT 'gratuit' CHECK (offer IN ('gratuit', 'pro_2_mois')),
  pitch           text,                        -- message court d'approche
  status          text NOT NULL DEFAULT 'a_contacter'
                  CHECK (status IN ('a_qualifier', 'a_contacter', 'contacte', 'rdv_audit', 'audit_presente', 'signe', 'perdu')),
  lost_reason     text,
  do_not_contact  boolean NOT NULL DEFAULT false,
  next_action_at  date,
  owner_user      text,                        -- associé qui porte le prospect
  notes           text,
  audit_id        uuid REFERENCES restaurant_audits (id) ON DELETE SET NULL,
  restaurant_id   text REFERENCES restaurants (id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'manuel' CHECK (source IN ('import', 'google_places', 'manuel')),
  signed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_prospects_status_idx ON crm_prospects (status, next_action_at);
-- Un même établissement importé deux fois (nom + code postal) ne se dédouble pas.
CREATE UNIQUE INDEX IF NOT EXISTS crm_prospects_name_cp_uniq ON crm_prospects (lower(name), coalesce(postal_code, ''));

CREATE TABLE IF NOT EXISTS crm_prospect_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  uuid NOT NULL REFERENCES crm_prospects (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('statut', 'appel', 'whatsapp', 'email', 'visite', 'note')),
  from_status  text,
  to_status    text,
  note         text,
  created_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_prospect_events_prospect_idx ON crm_prospect_events (prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_prospect_events_created_idx ON crm_prospect_events (created_at DESC);

ALTER TABLE crm_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prospect_events ENABLE ROW LEVEL SECURITY;
