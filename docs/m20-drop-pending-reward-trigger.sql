-- ============================================================
-- M20 : Suppression du trigger SQL pending_rewards
--
-- La grille de cadeaux (3 couches — ADR 0006) vit désormais à UN
-- seul endroit : lib/rewards.ts (getSoloReward / getCommunityBonus /
-- getAdvancementBonus + createPendingReward). Ces fonctions étaient
-- déjà la source de l'aperçu dashboard ; elles deviennent aussi la
-- seule voie d'écriture des pending_rewards.
--
-- Le trigger calculate_pending_reward (créé en m5, patché m12, m15b,
-- m17) dupliquait la grille en SQL — risque de divergence.
-- ============================================================

DROP TRIGGER IF EXISTS on_pending_reward_create ON orders;
DROP FUNCTION IF EXISTS calculate_pending_reward();
