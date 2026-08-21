-- ============================================================
-- M60 : Mesure des atterrissages QR (ADR 0037)
--
-- Le haut de l'entonnoir est le seul étage qu'on ne mesure pas. On sait
-- combien de membres s'inscrivent (`memberships.joined_at`), combien
-- scannent un ticket (`receipt_scans`), combien commandent (`orders`) — mais
-- pas combien de personnes ARRIVENT sur la page après avoir scanné le QR.
-- Impossible donc de trancher « personne ne scanne le QR » contre « ils
-- scannent mais n'installent pas ».
--
-- GA4 ne répond pas à la question : tout y est refusé par défaut (Consent
-- Mode v2, ADR 0025) — l'immense majorité des arrivées n'y remonte jamais.
-- Il faut une mesure serveur, qui ne dépende d'aucun consentement… donc qui
-- ne collecte AUCUNE donnée personnelle : pas d'IP, pas d'agent utilisateur,
-- pas de cookie, pas d'identifiant. Un compteur par jour, et rien d'autre.
--
-- Service-role only (RLS activée, AUCUNE policy). Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS qr_landings (
  restaurant_id TEXT    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day           DATE    NOT NULL,                    -- jour belge (Europe/Brussels)
  -- Provenance déclarée par l'URL : `qr_code` pour les QR imprimés (le
  -- `utm_source` posé sur les liens encodés), `direct` sinon.
  source        TEXT    NOT NULL,
  -- 'anonyme' = personne non connectée (le cas qui nous intéresse),
  -- 'membre'  = quelqu'un qui a déjà un compte et revient sur la page.
  visitor       TEXT    NOT NULL CHECK (visitor IN ('anonyme', 'membre')),
  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, day, source, visitor)
);

ALTER TABLE qr_landings ENABLE ROW LEVEL SECURITY; -- service-role only

-- Incrément atomique — appelé en best-effort au rendu de la page
-- d'atterrissage : un échec de comptage ne doit jamais empêcher la page de
-- s'afficher (même philosophie que record_scan, m52).
CREATE OR REPLACE FUNCTION record_landing(
  p_restaurant_id TEXT,
  p_day           DATE,
  p_source        TEXT,
  p_visitor       TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO qr_landings (restaurant_id, day, source, visitor, count, updated_at)
  VALUES (p_restaurant_id, p_day, p_source, p_visitor, 1, NOW())
  ON CONFLICT (restaurant_id, day, source, visitor)
  DO UPDATE SET count = qr_landings.count + 1, updated_at = NOW();
$$;

REVOKE ALL     ON FUNCTION record_landing(TEXT, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_landing(TEXT, DATE, TEXT, TEXT) TO   service_role;

-- ── Vérification ──────────────────────────────────────────────────────────
--   SELECT day, source, visitor, count FROM qr_landings
--    WHERE restaurant_id = 'kraainem' ORDER BY day DESC;
