-- ============================================================
-- La barre de la brigade (ADR 0105)
--
-- Quoi : discard_reason accepte « sous_la_barre » : une idée produite par un générateur qui rate
--   une des cinq conditions de la barre (fiche de jeu, caisse, audience, rentable, mesure). La
--   condition ratée et sa phrase sont dans content.barre ({ condition, detail }) : aucune colonne.
-- Pourquoi : au 2026-11-15, 100 % des idées venaient de Chloé, une sur deux était une tâche,
--   et les messages aux membres touchaient une dizaine de clients. Une idée montrée doit être
--   sûre de profiter à l'établissement ; celles qui ne le sont pas restent tracées, jamais montrées.
-- Sans elle : les idées « sous la barre » ne s'enregistrent pas (contrainte), elles sont dites
--   dans les journaux « [brigade] … migration 20261115-1500 à appliquer » ; les autres passent.
-- RLS inchangée (service-role only). Idempotente.
-- ============================================================

ALTER TABLE agent_proposals DROP CONSTRAINT IF EXISTS agent_proposals_discard_check;
ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_discard_check
  CHECK (discard_reason IS NULL OR discard_reason IN ('plafond_du_jour','deja_proposee','refusee_recemment','forfait','appris','sous_la_barre'));

-- Contrôle : SELECT assistant, type, content->'barre'->>'condition' AS condition, count(*)
--   FROM agent_proposals WHERE discard_reason = 'sous_la_barre' GROUP BY 1, 2, 3 ORDER BY 4 DESC;
