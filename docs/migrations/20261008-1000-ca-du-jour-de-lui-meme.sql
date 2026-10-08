-- ============================================================
-- CA du jour : issue « De lui-même » (ADR 0078, amendé le 2026-10-08)
--
-- Quoi : ajoute l'issue 'spontane' à daily_revenue_entries.outcome — le
--        responsable de caisse envoie le chiffre DE LUI-MÊME à la fermeture,
--        sans qu'on le lui demande (vu à De Bue deux soirs de suite). Il porte
--        un montant, comme 'repondu' et 'relance' ; asked_at reste vide.
--
-- Pourquoi : le noter « Répondu » fausserait la trace du test (heure d'envoi
--        inventée, délai médian faux) et cacherait le meilleur signe : le geste
--        devient une routine sans rappel.
--
-- Comment : remplace les deux contraintes CHECK qui listent les issues (celle de
--        la colonne et celle « montant ⇔ réponse »). save_daily_revenue ne change
--        pas : elle reporte tout montant non nul dans restaurant_sales.
--
-- RLS : inchangée (table sans policy, service-role uniquement).
-- Idempotent. Sans cette migration, /platform/ca refuse d'enregistrer
-- « De lui-même » et dit quelle migration appliquer (fail-open, rien d'autre ne casse).
-- ============================================================

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'daily_revenue_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%outcome%'
  LOOP
    EXECUTE format('ALTER TABLE daily_revenue_entries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE daily_revenue_entries
  ADD CONSTRAINT daily_revenue_entries_outcome_check
  CHECK (outcome IN ('repondu', 'relance', 'spontane', 'sans_reponse', 'ferme', 'historique'));

-- un montant exactement quand il y a eu un chiffre (réponse, envoi spontané, historique)
ALTER TABLE daily_revenue_entries
  ADD CONSTRAINT daily_revenue_entries_amount_outcome_check
  CHECK ((outcome IN ('repondu', 'relance', 'spontane', 'historique')) = (amount IS NOT NULL));
