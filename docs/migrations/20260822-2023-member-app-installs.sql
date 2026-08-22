-- ============================================================
-- Installations de l'app (PWA) par membre — MESURE (complément ADR 0038)
--
-- Jusqu'ici on savait inciter à installer l'app, pas mesurer : aucun
-- enregistrement en base, et l'événement GA4 `pwa_installed` n'était jamais
-- émis (et GA4 ne voit que les visiteurs ayant accepté les cookies, sans
-- identité, et jamais iOS où `appinstalled` n'existe pas).
--
-- Signal retenu, robuste et cross-plateforme : l'app S'OUVRE en mode installé
-- (`display-mode: standalone` Android / `navigator.standalone` iOS). À chaque
-- session membre en mode installé, /api/me/app-install enregistre la 1re fois
-- (installed_at), la dernière (last_opened_at), la plateforme et compte les
-- ouvertures. Donnée de FONCTIONNEMENT du service (1re partie, jamais envoyée
-- à Google, pas de consentement cookie requis) — exportée/effacée avec le
-- compte (lib/gdpr.ts, ADR 0025).
--
-- Service-role only (RLS activée, AUCUNE policy). Idempotent. Non rétroactif :
-- seules les ouvertures postérieures au déploiement sont comptées.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_app_installs (
  user_id        UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  platform       TEXT        NOT NULL DEFAULT 'other'
                   CHECK (platform IN ('ios', 'android', 'desktop', 'other')),
  installed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 1re ouverture vue en mode installé
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opens          INTEGER     NOT NULL DEFAULT 1,
  user_agent     TEXT                                  -- tronqué côté app (≤ 200 car.)
);
ALTER TABLE member_app_installs ENABLE ROW LEVEL SECURITY; -- service-role only

CREATE INDEX IF NOT EXISTS idx_member_app_installs_last
  ON member_app_installs (last_opened_at DESC);
