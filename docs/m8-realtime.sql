-- ============================================================
-- WORLDCUP LOYALTY — M8 Realtime
-- Exécuter dans Supabase : SQL Editor → New query → Run
-- Active Supabase Realtime sur community_scores
-- ============================================================

-- Active la réplication Realtime pour la table community_scores
-- Requis pour que le composant LeaderboardRealtime reçoive les push WebSocket
ALTER PUBLICATION supabase_realtime ADD TABLE community_scores;
