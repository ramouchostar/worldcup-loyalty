-- ============================================================
-- Pub : une offre avec mot clé, et l'estimation montrée avant de payer
-- (ADR 0086 amendé le 2026-10-29, démo avec De Bue)
--
-- Quoi : ad_requests
--   offer_text, offer_keyword, offer_from, offer_to   l'offre que la pub annonce (« Family Bucket
--                     = 5 Junior Burgers offerts ») et le mot clé à dire au comptoir, avec sa
--                     période de validité ; rappelés au restaurateur pour prévenir ses équipes.
--   estimate          ce que le formulaire a estimé au moment de la demande (fourchette, type,
--                     audience, calibré ou non) : la trace qui dira si l'estimation était juste,
--                     comparée aux résultats lus chez Meta.
--   ad_campaigns.lifetime   totaux de la campagne depuis son début (personnes touchées sans double
--                     compte, impressions, clics, dépense), relus chaque matin : c'est à eux qu'on
--                     compare l'estimation (la somme des portées par jour compte une personne plusieurs fois).
--
-- Colonnes nullables, aucune contrainte sur les lignes existantes. RLS inchangée (service-role).
-- Idempotente. Sans elle : la demande échoue proprement (« Demande non enregistrée »), rien
-- n'est écrit à moitié ; l'estimation à l'écran fonctionne quand même.
-- ============================================================

ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS offer_text    TEXT CHECK (offer_text IS NULL OR char_length(offer_text) BETWEEN 3 AND 140);
ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS offer_keyword TEXT CHECK (offer_keyword IS NULL OR offer_keyword ~ '^[A-Z0-9-]{2,24}$');
ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS offer_from    DATE;
ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS offer_to      DATE CHECK (offer_to IS NULL OR offer_from IS NULL OR offer_to >= offer_from);
ALTER TABLE ad_requests ADD COLUMN IF NOT EXISTS estimate      JSONB;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS lifetime     JSONB;

-- Contrôle : SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_requests' AND column_name LIKE 'offer%';
