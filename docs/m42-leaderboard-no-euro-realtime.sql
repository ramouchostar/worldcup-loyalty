-- ============================================================
-- M42 : Zéro euro côté client (ADR 0007) — retrait de community_scores
-- du flux Realtime.
--
-- Le canal Realtime (postgres_changes) transporte la LIGNE COMPLÈTE — dont
-- total_spent (euros) — sur le WebSocket à tout abonné anon. Les grants au
-- niveau colonne (m41) filtrent PostgREST mais PAS le flux de réplication.
-- On retire donc community_scores de la publication ; le classement bascule
-- en POLLING d'un endpoint euro-free (GET /api/leaderboard/[restaurantId],
-- qui ne sélectionne jamais total_spent). Plus aucun euro brut ne quitte le
-- serveur vers un client.
--
-- Idempotent : DROP TABLE de la publication échoue si la table n'y est pas ;
-- on l'enveloppe pour rester ré-exécutable.
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE community_scores;
EXCEPTION
  WHEN undefined_object THEN NULL;  -- déjà retirée
  WHEN undefined_table THEN NULL;
END $$;
