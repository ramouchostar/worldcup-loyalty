-- ============================================================
-- 2026-09-18 04:00 — SÉCURITÉ : verrouiller les fonctions de points et de budget
--
-- Quoi : retire l'exécution de quatre fonctions SECURITY DEFINER à tout le
-- monde sauf au rôle serveur (service_role) :
--   - get_points_balance(uuid, text)            — solde d'un membre ;
--   - bank_reward(uuid, uuid)                   — mettre un cadeau de côté ;
--   - exchange_points_for_gift(uuid, text, uuid) — échanger des points ;
--   - increment_reward_budget(text, numeric, numeric) — compteur du budget
--     cadeaux (ADR 0012), qui pilote l'arrêt des bonus d'équipe.
--
-- Pourquoi : aucune migration ne les avait révoquées. Postgres accorde
-- l'exécution à PUBLIC par défaut, et ces fonctions prennent l'identifiant du
-- membre en paramètre au lieu de le lire de la session. Constaté le
-- 2026-09-18 avec la clé PUBLIQUE de l'app (visible dans le navigateur) :
-- get_points_balance et bank_reward s'exécutent, exchange_points_for_gift
-- passe la barrière des droits. N'importe qui pouvait donc lire le solde d'un
-- membre, mettre de côté ou échanger les cadeaux d'un autre, et fausser le
-- budget d'un établissement (dont l'identifiant est public : « kraainem »).
--
-- Sans risque pour l'app : TOUS ses appels passent par le client serveur
-- (lib/points.ts, lib/budget.ts → createAdminClient). Aucun appel .rpc() ne
-- part d'un client navigateur ou d'une session membre.
--
-- ADR 0012, 0021, 0060. Même verrou que average_basket / saver_cost_cap
-- (migration 20260914-2010). Idempotente.
-- ============================================================

REVOKE ALL ON FUNCTION get_points_balance(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bank_reward(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION exchange_points_for_gift(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_reward_budget(TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_points_balance(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION bank_reward(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION exchange_points_for_gift(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_reward_budget(TEXT, NUMERIC, NUMERIC) TO service_role;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS membre,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') AS serveur
--     FROM pg_proc p
--    WHERE p.proname IN ('get_points_balance','bank_reward','exchange_points_for_gift','increment_reward_budget');
--   → anon = false, membre = false, serveur = true pour les quatre.
