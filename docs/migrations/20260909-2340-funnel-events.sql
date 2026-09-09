-- ============================================================
-- funnel_events — les dix étages du parcours ticket, comptés côté serveur
--
-- POURQUOI. Les dix étapes du tunnel ne sont mesurées NULLE PART. Elles
-- existent en événements GA4 pour certaines, mais le Consent Mode v2 refuse
-- tout par défaut (ADR 0025) : l'écrasante majorité des parcours n'y remonte
-- jamais. C'est exactement le constat de l'ADR 0037, qui a déjà réglé le
-- premier étage (`qr_landings`, m60) avec un compteur serveur. Cette table
-- étend le même mécanisme aux neuf étages suivants.
--
-- QUOI. Un compteur par (établissement, jour belge, étape, motif). Un
-- `INSERT … ON CONFLICT DO UPDATE` par franchissement, best-effort, jamais
-- bloquant — un échec de comptage ne doit pas casser un parcours client.
--
-- CE QU'ELLE NE FAIT PAS, ET C'EST VOULU. Aucun identifiant de session, même
-- en `sessionStorage`, même sans cookie : un identifiant de parcours fait
-- basculer la mesure dans le champ du consentement ePrivacy, c'est-à-dire
-- l'angle mort exact que l'ADR 0037 a choisi de sortir. On perd donc les
-- parcours individuels et on garde les TAUX DE PASSAGE — la seule chose dont
-- on a besoin pour répondre à « où décroche-t-on ? ». Les parcours
-- individuels restent lisibles sur la partie authentifiée (`receipt_scans`,
-- `orders`), où la base légale existe.
--
-- Comme `qr_landings` : ni IP, ni agent utilisateur, ni cookie, ni
-- identifiant. Un entier par case. Elle compte des ÉVÉNEMENTS, pas des
-- personnes — un rechargement compte deux fois, et la vue le dit.
--
-- RLS : activée, AUCUNE policy → service-role only. Donnée interne
-- plateforme, jamais lisible par la clé anon (m34), jamais exposée à un
-- membre (ADR 0007) ni à un restaurateur (ADR 0015 §7).
--
-- Idempotente : rejouable sans effet de bord.
-- ============================================================


-- ============================================================
-- 1. La table
-- ============================================================

CREATE TABLE IF NOT EXISTS funnel_events (
  restaurant_id TEXT    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day           DATE    NOT NULL,   -- jour belge (Europe/Brussels), comme qr_landings

  -- Étape franchie. Volontairement PAS de CHECK sur une liste close : le
  -- vocabulaire vit dans `lib/funnel.ts` (FUNNEL_STEPS), et un CHECK en base
  -- imposerait une migration à chaque étape ajoutée pendant qu'on cherche
  -- encore où le parcours décroche. La vue n'affiche que les étapes connues,
  -- une étape inconnue est donc inerte plutôt que bloquante.
  step          TEXT    NOT NULL,

  -- Motif, uniquement pour les étapes qui en ont un — aujourd'hui
  -- `ticket_rejected` : 'qr_detected' (photo du QR ou de l'affiche),
  -- 'unreadable' (ni clé ni montant lisibles), 'duplicate' (même ticket déjà
  -- envoyé), 'header_rejected' (ticket non reconnu à l'aperçu). Chaîne vide
  -- et pas NULL : la clé primaire doit pouvoir distinguer les cases, et un
  -- NULL dans une PK ne se compare pas.
  reason        TEXT    NOT NULL DEFAULT '',

  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (restaurant_id, day, step, reason)
);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY; -- service-role only

COMMENT ON TABLE funnel_events IS
  'Compteurs des dix étages du parcours ticket, par établissement / jour / étape / motif (ADR 0037, modèle qr_landings m60). Aucune donnée personnelle, aucun identifiant de session — des événements, pas des personnes. Service-role only.';

-- La lecture courante est « les N derniers jours d'un établissement ».
CREATE INDEX IF NOT EXISTS idx_funnel_events_resto_jour
  ON funnel_events (restaurant_id, day DESC);


-- ============================================================
-- 2. L'incrément atomique
-- ============================================================
--
-- Même forme que `record_landing` (m60) : SECURITY DEFINER, exécutable par le
-- seul service_role, appelé en best-effort depuis `lib/funnel.ts`.

-- `p_times` : incrément, 1 par défaut. Une validation en LOT depuis la file
-- d'arbitrage franchit l'étage autant de fois qu'elle valide de tickets — un
-- appel par ticket serait N allers-retours pour un seul compteur.
CREATE OR REPLACE FUNCTION record_funnel_event(
  p_restaurant_id TEXT,
  p_day           DATE,
  p_step          TEXT,
  p_reason        TEXT DEFAULT '',
  p_times         INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO funnel_events (restaurant_id, day, step, reason, count, updated_at)
  VALUES (p_restaurant_id, p_day, p_step, COALESCE(p_reason, ''), GREATEST(COALESCE(p_times, 1), 1), NOW())
  ON CONFLICT (restaurant_id, day, step, reason)
  DO UPDATE SET count = funnel_events.count + GREATEST(COALESCE(p_times, 1), 1), updated_at = NOW();
$$;

REVOKE ALL     ON FUNCTION record_funnel_event(TEXT, DATE, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_funnel_event(TEXT, DATE, TEXT, TEXT, INTEGER) TO   service_role;


-- ============================================================
-- 3. Vérification
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'funnel_events')                                  AS table_ok,
  (SELECT COUNT(*) FROM information_schema.routines
    WHERE routine_name = 'record_funnel_event')                          AS rpc_ok,
  (SELECT COUNT(*) FROM funnel_events)                                   AS lignes;

-- Lecture d'un établissement :
--   SELECT day, step, reason, count FROM funnel_events
--    WHERE restaurant_id = 'kraainem' ORDER BY day DESC, step;
