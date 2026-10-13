-- ============================================================
-- Réserver un prestataire — l'annulation et ses suites (ADR 0084 §4, PR I)
--
-- Une annulation laisse sa trace chiffrée : quelle bande du barème (gratuit /
-- la moitié / tout), ce qui est rendu au restaurateur, ce qui est retenu, ce
-- qui revient au prestataire, ce que Boosteats garde, et la sanction du
-- prestataire. Tant que Stripe n'est pas branché, c'est cette ligne qui dit à
-- la plateforme ce qu'il reste à rembourser ou à verser à la main ; elle la
-- marque « réglée » quand c'est fait (`cancellation_settled_at`).
--
-- Colonnes ajoutées à `missions`, toutes nullables : aucune ligne existante ne
-- change. Aucune table nouvelle. Idempotente. Sans la migration, « Annuler »
-- répond « pas encore disponible » : jamais une annulation à moitié écrite.
-- ============================================================

ALTER TABLE missions ADD COLUMN IF NOT EXISTS cancellation            JSONB;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS cancellation_settled_at  TIMESTAMPTZ;

-- Les annulations qui attendent un règlement manuel (liste de la plateforme).
CREATE INDEX IF NOT EXISTS missions_cancellation_unsettled_idx
  ON missions (cancelled_at)
  WHERE status = 'annule' AND cancellation IS NOT NULL AND cancellation_settled_at IS NULL;
