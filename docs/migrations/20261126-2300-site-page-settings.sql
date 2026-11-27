-- ============================================================
-- Ce que le restaurant règle pour sa page de commande (ADR 0109 §3, amendé le 2026-11-26 ; ADR 0108 §4)
--
-- La page lisait les horaires sur la fiche Google, et seulement là : sans eux, aucune commande. Le restaurant peut désormais
-- saisir les siens, fermer un jour ou plusieurs, écrire sa phrase de présentation et dire ce qu'il propose.
--
-- RIEN de Google n'entre dans cette table : les conditions Google Maps Platform interdisent de garder le contenu d'une fiche.
-- Les horaires saisis le sont à la main, jamais recopiés. Le téléphone et l'adresse restent dans `restaurants` (une seule
-- source). RLS activée SANS policy : service role uniquement, seul le serveur décide de ce qui sort.
--
-- `hours_source`  : 'google' (ceux de la fiche) ou 'manual' (« Les miens »).
-- `weekly_hours`  : sept jours, lundi d'abord ; par jour, zéro à deux services {"open":"11:00","close":"22:00"}. Gardés quand
--                   'google' est choisi : ils servent alors si la fiche ne dit rien ou si Google ne répond pas.
-- `closures`      : jours spéciaux et fermetures, [{"from":"2026-12-24","to":"2026-12-26"}], bornes comprises.
-- `closed_today`  : « Fermer pour aujourd'hui » : le jour de service fermé (un service commence à 5 h).
-- `offers_*`      : ce que le restaurant propose ; montré à aucun client pour l'instant.
--
-- Idempotente, non cassante. Si elle n'est pas appliquée : la page se comporte comme avant (Google seul), la console dit
-- « pas encore activé », le téléphone et l'adresse se modifient déjà.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_page_settings (
  restaurant_id        TEXT         PRIMARY KEY,
  hours_source         TEXT         NOT NULL DEFAULT 'google' CHECK (hours_source IN ('google', 'manual')),
  weekly_hours         JSONB        CHECK (weekly_hours IS NULL OR jsonb_typeof(weekly_hours) = 'array'),
  closures             JSONB        NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(closures) = 'array'),
  closed_today         DATE,
  presentation         TEXT         CHECK (presentation IS NULL OR char_length(presentation) BETWEEN 1 AND 80),
  offers_terrace       BOOLEAN      NOT NULL DEFAULT FALSE,
  offers_dine_in       BOOLEAN      NOT NULL DEFAULT FALSE,
  offers_match_screen  BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_by           UUID,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE site_page_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE site_page_settings IS
  'Réglages de la page de commande saisis par le restaurant (ADR 0109 §3) : source des horaires, horaires, fermetures, présentation, ce qu''il propose. Aucun contenu Google.';
