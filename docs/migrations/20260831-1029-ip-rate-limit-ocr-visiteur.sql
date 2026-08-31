-- ============================================================
-- 2026-08-31 10:29 — Rate-limit par IP pour l'OCR visiteur (ADR 0045)
--
-- QUOI. Depuis l'ADR 0045, /api/orders/parse-receipt (appels Claude Vision
-- FACTURÉS) accepte les appels non authentifiés (preuve du scan avant la
-- création de compte, ADR 0040 point 3 assoupli). m44 (rate_limits) ne
-- couvre que les appels authentifiés : la clé est `user_id UUID NOT NULL
-- REFERENCES profiles(id)`, inutilisable pour un visiteur anonyme.
--
-- POURQUOI. Même mécanique que check_rate_limit (m44) — fenêtre glissante,
-- verrou FOR UPDATE — mais la clé est un hash SHA-256 de l'IP appelante
-- (jamais l'IP en clair en base) au lieu d'un user_id, donc pas de FK vers
-- profiles. Table séparée plutôt que rendre user_id nullable sur
-- rate_limits : deux populations différentes (membre vs anonyme), deux
-- plafonds différents (20/h authentifié, 8/h par IP).
--
-- RLS activée sans policy = service-role only (identique à rate_limits,
-- m44) : la fonction SECURITY DEFINER est le seul point d'accès, appelée
-- par lib/rate-limit.ts::checkIpRateLimit via createAdminClient().
-- Idempotente, non-cassante.
-- ============================================================

CREATE TABLE IF NOT EXISTS ip_rate_limits (
  ip_hash      TEXT NOT NULL,
  action       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, action)
);

ALTER TABLE ip_rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table n'est jamais lue par le client ; seul le service
-- role / la fonction SECURITY DEFINER y accèdent.

CREATE OR REPLACE FUNCTION check_ip_rate_limit(
  p_ip_hash TEXT,
  p_action TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  INSERT INTO ip_rate_limits (ip_hash, action, window_start, count)
  VALUES (p_ip_hash, p_action, NOW(), 0)
  ON CONFLICT (ip_hash, action) DO NOTHING;

  SELECT window_start, count INTO v_window_start, v_count
  FROM ip_rate_limits
  WHERE ip_hash = p_ip_hash AND action = p_action
  FOR UPDATE;

  -- Fenêtre expirée → on repart à 1
  IF v_window_start < NOW() - make_interval(secs => p_window_seconds) THEN
    UPDATE ip_rate_limits SET window_start = NOW(), count = 1
    WHERE ip_hash = p_ip_hash AND action = p_action;
    RETURN TRUE;
  END IF;

  -- Sous le quota → on incrémente et on autorise
  IF v_count < p_max THEN
    UPDATE ip_rate_limits SET count = count + 1
    WHERE ip_hash = p_ip_hash AND action = p_action;
    RETURN TRUE;
  END IF;

  RETURN FALSE;  -- quota atteint
END;
$$;

-- Appel réservé au service role (le client ne doit jamais l'invoquer directement).
REVOKE EXECUTE ON FUNCTION check_ip_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
