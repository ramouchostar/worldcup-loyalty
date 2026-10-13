-- ============================================================
-- Réserver un prestataire — disponibilités et dates (ADR 0084, PR E)
--
-- Le prestataire bloque ses jours indisponibles ; le restaurateur choisit sa
-- date de tournage parmi les jours libres, APRÈS avoir accepté le devis. Deux
-- garanties vivent en base, parce que deux restaurateurs peuvent cliquer le
-- même jour au même instant :
--   - un prestataire n'a qu'UN tournage par jour (index unique partiel sur les
--     missions dont la date est réservée) ;
--   - un jour bloqué par le prestataire ne se réserve pas (vérifié par
--     l'application, tracé dans mission_events si refusé).
-- Première version : une date par jour et par prestataire (pas de créneaux
-- multiples le même jour) — assez pour 3 prestataires, à rouvrir si un
-- vidéaste veut deux tournages dans la même journée.
--
-- `provider_unavailability` : RLS activée SANS policy = service-role only.
-- Idempotente. Aucune donnée existante touchée. Sans la migration, l'espace
-- du prestataire dit que le calendrier n'est pas encore disponible et le
-- choix de date est fermé (jamais un crash, jamais une date sans contrôle).
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_unavailability (
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, day)
);

CREATE INDEX IF NOT EXISTS provider_unavailability_day_idx ON provider_unavailability (day);
ALTER TABLE provider_unavailability ENABLE ROW LEVEL SECURITY; -- service-role only

-- Un seul tournage réservé par prestataire et par jour. Les missions annulées,
-- terminées ou encore sans date ne comptent pas : le jour se libère dès
-- l'annulation.
CREATE UNIQUE INDEX IF NOT EXISTS missions_one_shoot_per_provider_day
  ON missions (provider_id, shoot_date)
  WHERE shoot_date IS NOT NULL
    AND status IN ('date_bloquee', 'production', 'livre', 'retouche', 'valide', 'suspendu', 'litige');
