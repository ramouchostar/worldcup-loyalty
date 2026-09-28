-- ============================================================
-- Backlog plateforme : rapport d'audit présenté en slides (ADR 0069 / 0071)
--
-- QUOI. Ajoute au backlog des associés (`platform_backlog`, ADR 0033 §3) le
-- chantier décidé le 2026-09-27 : garder tout le contenu de l'audit, mais le
-- présenter en slides (une idée par slide, bouton « Voir le détail »), avec
-- « à faire » et « ce que Boosteats fait » sur chaque slide, et l'appel à
-- l'action en dernière slide.
--
-- POURQUOI. La page HTML actuelle est très longue : le restaurateur décroche
-- avant la fin, là où se trouvent l'offre Boosteats et le bouton d'inscription.
-- Maquette : https://claude.ai/artifact/JNxr8zwJni9LLfyiDcqbFS
--
-- RLS : inchangée — `platform_backlog` reste service-role only. Aucun impact
-- membre ni restaurateur.
--
-- Idempotente : insérée seulement si aucune action du même titre n'existe.
-- Impact et effort (1–5) = propositions de départ ; la priorité se calcule.
-- ============================================================

INSERT INTO platform_backlog (title, details, area, status, impact, effort)
SELECT v.title, v.details, v.area, v.status, v.impact, v.effort
  FROM (VALUES
    ('Rapport d''audit en slides (4 idées + appel à l''action)',
     'Décidé le 2026-09-27 (ADR 0069/0071). Mêmes informations que le rapport actuel, présentées en slides au lieu d''une longue page : 1. note globale et fiche Google, 2. ce que disent les clients (avis, bascule, thèmes), 3. les voisins sur Google Maps, 4. d''où viennent les ventes (canaux si le gérant a répondu, sinon site et Google). Chaque slide : UNE idée, 3 chiffres marquants, un visuel, « À faire de votre côté » + « Boosteats s''en charge » (levier seulement s''il est réel, lib/audit/boosteats-advantages.ts), et « Voir le détail » qui ouvre le contenu complet de l''ancienne section. Dernière slide : ce que Boosteats fait pour ce resto, objectif, 3 étapes, bouton « Démarrer gratuitement » vers l''inscription. Même URL (/audit/<nom>/v<N>-<jeton>, /audit-gratuit), PDF à garder lisible (version imprimable = toutes les slides à la suite). Trace : suivre la slide atteinte et les clics « Voir le détail » et CTA (track(), rapport_audit), pour comparer le taux de clic CTA à la page longue. Maquette : https://claude.ai/artifact/JNxr8zwJni9LLfyiDcqbFS',
     'produit', 'a_faire', 5, 3)
  ) AS v(title, details, area, status, impact, effort)
 WHERE NOT EXISTS (SELECT 1 FROM platform_backlog b WHERE b.title = v.title);

-- Vérification : l'action est présente.
SELECT title, status, impact, effort
  FROM platform_backlog
 WHERE title = 'Rapport d''audit en slides (4 idées + appel à l''action)';
