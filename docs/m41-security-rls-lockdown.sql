-- ============================================================
-- M41 : Audit sécurité 2026-07 — durcissement RLS ADR 0007 (finding F3)
--
-- F3 (HIGH) : community_scores.total_spent (dépense/CA cumulé, EUROS) était
-- lisible par tout client anon/authenticated via la policy permissive
-- 'scores_public_read' USING(true) (m2:276) + le GRANT SELECT par défaut de
-- Supabase — donc via une requête PostgREST directe avec la clé anon publique.
-- Violation de l'ADR 0007 (le client ne voit jamais d'euros/CA) au niveau base.
--
-- CORRECTIF : on révoque le SELECT global et on ne ré-accorde QUE les colonnes
-- non sensibles (jamais total_spent). Le code applicatif lit total_spent
-- uniquement via la clé service_role (createAdminClient), NON affectée par ces
-- grants. Même patron que le lockdown colonne de profiles (m34) et le retrait
-- de thresholds_public_read (m6).
--
-- ⚠️ APRÈS APPLICATION : tester le CLASSEMENT (leaderboard) et le DASHBOARD
--    membre — ils ne doivent lire que team_id/restaurant_id/member_count/
--    score/last_updated (jamais total_spent via le client anon/authenticated).
--
-- RÉSIDU CONNU (hors périmètre de cette migration, décision produit) :
--   1. La publication realtime (m8) transporte encore la ligne complète sur le
--      WebSocket ; un abonné anon direct reçoit total_spent en temps réel.
--   2. score = member_count * total_spent est public (leaderboard) → total_spent
--      reste DÉRIVABLE (score / member_count) pour member_count > 0.
--   Ces deux points relèvent d'un choix de conception du score public — voir
--   docs/security-audit-2026-07.md (F3). Ce lockdown ferme la lecture directe
--   de la colonne euro brute et protège les équipes à member_count = 0.
-- ============================================================

REVOKE SELECT ON community_scores FROM anon, authenticated;

GRANT SELECT (team_id, restaurant_id, member_count, score, last_updated)
  ON community_scores TO anon, authenticated;

-- ------------------------------------------------------------
-- F4 (HIGH) — DÉJÀ corrigé en CODE (compare-and-swap atomique dans
-- app/api/redemption/generate/route.ts). Défense en profondeur OPTIONNELLE :
-- un index unique garantit au niveau base au plus un token par récompense.
-- ⚠️ À n'activer QUE si aucune récompense n'a déjà 2 tokens (sinon la création
--    échoue) — dédoublonner d'abord le cas échéant. Décommenter pour l'activer :
--
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_tokens_reward
--   ON redemption_tokens (reward_id);
-- ------------------------------------------------------------
