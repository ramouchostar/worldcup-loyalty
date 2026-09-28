-- ============================================================
-- Backlog plateforme : « Pub autour du resto » (campagnes Meta / TikTok)
--
-- QUOI. Ajoute au backlog des associés (`platform_backlog`, ADR 0033 §3) les
-- chantiers de la fonction décidée le 2026-09-28 : depuis sa console, chaque
-- restaurateur allume ou éteint SA campagne de notoriété (vues vidéo, rayon
-- autour du resto) sur Meta et TikTok, choisit son budget par jour, et paie
-- avec un crédit prépayé. Quand le crédit est épuisé, la campagne s'arrête ;
-- il est prévenu avant.
--
-- Montage : UN compte publicitaire Boosteats, piloté par API avec un
-- System User ; une campagne par client et par plateforme, préparée à la
-- main une fois ; le lien campagne ↔ client passe par le nommage (numéro
-- client en premier), puis par l'ID enregistré.
-- Maquette : https://claude.ai/artifact/EJQT8Rz8YxCU5MtTXvGFHR
--
-- RLS : inchangée — `platform_backlog` reste service-role only. Aucun impact
-- membre ni restaurateur.
--
-- Idempotente : chaque ligne n'est insérée que si aucune action du même titre
-- n'existe déjà. Impacts et efforts (1–5) = propositions de départ ; la
-- priorité se calcule (impact ÷ effort).
-- ============================================================

INSERT INTO platform_backlog (title, details, area, status, impact, effort)
SELECT v.title, v.details, v.area, v.status, v.impact, v.effort
  FROM (VALUES
    ('Pub autour du resto : trancher l''offre avant de coder',
     'Décidé le 2026-09-28. À décider à deux : notre marge (frais de service sur chaque recharge, ou pub incluse dans le plan Croissance/Pro — ADR 0070) ; montants de recharge (50/100/200 €) et minimum ; crédit remboursable ou non ; Meta seul au départ, TikTok ensuite. Un ADR fixera ces choix. Maquette : https://claude.ai/artifact/EJQT8Rz8YxCU5MtTXvGFHR',
     'vente', 'a_faire', 5, 1),
    ('Numéro client et règle de nommage des campagnes',
     'Décidé le 2026-09-28. Colonne restaurants.client_number (B + 4 chiffres, séquentielle, jamais réutilisée). Nom : B0042_kraainem_META_VV_v1 (campagne), …_r3km-18-45_v1 (ensemble), …_crousti-vendredi_v1 (publicité). « _ » = séparateur uniquement ; plateforme (META|TIKTOK) et but (VV vues vidéo | AW notoriété) en listes fermées ; on ne renomme jamais, on recrée en v2. Le nom sert à TROUVER la campagne une fois, puis l''app enregistre l''ID Meta/TikTok et ne pilote plus que par l''ID. Contrôle chaque nuit : campagne sans client, deux actives pour le même client et la même plateforme, nom ≠ ID → alerte /platform, jamais de correction automatique.',
     'tech', 'a_faire', 4, 1),
    ('Brancher l''API Meta Marketing (System User, compte Boosteats)',
     'Décidé le 2026-09-28. System User du Business Manager Boosteats avec ads_management, jeton serveur uniquement. L''app ne fait que : lire la campagne (statut, revue), passer ACTIVE/PAUSED, changer le budget par jour AU NIVEAU CAMPAGNE, lire la dépense et les résultats (portée, ThruPlay, répétition) via Insights, et poser un plafond de dépense de campagne égal au total rechargé (filet si notre tâche horaire tombe). Chaque ensemble de publicités déclare bénéficiaire (le resto) et payeur (Boosteats), obligation UE. Chaque appel journalisé (qui, quoi, réponse) — aucun échec silencieux.',
     'tech', 'a_faire', 5, 3),
    ('Brancher l''API TikTok Business (même contrat que Meta)',
     'Décidé le 2026-09-28. Mêmes gestes que Meta (statut, budget par jour, dépense, résultats). Accès à l''API soumis à validation TikTok : demander tôt. Budgets minimum plus élevés que Meta (≈ 20 €/jour par groupe d''annonces, à confirmer) : l''écran doit l''afficher. Après Meta.',
     'tech', 'idee', 4, 3),
    ('Crédit pub prépayé : recharge, registre, alertes, arrêt automatique',
     'Décidé le 2026-09-28. Registre ad_credit_transactions (recharge Stripe, dépense, correction) — jamais de colonne solde, comme les points (ADR 0061). Tâche horaire : lit la dépense du jour par plateforme, écrit la ligne « dépense ». Moins de 2 jours de budget restants → e-mail (dispatch, ADR 0063), push et bandeau. Moins d''un jour → pause par l''API (un jour de marge car la dépense remonte avec retard). Recharge → reprise dans l''heure avec les mêmes réglages. Option : recharge automatique. Trace : écart entre dépense lue chez Meta/TikTok et dépense facturée, compté chaque mois ; jamais de crédit négatif.',
     'produit', 'a_faire', 5, 4),
    ('Écran console « Pub autour du resto »',
     'Décidé le 2026-09-28. Maquette : https://claude.ai/artifact/EJQT8Rz8YxCU5MtTXvGFHR. Dans « Plus » (vue simple) et Fidélisation/Pilotage (vue pro), ADR 0064 ; primitives components/admin/ui, couleurs Boosteats (ADR 0054). Ordre : état (en diffusion / crédit bas / en pause) → crédit + jours restants + boutons de recharge → par plateforme : interrupteur, budget par jour (pas de 5 €), estimation de portée → résultats 7 jours (portée, vidéos vues en entier, répétition, dépense) → ce qui est diffusé (zone, public, vidéo, « changer » = demande à l''équipe) → recharges et factures. Sur l''accueil simple : une ligne quand le crédit est bas. Jamais « grâce à nous » (ADR 0064) : les inscriptions au programme sont montrées « sur la même période ».',
     'produit', 'a_faire', 5, 3),
    ('Pub autour du resto : TVA, factures, conditions et risque compte unique',
     'Décidé le 2026-09-28. Meta/TikTok facturent Boosteats (autoliquidation) ; Boosteats refacture le resto avec TVA 21 % : facture à chaque recharge. Conditions d''abonnement (docs/legal) : crédit prépayé, arrêt à zéro, ce qu''on garantit ou pas (portée estimée), refus de publicité par la plateforme. Risque : un seul compte pub → une pub refusée ou un compte bloqué coupe tous les clients ; prévoir 2 ou 3 comptes dans le même Business Manager au-delà d''une dizaine de clients, et relire chaque vidéo avant mise en ligne.',
     'legal', 'a_faire', 4, 2),
    ('Mesurer ce que la pub apporte au resto',
     'Décidé le 2026-09-28. Comparer, pendant et hors campagne : nouveaux inscrits au programme, premiers tickets, scans du QR, par semaine. Montré au restaurateur « sur la même période », jamais comme un effet prouvé. Côté plateformes : portée, répétition, coût pour 1 000 personnes. Sert à dire au resto quel budget par jour vaut le coup.',
     'produit', 'idee', 3, 2)
  ) AS v(title, details, area, status, impact, effort)
 WHERE NOT EXISTS (SELECT 1 FROM platform_backlog b WHERE b.title = v.title);

-- Vérification : les 8 actions sont présentes.
SELECT title, status, impact, effort
  FROM platform_backlog
 WHERE details LIKE 'Décidé le 2026-09-28%';
