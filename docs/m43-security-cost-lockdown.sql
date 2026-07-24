-- ============================================================
-- M43 : Audit sécurité 2026-07 — lockdown des coûts (F5) + FK teams (F7)
--
-- F5 (MEDIUM) : rewards.cost_euros et micro_rewards.gift_cost_euros (coûts de
-- revient, EUROS) étaient lisibles par anon/authenticated via la policy
-- USING(true) + le GRANT SELECT par défaut → lecture PostgREST directe à la
-- clé anon publique. Même patron que m41 (community_scores) : REVOKE au niveau
-- table + GRANT des colonnes NON-coût uniquement. Les lectures serveur qui ont
-- besoin du coût (couverture ADR 0017) passent désormais par le service role
-- (lib/rewards.ts getUnlockedRewards, app/r/[id]/rewards/page.tsx).
--
-- ⚠️ APRÈS APPLICATION : tester la page /r/[id]/rewards et l'affichage des
--    paliers (ils ne doivent lire que les colonnes non-coût côté client).
-- ============================================================

REVOKE SELECT ON rewards FROM anon, authenticated;
GRANT SELECT (
  id, level, score_threshold, title, description, gift_details,
  requires_purchase, is_active, restaurant_id, min_member_count,
  created_at, updated_at
) ON rewards TO anon, authenticated;

REVOKE SELECT ON micro_rewards FROM anon, authenticated;
GRANT SELECT (
  id, type, title, description, gift_item, is_active, restaurant_id
) ON micro_rewards TO anon, authenticated;

-- F7 (MEDIUM) : teams.restaurant_id sans clé étrangère → un restaurantId
-- fabriqué crée des équipes/scores orphelins. FK en NOT VALID : protège les
-- insertions FUTURES sans valider l'existant (évite l'échec sur d'éventuels
-- orphelins ; les valeurs NULL — équipes globales héritées WC — restent OK).
-- Le contrôle applicatif d'existence est déjà ajouté dans lib/teams.ts.
DO $$
BEGIN
  ALTER TABLE teams
    ADD CONSTRAINT teams_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- déjà posée
END $$;
