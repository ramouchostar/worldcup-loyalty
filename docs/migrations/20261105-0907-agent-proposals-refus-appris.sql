-- ============================================================
-- La brigade apprend des refus (ADR 0089 §8, amendé le 2026-11-05)
--
-- Quoi : agent_proposals.refusal_note — la saisie libre derrière « Autre » (ou en complément
--   d'un choix), 280 caractères au plus, lue par l'équipe sur /platform.
--   discard_reason accepte « appris » : un type d'idée en pause pour cet établissement,
--   d'après ses refus (deux « pas pour mon établissement », ou trois refus sans aucun Oui).
-- Pourquoi : le refus ne sert plus seulement à écarter une idée ; il règle ce que la brigade
--   propose à CET établissement (délai propre à chaque raison, types mis en pause, tri par goût).
-- Sans elle : un refus avec une note échoue à l'écriture (colonne absente) — appliquer avec le
--   code ; une idée « appris » ne s'enregistre pas comme écartée (contrainte), l'erreur remonte.
-- RLS inchangée (service-role only). Idempotente.
-- ============================================================

ALTER TABLE agent_proposals ADD COLUMN IF NOT EXISTS refusal_note text;

DO $$ BEGIN
  ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_refusal_note_len CHECK (refusal_note IS NULL OR char_length(refusal_note) <= 280);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE agent_proposals DROP CONSTRAINT IF EXISTS agent_proposals_discard_check;
ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_discard_check
  CHECK (discard_reason IS NULL OR discard_reason IN ('plafond_du_jour','deja_proposee','refusee_recemment','forfait','appris'));

-- Contrôle : SELECT refusal_reason, count(*), count(refusal_note) FROM agent_proposals WHERE status = 'refusee' GROUP BY 1;
