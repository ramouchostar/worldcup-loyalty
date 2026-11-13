-- ============================================================
-- 2026-08-30 02:37 — Enveloppe auth.uid() dans (SELECT auth.uid())
-- pour les 28 policies RLS concernées. Idempotente (DROP IF EXISTS +
-- CREATE), sémantiquement neutre : aucune condition d'accès n'est
-- modifiée, seule la forme de l'appel change.
--
-- POURQUOI. Postgres traite auth.uid() comme une fonction STABLE et la
-- réévalue POUR CHAQUE LIGNE examinée par la policy. Enveloppée dans une
-- sous-requête scalaire, elle devient un InitPlan évalué une seule fois
-- par requête. C'est la recommandation Supabase pour les policies RLS.
--
-- IMPACT AUJOURD'HUI : faible. Le chemin chaud passe par createAdminClient
-- (service role), qui contourne RLS — ces policies s'exécutent rarement.
-- C'est une dette qu'on solde AVANT de déplacer des lectures vers le
-- client anon (Realtime côté membre), pas un correctif de perf immédiat.
--
-- PÉRIMÈTRE. 30 occurrences brutes de auth.uid() dans docs/, dont deux
-- doublons stricts (push_own défini en m8 puis m10, notification_log_own_read
-- en m6 puis m10) => 28 policies effectives, reconstruites en rejouant les
-- 69 migrations dans l'ordre. Les policies sans auth.uid() ne sont pas
-- touchées (teams_public_read, restaurants_public_read, team_suggestions_read…).
--
-- TRANSACTION : contrairement à 20260830-0218 (CREATE INDEX CONCURRENTLY,
-- hors transaction), CE FICHIER DOIT TOURNER EN BLOC. Le BEGIN/COMMIT est
-- inclus : coller le fichier entier d'un coup dans l'éditeur SQL Supabase.
-- Entre un DROP et son CREATE, la table n'a plus la policy ; sur une table
-- RLS sans policy, Postgres refuse tout accès non-service-role. Le mode de
-- panne est donc le refus, jamais l'exposition — mais la transaction évite
-- même ça.
--
-- VÉRIFICATION APRÈS APPLICATION (doit renvoyer 0 ligne) :
--   SELECT tablename, policyname FROM pg_policies
--    WHERE schemaname = 'public'
--      AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
--      AND COALESCE(qual,'') || COALESCE(with_check,'') NOT LIKE '%( SELECT auth.uid()%';
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "profiles_own_read" ON profiles;
CREATE POLICY "profiles_own_read" ON profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_own_update" ON profiles;
CREATE POLICY "profiles_own_update" ON profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "orders_own_read" ON orders;
CREATE POLICY "orders_own_read" ON orders
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "orders_own_insert" ON orders;
CREATE POLICY "orders_own_insert" ON orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "claims_own_read" ON micro_reward_claims;
CREATE POLICY "claims_own_read" ON micro_reward_claims
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "claims_own_insert" ON micro_reward_claims;
CREATE POLICY "claims_own_insert" ON micro_reward_claims
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "transfers_own_read" ON transfers;
CREATE POLICY "transfers_own_read" ON transfers
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "transfers_own_insert" ON transfers;
CREATE POLICY "transfers_own_insert" ON transfers
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "referrals_own_read" ON referral_submissions;
CREATE POLICY "referrals_own_read" ON referral_submissions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "referrals_own_insert" ON referral_submissions;
CREATE POLICY "referrals_own_insert" ON referral_submissions
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "pending_rewards_own_read" ON pending_rewards;
CREATE POLICY "pending_rewards_own_read" ON pending_rewards
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "thresholds_admin_read" ON restaurant_thresholds;
CREATE POLICY "thresholds_admin_read" ON restaurant_thresholds
  FOR SELECT USING ( EXISTS ( SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND is_admin = true ) );

DROP POLICY IF EXISTS "notification_log_own_read" ON notification_log;
CREATE POLICY "notification_log_own_read" ON notification_log
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "referral_links_own_read" ON referral_links;
CREATE POLICY "referral_links_own_read" ON referral_links
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "referrals_own_read" ON referrals;
CREATE POLICY "referrals_own_read" ON referrals
  FOR SELECT USING ((SELECT auth.uid()) = referrer_id);

DROP POLICY IF EXISTS "push_own" ON push_subscriptions;
CREATE POLICY "push_own" ON push_subscriptions
  FOR ALL USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "redemption_tokens_own_read" ON redemption_tokens;
CREATE POLICY "redemption_tokens_own_read" ON redemption_tokens
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "memberships_own_read" ON memberships;
CREATE POLICY "memberships_own_read" ON memberships
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "order_items_own_read" ON order_items;
CREATE POLICY "order_items_own_read" ON order_items
  FOR SELECT USING ( EXISTS ( SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = (SELECT auth.uid()) ) );

DROP POLICY IF EXISTS "point_transactions_own_read" ON point_transactions;
CREATE POLICY "point_transactions_own_read" ON point_transactions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "consents_own_read" ON consents;
CREATE POLICY "consents_own_read" ON consents
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "data_requests_own_read" ON data_requests;
CREATE POLICY "data_requests_own_read" ON data_requests
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "quality_feedback_own_read" ON quality_feedback;
CREATE POLICY "quality_feedback_own_read" ON quality_feedback
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "feedback_messages_own_read" ON feedback_messages;
CREATE POLICY "feedback_messages_own_read" ON feedback_messages
  FOR SELECT USING ( EXISTS ( SELECT 1 FROM quality_feedback qf WHERE qf.id = feedback_messages.feedback_id AND qf.user_id = (SELECT auth.uid()) ) );

DROP POLICY IF EXISTS "postpones_own_read" ON micro_reward_postpones;
CREATE POLICY "postpones_own_read" ON micro_reward_postpones
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "postpones_own_insert" ON micro_reward_postpones;
CREATE POLICY "postpones_own_insert" ON micro_reward_postpones
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "postpones_own_update" ON micro_reward_postpones;
CREATE POLICY "postpones_own_update" ON micro_reward_postpones
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "restaurant_admins_own_read" ON restaurant_admins;
CREATE POLICY "restaurant_admins_own_read" ON restaurant_admins
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

COMMIT;
