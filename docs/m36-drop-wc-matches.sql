-- ============================================================
-- M36 : Retrait final de la Coupe du Monde — table wc2026_matches
--
-- Le modèle « équipes nationales + calendrier de matchs » de la Coupe du
-- Monde est entièrement abandonné (remplacé par les équipes communautaires,
-- ADR 0018). Les données ont été effacées le 2026-07-16 (62 équipes
-- nationales, leurs scores, 104 lignes de matchs). Cette migration retire
-- la table vide restante.
--
-- Idempotente.
-- ============================================================

DROP TABLE IF EXISTS wc2026_matches;
