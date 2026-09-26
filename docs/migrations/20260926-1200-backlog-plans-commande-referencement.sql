-- ============================================================
-- Backlog plateforme : chantiers des plans Croissance / Pro (ADR 0070)
--
-- QUOI. Ajoute au backlog des associés (`platform_backlog`, ADR 0033 §3) les
-- actions décidées le 2026-09-25/26 : site de commande à la marque du resto,
-- origine des commandes, référencement Google, Stripe Connect, CGU, prix.
--
-- POURQUOI. La décision (ADR 0070) n'a de valeur que si elle devient une file
-- de travail visible depuis /platform/backlog — sinon deux associés et
-- plusieurs agents repartent chacun de leur souvenir de la conversation.
--
-- RLS : inchangée — `platform_backlog` reste service-role only (RLS activée,
-- aucune policy). Aucun impact membre ni restaurateur.
--
-- Idempotente : chaque ligne n'est insérée que si aucune action du même titre
-- n'existe déjà (rejouable sans doublon, et une action renommée depuis la
-- console n'est pas recréée tant que son titre d'origine existe).
-- Impacts et efforts (1–5) = propositions de départ, à retrancher à deux :
-- la priorité se calcule (impact ÷ effort), elle ne se saisit pas.
-- ============================================================

INSERT INTO platform_backlog (title, details, area, status, impact, effort)
SELECT v.title, v.details, v.area, v.status, v.impact, v.effort
  FROM (VALUES
    ('Tester le prix : devis 299 € / 500 € à 3 prospects réels',
     'ADR 0070 §1. Avant de construire la commande en ligne : 3 devis réels (Croissance 299 € + 5 %, Pro 500 € sans commission, 3 mois min.). Si personne ne signe, revoir l''offre, pas le code.',
     'vente', 'a_faire', 5, 1),
    ('Demander l''accès à l''API Google Business Profile',
     'ADR 0070 §2 (Pro). Accès soumis à approbation de Google, délai inconnu : à lancer tout de suite. Sert au lien « Commander », aux posts et aux réponses aux avis.',
     'tech', 'a_faire', 4, 1),
    ('Brancher Stripe Connect Standard (paiement sur le compte du resto)',
     'ADR 0070 §1–2 + ADR 0029 Phase 5. Comptes Standard (aucun frais plateforme Stripe), commission prélevée via application_fee_amount (5 % Croissance, 0 % Pro). Encaissement de l''abonnement par prélèvement SEPA (≈ 1 € contre ≈ 11 € par carte).',
     'tech', 'a_faire', 5, 4),
    ('Site de commande à emporter pilote — Kraainem',
     'ADR 0070 §2. À la marque du resto (charte détectée), sous-domaine Boosteats, carte depuis menu_items (tailles ADR 0067), horaires, ruptures, temps de préparation. Points crédités à la commande sans photo de ticket. Aucun autre resto proposé sur la page. Décider comment la commande arrive en cuisine (tablette ou caisse).',
     'produit', 'idee', 5, 5),
    ('Afficher les allergènes avant l''achat en ligne (INCO 1169/2011)',
     'ADR 0070 Conséquences. Obligation légale de la vente à distance de denrées : prérequis du site de commande, pas une option.',
     'legal', 'idee', 4, 2),
    ('Origine de chaque commande + envoi des achats à Meta et Google Ads',
     'ADR 0070 §2 (Croissance). Source par commande (Instagram/Facebook, Google, QR, lien direct, WhatsApp) et API de conversion Meta / conversions Google Ads avec le vrai montant. Aucun euro côté membre (ADR 0007) : ces montants ne partent que vers les régies du resto, jamais dans track().',
     'produit', 'idee', 5, 3),
    ('Référencement Google automatisé (plan Pro)',
     'ADR 0070 §2. Domaine du resto (API Domains Vercel), données structurées Restaurant/Menu, une page par plat phare, sitemap. JAMAIS de pages par commune au texte identique (sanction Google).',
     'produit', 'idee', 4, 4),
    ('Suivi de position Google Maps + rapport mensuel (plan Pro)',
     'ADR 0070 §2 et §6. Grille autour du resto, 5 à 10 recherches, chaque semaine (mapsSearch DataForSEO, déjà branché). Mesurer le coût réel sur Kraainem (champ cost). Rapport : place sur Google, clics (Search Console), commandes par origine — jamais « grâce à nous » (ADR 0064).',
     'produit', 'idee', 4, 3),
    ('Afficher le point d''équilibre Croissance → Pro dans la console',
     'ADR 0070 §4. 299 € + 5 % × C = 500 € ⇒ C ≈ 4 020 € de commandes en ligne/mois. Message « ce mois-ci, tu aurais économisé X € en Pro ».',
     'produit', 'idee', 3, 2),
    ('Seuil Gratuit 500 tickets : prévenir à 80 % et au dépassement',
     'ADR 0070 §3. SCAN_CAP_GRATUIT = 500 (fait). Reste : alerte à 80 %, passage demandé après 2 mois consécutifs au-dessus, client jamais bloqué.',
     'produit', 'a_faire', 3, 2),
    ('CGU : commission 5 %, seuil 500 tickets, engagement Pro 3 mois',
     'ADR 0070 Conséquences. docs/legal/conditions-abonnement-restaurateur.md reste un brouillon : ajouter commission (TVA 21 %), seuil, engagement Pro, sort du domaine du resto en fin de contrat. Validation juriste avant tout encaissement.',
     'legal', 'a_faire', 4, 2),
    ('Garde-fou : jamais de points contre un avis Google',
     'ADR 0070 §5. Les demandes d''avis après commande ne créditent rien. À écrire dans CONTEXT.md et à vérifier à chaque nouveau message de séquence (ADR 0063).',
     'produit', 'a_faire', 3, 1),
    ('Carte Apple Wallet / Google Wallet du membre',
     'ADR 0070 §5. Présence sur le téléphone et rappels sans App Store, avant toute app native.',
     'produit', 'idee', 3, 3),
    ('Mesurer l''installation de l''app web avant toute app native',
     'ADR 0070 §5. Taux d''installation PWA et d''acceptation des notifications. Condition préalable à toute app native, avec la densité de restos par ville.',
     'produit', 'idee', 3, 1),
    ('Vérifier le nom « Foodcourt » (BOIP, stores) si l''idée revient',
     'ADR 0070 Alternatives. App client multi-restos écartée tant qu''il n''y a pas de densité ; nom courant, difficile à protéger et à référencer.',
     'marketing', 'idee', 1, 1)
  ) AS v(title, details, area, status, impact, effort)
 WHERE NOT EXISTS (SELECT 1 FROM platform_backlog b WHERE b.title = v.title);

-- Vérification : les 15 actions sont présentes.
SELECT COUNT(*) AS actions_adr_0070
  FROM platform_backlog
 WHERE details LIKE 'ADR 0070%';
