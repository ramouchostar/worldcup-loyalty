-- ============================================================
-- Réserver un prestataire — le superadmin : litiges et versements
-- (ADR 0084 §2, §4 ; PR J)
--
-- Colonnes ajoutées à `missions`, toutes nullables : aucune ligne existante ne
-- change. Aucune table nouvelle.
--
--   dispute              le dossier d'un litige (qui l'ouvre, pourquoi, l'état
--                        d'avant, puis la décision de la plateforme)
--   dispute_opened_at    quand la plateforme l'a ouvert
--   dispute_resolved_at  quand elle l'a tranché
--   paid_out_at          quand le prestataire a été payé (`valide → verse`)
--                        tant que le versement se fait à la main, avant Stripe
--
-- Idempotente. Sans la migration, « Ouvrir un litige » et « Marquer comme
-- versé » répondent « pas encore disponible » : jamais un litige ni un
-- versement à moitié écrit.
-- ============================================================

ALTER TABLE missions ADD COLUMN IF NOT EXISTS dispute             JSONB;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS dispute_opened_at   TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS paid_out_at         TIMESTAMPTZ;

-- Les listes de la plateforme : tout, par état puis par date ; ce qui attend un versement ; les litiges ouverts.
CREATE INDEX IF NOT EXISTS missions_status_updated_idx ON missions (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS missions_to_pay_idx ON missions (validated_at) WHERE status = 'valide' AND paid_out_at IS NULL;
CREATE INDEX IF NOT EXISTS missions_open_disputes_idx ON missions (dispute_opened_at) WHERE status = 'litige';
