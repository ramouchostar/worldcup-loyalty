-- ============================================================
-- M57 : Amorce backlog — audit fiche Google My Business via Claude Vision
--
-- Idée produit demandée par le porteur (2026-08-16) : donner à chaque
-- restaurateur un score + des pistes d'amélioration concrètes sur sa fiche
-- Google My Business (photos, infos, avis...), à partir d'un ou plusieurs
-- captures/screenshots analysés par Claude Vision. Offerte dans l'offre
-- GRATUITE (ADR 0029 §3 : le cœur gratuit reste le moteur d'acquisition/
-- rétention, pas un levier de prix).
--
-- Aucun changement de schéma : `platform_backlog` existe déjà (m56, ADR
-- 0033 §3). Ce script se contente d'y ajouter UN item, de façon idempotente
-- (sûr à rejouer — ne duplique pas si le titre existe déjà).
--
-- Impact/effort ci-dessous sont une PROPOSITION de départ, à retrancher à
-- deux (même remarque que le §4 de m56) :
--   - Impact 4 : différenciateur pour l'offre gratuite (ADR 0029 — le
--     gratuit fabrique le verrou membres et la donnée ; un outil qui aide
--     concrètement le restaurateur à être visible renforce l'adhérence
--     sans toucher au paywall analytique).
--   - Effort 3 : pas de nouveau socle technique — même famille que la
--     détection de design (lib/design-detect.ts, m48) qui fait déjà un
--     appel Claude Vision à partir d'un screenshot best-effort. Le travail
--     est surtout : récupérer/faire uploader une capture de la fiche GMB
--     (pas d'API Google officielle gratuite équivalente à mShots), définir
--     la grille de score, et l'écran admin qui l'affiche.
--
-- Rappel ADR 0007 : cette fonctionnalité est côté RESTAURATEUR (console
-- admin), jamais côté membre — aucun euro, aucun CA à afficher ici de toute
-- façon, donc pas de risque de régression ADR 0007 par construction.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform_backlog
     WHERE title = 'Audit fiche Google My Business via Claude Vision (score + pistes d''amélioration)'
  ) THEN
    INSERT INTO platform_backlog (title, details, area, status, impact, effort) VALUES
      ('Audit fiche Google My Business via Claude Vision (score + pistes d''amélioration)',
       'Analyser la fiche GMB d''un établissement (captures photos/infos/avis) avec Claude Vision pour donner un score et des recommandations concrètes d''amélioration. À offrir dans l''offre GRATUITE (ADR 0029 §3 — pas un levier de prix, un outil d''adhérence). Techniquement proche de la détection de design (lib/design-detect.ts, m48) : même famille de pipeline (capture best-effort + un appel vision), à adapter pour une fiche GMB plutôt qu''un site web. Reste à trancher : source de la capture (upload manuel par le restaurateur vs. scraping best-effort), grille de score, et où l''afficher dans /admin/[restaurantId].',
       'produit', 'idee', 4, 3);
  END IF;
END $$;

-- Vérification
SELECT id, title, area, status, impact, effort
  FROM platform_backlog
 WHERE title = 'Audit fiche Google My Business via Claude Vision (score + pistes d''amélioration)';
