-- ============================================================
-- M46 : Seed du calendrier de référence belge (ADR 0027 §6)
--
-- Vacances scolaires des 3 communautés (FR / NL / DE) + événements nationaux,
-- du carnaval 2026 (dans la fenêtre d'historique du forecast) jusqu'à l'été
-- 2027 (année scolaire à venir).
--
-- Sources officielles / croisées (juillet 2026) :
--   FR  Fédération Wallonie-Bruxelles — RTBF + Ligue de l'Enseignement
--   NL  Vlaamse Gemeenschap          — belgieschoolvakanties.be
--   DE  Deutschsprachige Gemeinschaft — publicholidays.be / ostbelgienbildung
--
-- Divergences réelles (réforme FR 7+2 de 2022) : en 2027 le carnaval FR
-- (22/02–05/03) est décalé de 2 semaines par rapport au NL/DE (08–14/02), et
-- le congé de printemps FR (26/04–07/05) est découplé de Pâques réel. C'est
-- exactement pourquoi `restaurants.school_calendar` doit être renseigné.
--
-- expected_effect laissé à NULL pour les vacances : le SENS et l'AMPLEUR sont
-- CALIBRÉS sur l'historique de chaque resto (le moteur n'invente rien).
--
-- Idempotent : rejouable sans doublon (purge de la fenêtre seedée d'abord).
-- ⚠️ La purge efface aussi d'éventuels ajouts manuels sur 2026-02→2027-12.
-- ============================================================

BEGIN;

DELETE FROM reference_calendar WHERE starts_on BETWEEN '2026-02-01' AND '2027-12-31';

INSERT INTO reference_calendar (kind, community, starts_on, ends_on, label, expected_effect) VALUES
-- ── Communauté française (FWB) ──────────────────────────────────────────────
  ('school_holiday', 'FR', '2026-02-16', '2026-02-27', 'Congé de détente — Carnaval (FWB)',      NULL),
  ('school_holiday', 'FR', '2026-04-27', '2026-05-08', 'Congé de printemps — Pâques (FWB)',       NULL),
  ('school_holiday', 'FR', '2026-07-04', '2026-08-23', 'Vacances d''été (FWB)',                   NULL),
  ('school_holiday', 'FR', '2026-10-19', '2026-10-30', 'Congé d''automne — Toussaint (FWB)',      NULL),
  ('school_holiday', 'FR', '2026-12-21', '2027-01-01', 'Congé d''hiver — Noël (FWB)',             NULL),
  ('school_holiday', 'FR', '2027-02-22', '2027-03-05', 'Congé de détente — Carnaval (FWB)',       NULL),
  ('school_holiday', 'FR', '2027-04-26', '2027-05-07', 'Congé de printemps — Pâques (FWB)',       NULL),
  ('school_holiday', 'FR', '2027-07-03', '2027-08-29', 'Vacances d''été (FWB)',                   NULL),
-- ── Vlaamse Gemeenschap ─────────────────────────────────────────────────────
  ('school_holiday', 'NL', '2026-02-16', '2026-02-22', 'Krokusvakantie (Vlaanderen)',            NULL),
  ('school_holiday', 'NL', '2026-04-06', '2026-04-19', 'Paasvakantie (Vlaanderen)',              NULL),
  ('school_holiday', 'NL', '2026-07-01', '2026-08-31', 'Zomervakantie (Vlaanderen)',             NULL),
  ('school_holiday', 'NL', '2026-10-26', '2026-11-01', 'Herfstvakantie (Vlaanderen)',            NULL),
  ('school_holiday', 'NL', '2026-12-21', '2027-01-03', 'Kerstvakantie (Vlaanderen)',             NULL),
  ('school_holiday', 'NL', '2027-02-08', '2027-02-14', 'Krokusvakantie (Vlaanderen)',            NULL),
  ('school_holiday', 'NL', '2027-03-29', '2027-04-11', 'Paasvakantie (Vlaanderen)',              NULL),
  ('school_holiday', 'NL', '2027-07-01', '2027-08-31', 'Zomervakantie (Vlaanderen)',             NULL),
-- ── Deutschsprachige Gemeinschaft (Ostbelgien) ──────────────────────────────
  ('school_holiday', 'DE', '2026-02-16', '2026-02-20', 'Karnevalsferien (Ostbelgien)',           NULL),
  ('school_holiday', 'DE', '2026-04-06', '2026-04-17', 'Osterferien (Ostbelgien)',               NULL),
  ('school_holiday', 'DE', '2026-07-01', '2026-08-31', 'Sommerferien (Ostbelgien)',              NULL),
  ('school_holiday', 'DE', '2026-11-02', '2026-11-06', 'Herbstferien (Ostbelgien)',              NULL),
  ('school_holiday', 'DE', '2026-12-21', '2027-01-01', 'Weihnachtsferien (Ostbelgien)',          NULL),
  ('school_holiday', 'DE', '2027-02-08', '2027-02-12', 'Karnevalsferien (Ostbelgien)',           NULL),
  ('school_holiday', 'DE', '2027-03-29', '2027-04-09', 'Osterferien (Ostbelgien)',               NULL),
  ('school_holiday', 'DE', '2027-07-01', '2027-08-31', 'Sommerferien (Ostbelgien)',              NULL),
-- ── Événements nationaux / sportifs (community NULL = tous) ──────────────────
--    Maintenus par la plateforme. La Coupe du monde 2026 est dans la fenêtre
--    d'historique : documentée ici (le forecast v1 ne projette que l'avenir).
  ('national_event', NULL, '2026-06-11', '2026-07-19', 'Coupe du monde FIFA 2026',               'up');

COMMIT;
