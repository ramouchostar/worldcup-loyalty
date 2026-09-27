-- ============================================================
-- Backlog plateforme : choix du design des QR + bibliothèque de designs
--
-- QUOI. Ajoute au backlog des associés (`platform_backlog`, ADR 0033 §3) deux
-- chantiers décidés le 2026-09-27 :
--   1. une pop-up console qui fait choisir un design de QR (carrousel) et
--      rappelle d'imprimer — nouveaux restaurateurs ET restaurateurs existants ;
--   2. une bibliothèque de designs QR, fidèle au maximum à l'identité du resto.
--
-- POURQUOI. Aujourd'hui seuls les trois Belchicken ont un design dédié
-- (lib/qr-template.ts, PR #251), les autres gardent le template générique, et
-- rien ne dit au restaurateur que ses QR ne sont pas encore imprimés. Pas de QR
-- en salle = pas de scans = pas de données pour piloter son marketing.
--
-- RLS : inchangée — `platform_backlog` reste service-role only (RLS activée,
-- aucune policy). Aucun impact membre ni restaurateur.
--
-- Idempotente : chaque ligne n'est insérée que si aucune action du même titre
-- n'existe déjà. Impacts et efforts (1–5) = propositions de départ, à
-- retrancher à deux : la priorité se calcule (impact ÷ effort).
-- ============================================================

INSERT INTO platform_backlog (title, details, area, status, impact, effort)
SELECT v.title, v.details, v.area, v.status, v.impact, v.effort
  FROM (VALUES
    ('Pop-up console : choisir un design de QR et l''imprimer',
     'Décidé le 2026-09-27. Pop-up à l''ouverture de la console tant que le restaurateur n''a pas choisi ET imprimé ses QR — pour les nouveaux comme pour les établissements existants (envoyer aussi une notification). Question : « Avez-vous bien imprimé vos QR codes ? ». Expliquer l''enjeu : plus de QR visibles en salle = plus de scans = plus de données clients = de meilleures performances marketing (ciblage, relances, mesure). Carrousel des designs disponibles (bibliothèque) pour choisir, et rappeler qu''on peut changer de design à tout moment. Bouclier (ADR 0065) : définir comment on sait qu''un QR est « imprimé » (clic Imprimer/Télécharger sur qr/print, confirmation du restaurateur, premiers scans) et compter l''entonnoir pop-up vue → design choisi → impression → premiers scans. Console : primitives components/admin/ui, couleurs Boosteats (ADR 0054) ; les aperçus de QR, eux, portent la charte du resto (exception supports imprimables). Ne pas doublonner la tâche « QR de l''équipe en salle » de l''accueil simple (ADR 0064) : la relier.',
     'produit', 'a_faire', 5, 3),
    ('Bibliothèque de designs QR fidèles à l''identité du resto',
     'Décidé le 2026-09-27. Plusieurs modèles de supports QR (chevalet, affiche vitrine, sticker comptoir…) au lieu du seul template générique + Belchicken (lib/qr-template.ts, liste codée en dur). Exigence n° 1 : fidélité MAXIMALE à l''identité du client — logo, couleurs, typographies, ton, détectés depuis sa charte (lib/design-detect.ts, lib/branding.ts) puis validés par le restaurateur ; un design qui ne ressemble pas au resto ne sort pas. Garder les invariants d''impression : QR noir pur niveau H, contraste, zone de silence, copy bilingue FR/NL selon l''établissement. Le choix est stocké par établissement (plus de liste d''identifiants dans le code). Montrer les rendus avant de construire (bouclier ADR 0065 : apparence). Alimente le carrousel de la pop-up « choisir un design de QR ».',
     'produit', 'idee', 4, 4)
  ) AS v(title, details, area, status, impact, effort)
 WHERE NOT EXISTS (SELECT 1 FROM platform_backlog b WHERE b.title = v.title);

-- Vérification : les 2 actions sont présentes.
SELECT title, status, impact, effort
  FROM platform_backlog
 WHERE details LIKE 'Décidé le 2026-09-27%';
