-- ============================================================
-- La brigade : la table des idées (ADR 0089 §2, Brigade 02)
--
-- Quoi : agent_proposals — une ligne par idée d'un assistant (ou préparée par l'équipe),
--   avec son contenu complet (content jsonb = l'objet `Idea` de lib/agents/types.ts, plus les
--   champs propres à l'assistant), sa vie (proposée → acceptée → exécutée, refusée, expirée)
--   et sa trace (vue, décidée par qui et quand, raison du refus, raison d'un écart, erreur ou
--   résultat d'exécution).
-- Pourquoi : un seul objet pour les sept assistants, un seul plafond (3 idées montrées par jour),
--   une seule mesure (taux de Oui, délai, raisons — Brigade 06).
-- « ecartee » : produite mais jamais montrée (plafond du jour, doublon, forfait) — gardée pour
--   que rien ne disparaisse en silence (ADR 0065).
-- Un seul exemplaire OUVERT d'une même idée par établissement (index unique partiel sur
--   idea_key) : deux passages concurrents ne la montrent jamais deux fois.
-- RLS activée SANS policy (= service-role only) : la console lit et décide par le serveur,
--   derrière la garde de l'établissement (requireAdmin). Les cartes portent des euros
--   (côté gérant seulement) : jamais lisibles par un membre (ADR 0007).
-- Sans elle : lib/agents/proposals.ts renvoie « indisponible » (fail-open) — aucune idée
--   n'est montrée, l'écran le dit, rien ne casse.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  assistant        text NOT NULL,
  type             text NOT NULL,
  idea_key         text NOT NULL,           -- assistant:type:objet — l'anti-doublon
  origin           text NOT NULL DEFAULT 'systeme',
  status           text NOT NULL DEFAULT 'proposee',
  action_kind      text NOT NULL,
  content          jsonb NOT NULL,
  proposed_on      date NOT NULL,           -- jour de Bruxelles où l'idée a été produite
  decide_by        timestamptz NOT NULL,    -- au-delà : expirée
  seen_at          timestamptz,             -- première fois que le gérant l'a vue
  snoozed_until    date,                    -- « Plus tard » : cachée jusqu'à ce jour (Bruxelles)
  snooze_count     integer NOT NULL DEFAULT 0,
  decided_at       timestamptz,
  decided_by       uuid,
  refusal_reason   text,
  discard_reason   text,
  executed_at      timestamptz,
  execution_error  text,
  result           jsonb,
  created_by       uuid,                    -- préparée par l'équipe : qui (Brigade 04)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_assistant_check
    CHECK (assistant IN ('nina','lea','hugo','emma','max','louis','chloe'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_origin_check
    CHECK (origin IN ('systeme','equipe'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_status_check
    CHECK (status IN ('proposee','acceptee','refusee','expiree','executee','ecartee'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_refusal_check
    CHECK (refusal_reason IS NULL OR refusal_reason IN ('pas_le_moment','trop_cher','pas_pour_moi','deja_fait','autre'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_discard_check
    CHECK (discard_reason IS NULL OR discard_reason IN ('plafond_du_jour','deja_proposee','refusee_recemment','forfait'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Les idées du jour d'un établissement, et le plafond (montrées ce jour-là).
CREATE INDEX IF NOT EXISTS agent_proposals_restaurant_day_idx
  ON agent_proposals (restaurant_id, proposed_on);

-- L'anti-doublon et le délai après un refus.
CREATE INDEX IF NOT EXISTS agent_proposals_restaurant_key_idx
  ON agent_proposals (restaurant_id, idea_key, status);

-- Une même idée n'attend qu'une fois une décision.
CREATE UNIQUE INDEX IF NOT EXISTS agent_proposals_one_open_idx
  ON agent_proposals (restaurant_id, idea_key) WHERE status = 'proposee';

-- Le balayage des idées expirées.
CREATE INDEX IF NOT EXISTS agent_proposals_open_decide_by_idx
  ON agent_proposals (decide_by) WHERE status = 'proposee';

ALTER TABLE agent_proposals ENABLE ROW LEVEL SECURITY;

-- Contrôle : SELECT status, count(*) FROM agent_proposals GROUP BY status;
