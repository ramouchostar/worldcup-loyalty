-- ============================================================
-- Pub : l'origine d'une demande (Brigade 10 · Emma, ADR 0086 amendé le 2026-11-05)
--
-- Quoi : ad_requests.origin — qui a proposé la demande. NULL = le restaurateur l'a faite lui-même ;
--   'emma' = elle vient d'une idée d'Emma, acceptée par le gérant.
--   ad_requests.origin_evidence — les chiffres qui ont produit l'idée (produit, remise, jours,
--   budget, rayon, frais, estimation), pour comparer plus tard les demandes d'Emma à celles des gérants.
-- Pourquoi : sans cela, on ne saurait jamais si les pubs proposées par Emma rapportent plus
--   (ou moins) que celles que les gérants font seuls — la trace exigée par l'ADR 0065.
-- Sans elle : la demande est créée quand même ; l'origine ne se note pas, l'écran le dit
--   (avertissement « origine non notée ») et le journal serveur garde la raison (fail-open).
-- RLS inchangée (table service-role only). Idempotente.
-- ============================================================

ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS origin_evidence jsonb;

DO $$ BEGIN
  ALTER TABLE ad_requests ADD CONSTRAINT ad_requests_origin_check CHECK (origin IS NULL OR origin IN ('emma'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contrôle : SELECT origin, count(*) FROM ad_requests GROUP BY origin;
