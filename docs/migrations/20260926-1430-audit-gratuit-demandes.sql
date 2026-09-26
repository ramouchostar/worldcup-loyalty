-- ADR 0071 — Audit gratuit public : une ligne par analyse lancée depuis /audit-gratuit.
--
-- Quoi : audit_leads — l'établissement choisi par le visiteur (identifiant Google Places),
--   l'état et le résultat du score rapide (étapes, données affichées, notes), le numéro
--   WhatsApp laissé et son consentement, l'audit complet lancé ensuite (restaurant_audits),
--   l'envoi WhatsApp du rapport, le coût et les appels par source.
--
-- Pourquoi : mesurer l'entonnoir analyses → numéros → rapports envoyés, plafonner le coût
--   (analyses par IP et par jour, réutilisation d'un score de moins de 24 h), et relier la
--   demande à l'audit que l'équipe relit.
--
-- Sécurité : RLS activée SANS policy = service role uniquement. Les routes publiques
--   passent par le serveur ; l'adresse IP n'est jamais stockée en clair (empreinte salée).
--
-- Si la migration n'est pas appliquée : /audit-gratuit affiche « analyse indisponible »
--   (fail-closed : sans table, pas de plafond, donc pas d'appel payant) ; rien d'autre
--   dans l'app n'en dépend.

CREATE TABLE IF NOT EXISTS audit_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      text NOT NULL,
  name          text NOT NULL,
  address       text,
  postal_code   text,
  in_brussels   boolean,
  scan_status   text NOT NULL DEFAULT 'en_cours'
                CHECK (scan_status IN ('en_cours', 'ok', 'echec', 'hors_zone')),
  scan          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- étapes + données affichées + notes
  score         integer,                              -- note globale du score rapide
  scan_error    text,
  phone         text,                                 -- E.164, laissé après la note
  consent_at    timestamptz,
  audit_id      uuid REFERENCES restaurant_audits (id) ON DELETE SET NULL,
  whatsapp_sent_at timestamptz,
  whatsapp_error   text,
  ip_hash       text,
  cost_usd      numeric(10, 4) NOT NULL DEFAULT 0,
  calls         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_leads_created_idx ON audit_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_leads_ip_idx ON audit_leads (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_leads_place_idx ON audit_leads (place_id, created_at DESC);

ALTER TABLE audit_leads ENABLE ROW LEVEL SECURITY;
