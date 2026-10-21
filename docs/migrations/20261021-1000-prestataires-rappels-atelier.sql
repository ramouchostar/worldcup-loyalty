-- ============================================================
-- Réserver un prestataire — les rappels des métiers d'atelier (ADR 0084 §5 bis et ter, PR R)
--
-- Le graphiste et l'imprimeur n'ont pas de date de tournage, donc pas de J-7 ni de J-2 ; mais un jour souhaité, et pour
-- l'impression un bon à tirer qui attend une réponse. Le cron quotidien réveille ce qui dort (sans jamais décider à la place de
-- personne) : sept rappels de plus, chacun envoyé UNE fois (clé primaire de `mission_reminders`).
--
--   studio_start         le prestataire n'a pas commencé (J-6 à J-3 du jour souhaité)
--   studio_start_late    idem, J-2 : alerte à la PLATEFORME
--   studio_deliver       la livraison souhaitée approche (J-2)
--   studio_overdue       le jour souhaité est passé sans livraison (prestataire ET plateforme)
--   bat_review           une épreuve attend le restaurateur (2 jours)
--   bat_review_again     … toujours (5 jours)
--   bat_corrections_due  des corrections attendent une nouvelle épreuve (2 jours)
--
-- Étend le CHECK des clés de `mission_reminders`. Idempotente. Sans la migration, le passage des rappels d'atelier répond
-- « unavailable » et n'envoie RIEN ; les autres travaux du cron ne changent pas.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('mission_reminders') IS NOT NULL THEN
    ALTER TABLE mission_reminders DROP CONSTRAINT IF EXISTS mission_reminders_key_check;
    ALTER TABLE mission_reminders ADD CONSTRAINT mission_reminders_key_check CHECK (key IN (
      'j7', 'j2', 'veille', 'alerte',
      'propose', 'choisir', 'sans_proposition',
      'studio_start', 'studio_start_late', 'studio_deliver', 'studio_overdue', 'bat_review', 'bat_review_again', 'bat_corrections_due'
    ));
  END IF;
END $$;
