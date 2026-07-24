-- ============================================================
-- M44 : Rate-limit générique (finding F8) — compteur en base par (user, action)
--
-- Bride l'endpoint OCR /api/orders/parse-receipt (appels Claude Vision
-- FACTURÉS) contre l'épuisement de budget API par un compte qui scripterait
-- des milliers d'appels. Réutilisable pour d'autres endpoints coûteux.
-- Accès réservé au service role via la fonction SECURITY DEFINER (le code
-- appelle check_rate_limit avec createAdminClient).
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table n'est jamais lue par le client ; seul le service
-- role / la fonction SECURITY DEFINER y accèdent.

-- Atomique (verrou FOR UPDATE sur la ligne) : renvoie TRUE si l'appel est
-- autorisé (sous le quota), FALSE s'il est bridé. Fenêtre glissante simple :
-- réinitialisée dès qu'elle a expiré.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
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
  INSERT INTO rate_limits (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, NOW(), 0)
  ON CONFLICT (user_id, action) DO NOTHING;

  SELECT window_start, count INTO v_window_start, v_count
  FROM rate_limits
  WHERE user_id = p_user_id AND action = p_action
  FOR UPDATE;

  -- Fenêtre expirée → on repart à 1
  IF v_window_start < NOW() - make_interval(secs => p_window_seconds) THEN
    UPDATE rate_limits SET window_start = NOW(), count = 1
    WHERE user_id = p_user_id AND action = p_action;
    RETURN TRUE;
  END IF;

  -- Sous le quota → on incrémente et on autorise
  IF v_count < p_max THEN
    UPDATE rate_limits SET count = count + 1
    WHERE user_id = p_user_id AND action = p_action;
    RETURN TRUE;
  END IF;

  RETURN FALSE;  -- quota atteint
END;
$$;

-- Appel réservé au service role (le client ne doit jamais l'invoquer directement).
REVOKE EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
