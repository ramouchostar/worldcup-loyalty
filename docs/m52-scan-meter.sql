-- ============================================================
-- M52 : Métering des scans OCR par établissement (ADR 0029 §6, Phase 3)
--
-- Compte les analyses OCR (appels Claude Vision FACTURÉS) par resto et par
-- mois calendaire. Le plafond du plan Gratuit ne BLOQUE JAMAIS personne —
-- ni le membre en plein scan, ni le resto : au-dessus du plafond, un nudge
-- de croissance POSITIF s'affiche dans la console admin (« tes clients
-- scannent — touche-les avec des promos »), c'est tout.
--
-- Distinct de m44 (rate_limits par MEMBRE/heure, anti-abus) : ici on mesure
-- le VOLUME par ÉTABLISSEMENT/mois, pour la couverture du coût OCR.
-- Service-role only (RLS activée, AUCUNE policy). Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS scan_meter (
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  month         TEXT        NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'), -- 'YYYY-MM' (Europe/Brussels)
  count         INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, month)
);
ALTER TABLE scan_meter ENABLE ROW LEVEL SECURITY; -- service-role only

-- Incrément atomique (upsert) — appelé en best-effort après chaque analyse
-- OCR : un échec de métering ne doit jamais faire échouer un scan.
CREATE OR REPLACE FUNCTION record_scan(p_restaurant_id TEXT, p_month TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO scan_meter (restaurant_id, month, count, updated_at)
  VALUES (p_restaurant_id, p_month, 1, NOW())
  ON CONFLICT (restaurant_id, month)
  DO UPDATE SET count = scan_meter.count + 1, updated_at = NOW();
$$;

REVOKE ALL     ON FUNCTION record_scan(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_scan(TEXT, TEXT) TO   service_role;
