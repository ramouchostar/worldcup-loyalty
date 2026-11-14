-- ADR 0102 (suite) — « Quelle caisse utilisez-vous ? » posée à l'inscription.
--
-- Quoi : restaurants.pos_system (réponse brute du restaurateur, « Je ne sais
-- pas » compris) et restaurants.pos_system_noted_at (quand).
-- Pourquoi : savoir quelles caisses ont nos restaurants avant de construire
-- une connexion (HubRise, Chift, API d'un éditeur) — on mesure d'abord.
-- NULL = question pas encore posée ou étape sautée.
-- RLS : inchangée (colonnes de restaurants, écrites par le service).
-- Idempotente.

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pos_system TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pos_system_noted_at TIMESTAMPTZ;
