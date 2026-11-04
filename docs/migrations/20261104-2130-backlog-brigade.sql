-- ============================================================
-- Backlog plateforme : la brigade marketing (idées que le gérant valide)
--
-- QUOI. Ajoute au backlog des associés (`platform_backlog`, ADR 0033 §3) les
-- 20 actions du chantier « Brigade », décidé le 2026-11-04 sur la maquette de
-- l'accueil (https://claude.ai/artifact/KjZz5nTT41bX8kP3a4furC) : sept
-- assistants (Nina, Léa, Hugo, Emma, Max, Louis, Chloé) préparent des idées,
-- le gérant répond oui ou non en 5 minutes par jour.
--
-- Tag : pas de colonne de tag dans la table — chaque titre commence par
-- « Brigade NN · », numéroté dans l'ordre de travail (même convention que
-- « Signaux : … »). Filtrer le tableau sur « Brigade » pour voir le chantier.
--
-- Répartition : Mehdi = le socle (ADR, table, écran, message du matin,
-- plateforme), les comptes extérieurs (Google, Meta) et Nina ; Omar = les
-- générateurs dans lib/agents/<prénom>.ts, les mesures et la landing. Chaque
-- action dit les fichiers qu'elle touche : deux actions de personnes
-- différentes ne touchent jamais le même fichier. Seul point commun :
-- lib/agents/types.ts, écrit par Mehdi dans Brigade 01 le 2026-11-05 au matin.
--
-- Échéances : 2026-11-05 et 2026-11-06 (tout le chantier en deux jours).
--
-- RLS : inchangée — `platform_backlog` reste service-role only. Aucun impact
-- membre ni restaurateur.
--
-- Idempotente : chaque ligne n'est insérée que si aucune action du même titre
-- n'existe déjà. Impacts et efforts (1–5) = propositions de départ ; la
-- priorité se calcule (impact ÷ effort). `owner` = miroir hérité de owners[1]
-- (migration 20260906-2225).
-- ============================================================

INSERT INTO platform_backlog (title, details, area, status, impact, effort, owners, owner, due_date)
SELECT v.title, v.details, v.area, v.status, v.impact, v.effort,
       v.owners, v.owners[1], v.due_date
  FROM (VALUES
    ('Brigade 01 · ADR « La brigade : des idées que le gérant valide » (à faire en premier)',
     'Décidé le 2026-11-04 (maquette de l''accueil : https://claude.ai/artifact/KjZz5nTT41bX8kP3a4furC). ADR (numéro pris sur origin/master, PR ouverte tout de suite) : un seul objet « idée » (agent_proposals) — assistant, type, contenu, coût, estimation en fourchette, statut proposée/acceptée/refusée/expirée/exécutée, préparée par le système ou l''équipe, date limite, résultat. Règles : 3 idées par jour au plus, rien ne part et aucun euro n''est dépensé sans Oui, refus en un geste avec raison, une idée non décidée expire. Contrat de code : lib/agents/types.ts (types partagés, édité par Mehdi seul) ; chaque assistant = un module pur lib/agents/<prénom>.ts (générateur testé) + un exécuteur qui appelle l''existant. Mercredi matin : c''est le contrat sur lequel Omar écrit Chloé, Hugo, Emma et Léa en parallèle.',
     'produit', 'a_faire', 5, 1, ARRAY['Mehdi'], DATE '2026-11-05'),
    ('Brigade 02 · Table agent_proposals et module d''accès',
     'Migration horodatée agent_proposals (RLS : le gérant lit et décide les idées de son établissement, écriture service-role). lib/agents/proposals.ts : créer, lister celles du jour, décider (Oui/Non/Plus tard + raison), expirer, plafond de 3 par jour par établissement. Code fail-open si la table manque. Fichiers : docs/migrations/, lib/agents/proposals.ts, lib/agents/types.ts.',
     'tech', 'a_faire', 5, 2, ARRAY['Mehdi'], DATE '2026-11-05'),
    ('Brigade 03 · Console : écran « Idées du jour » (premier onglet de la vue simple)',
     'Maquette montrée et validée AVANT de coder (bouclier). Carte d''idée : visage + prénom de l''assistant, 3 lignes (quoi, pour qui, combien), estimation, boutons Oui / Non / Plus tard, raison du refus en un geste ; état vide « Rien pour aujourd''hui ». Remplace l''accueil en tête de la vue simple sans retirer aucune page (ADR 0064) ; primitives components/admin/ui (ADR 0054). Fichiers : app/admin/[restaurantId]/idees/**, lib/admin-nav.ts (seul ce chantier y touche).',
     'produit', 'a_faire', 5, 3, ARRAY['Mehdi'], DATE '2026-11-05'),
    ('Brigade 04 · Plateforme : préparer une idée à la main pour un restaurant',
     'Formulaire dans /platform qui crée une idée « préparée par l''équipe » pour un établissement (même carte côté gérant). Permet de tenir la promesse dès le premier jour à Houba et De Bue, avant que tous les générateurs existent. Fichiers : app/platform/idees/** uniquement.',
     'ops', 'a_faire', 5, 1, ARRAY['Mehdi'], DATE '2026-11-05'),
    ('Brigade 05 · Le message du matin : « Hugo et Emma ont 2 idées pour toi »',
     'Cron vers 9 h (Europe/Brussels) : un seul message par gérant s''il a au moins une idée, par e-mail via dispatch (lib/email.ts, nouvelle clé dans lib/message-catalog.ts, journalisé dans message_sends) et push console si activé (lib/console-push.ts). Lien direct vers l''idée ; tout ce qui dépense (pub) exige la connexion. WhatsApp branché dès que les modèles Meta sont validés (Brigade 16). Fichiers : app/api/cron/morning-ideas/**, lib/email-templates/pro-ideas.ts.',
     'tech', 'a_faire', 5, 2, ARRAY['Mehdi'], DATE '2026-11-06'),
    ('Brigade 06 · Mesures de la brigade sur /platform',
     'La trace (ADR 0065) : par établissement et par assistant, part des jours où le gérant ouvre ses idées, part des idées décidées, délai de décision, temps passé par jour (on promet 5 min), taux de Oui (alerte sous 30 %), raisons de refus, résultat des idées exécutées (clients revenus contre groupe témoin, ADR 0063). Lecture seule de agent_proposals. Fichiers : app/platform/brigade/** uniquement.',
     'produit', 'a_faire', 4, 2, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 07 · Chloé : les opportunités deviennent des idées',
     'Module pur lib/agents/chloe.ts (+ tests) : à partir de lib/insights.ts (jour creux, promo sur un plat avec remise sûre, menus), produit une idée « Le jeudi est ton jour le plus calme : je demande à Hugo une promo ? ». Sur Oui, crée l''idée d''Hugo correspondante (relais entre assistants). Réutiliser insights.ts, ne rien dupliquer. Ne touche ni à la console ni à la base hors lib/agents/proposals.ts.',
     'tech', 'a_faire', 5, 2, ARRAY['Omar'], DATE '2026-11-05'),
    ('Brigade 08 · Hugo : relancer les clients qui ne reviennent plus',
     'Module lib/agents/hugo.ts (+ tests) : clients sans ticket depuis 21 jours (seuil à mesurer), anniversaire, relais de Chloé. Brouillon du message écrit pour le gérant, coût maximum en cadeaux. Exécuteur sur Oui : lib/broadcast.ts en nature « promo » (consentement exigé, ADR 0039 ; plafond 2/semaine/membre ; groupe témoin 10 %, ADR 0063). Zéro euro côté membre (ADR 0007). Fichiers : lib/agents/hugo.ts, lib/agents/execute-hugo.ts.',
     'tech', 'a_faire', 5, 3, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 09 · Chloé : rappel du CA du jour',
     'Quand le CA d''hier n''est pas noté, une idée « Tu n''as pas noté hier : 30 secondes ? » qui ouvre le formulaire existant (ADR 0087). Seuil de révision déjà décidé : moins de la moitié des jours notés après 2 semaines. Fichier : lib/agents/chloe-ca.ts.',
     'produit', 'a_faire', 3, 1, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 10 · Emma : la pub proposée au gérant (inverser le parcours Pub)',
     'Module lib/agents/emma.ts : idée de campagne (offre tirée des opportunités, repère 10–15 €/jour, rayon 3 km, estimation en fourchette via lib/ads/estimate.ts). Sur Oui : crée la demande ad_requests existante, virement inchangé, la validation de Mehdi reste derrière. Amender l''ADR 0086 (qui propose : Emma ; qui valide : le gérant puis Mehdi). Fichiers : lib/agents/emma.ts, app/admin/[restaurantId]/pub/actions.ts (seul chantier sur ce fichier).',
     'produit', 'a_faire', 5, 3, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 11 · Léa : tickets à vérifier et cadeaux à ajouter',
     'Module lib/agents/lea.ts : les tickets en file (onglet Commandes, ADR 0052) et les suggestions de cadeaux du catalogue (coût ≤ taux choisi, ADR 0017/0068) arrivent comme idées. Sur Oui : appelle les actions existantes, rien de nouveau côté membre. Fichier : lib/agents/lea.ts.',
     'produit', 'a_faire', 3, 1, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 12 · Google : demander l''accès à l''API Business Profile',
     'Bloquant pour Louis (avis) et Max (fiche) : l''accès à l''API Google Business Profile se demande à Google (formulaire, délai de plusieurs jours possible). À faire dès mercredi matin avec le projet Google Cloud de GOOGLE_PLACES_API_KEY. Noter la date de la demande et la réponse ici.',
     'ops', 'a_faire', 5, 1, ARRAY['Mehdi'], DATE '2026-11-05'),
    ('Brigade 13 · Louis : réponses aux avis Google validées par le gérant',
     'Dépend de Brigade 12 (accès API) et d''une fiche gérée sur invitation (ADR 0082). Module lib/agents/louis.ts : lit les nouveaux avis, brouillon de réponse écrit par Claude (poli, court, jamais de promesse), le gérant valide ou modifie, publication par l''API. Tant que l''accès manque : l''équipe prépare la réponse via Brigade 04 et la publie à la main. Fichier : lib/agents/louis.ts.',
     'produit', 'a_faire', 4, 3, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 14 · Max : les constats de l''analyse deviennent des idées',
     'Module lib/agents/max.ts : les constats de l''audit (horaires manquants, photos, lien de commande, avis sans réponse — ADR 0069/0071) deviennent des idées « Tes horaires du dimanche manquent : je les ajoute ? ». Exécution sur la fiche gérée quand l''API est là (Brigade 12), sinon par l''équipe. Rapport mensuel de place sur Google Maps (ADR 0088). Fichier : lib/agents/max.ts.',
     'produit', 'a_faire', 4, 2, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 15 · Nina : livrer le pilote du site Houba et suivre les clics « Commander »',
     'ADR 0088 (sous-domaine Boosteats, construit depuis la base, bouton Commander vers la commande existante du resto, sinon Appeler, sinon Itinéraire — aucune commande ni paiement chez nous). Idées de Nina : « Ton site est prêt, je le mets en ligne ? », « Je mets la promo de la semaine à la une ? ». Pour un resto qui a déjà un site : liens suivis (utm) posés par Max, Emma et Hugo, pour compter les clics. Fichiers : app/(site)/** et lib/agents/nina.ts.',
     'produit', 'a_faire', 5, 4, ARRAY['Mehdi'], DATE '2026-11-06'),
    ('Brigade 16 · WhatsApp : soumettre les modèles du message du matin à Meta',
     'Les messages WhatsApp à l''initiative de l''entreprise exigent des modèles validés par Meta (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN déjà configurés). Soumettre « Tes idées du jour » et « Ta pub est prête » dès mercredi ; noter la date de validation. Tant que ce n''est pas validé : e-mail seul (Brigade 05).',
     'ops', 'a_faire', 4, 1, ARRAY['Mehdi'], DATE '2026-11-05'),
    ('Brigade 17 · Landing : intégrer la brigade sur le site (après Brigade 03 et 08 en ligne)',
     'Depuis la maquette validée (https://claude.ai/artifact/KjZz5nTT41bX8kP3a4furC) : héros, brigade de 7, section site de Nina, 5 minutes par jour, analyse gratuite (Pizza Joe), cas Kraainem +95 %, tarifs, FAQ. Ne passe en ligne que quand l''écran Idées du jour tourne (jamais une fonction non livrée au présent, ADR 0070). Fichiers : components/restaurateurs/** uniquement ; test lib/marketing-pages.test.ts vert.',
     'marketing', 'a_faire', 5, 3, ARRAY['Omar'], DATE '2026-11-06'),
    ('Brigade 18 · Portraits définitifs des 7 assistants',
     'La maquette utilise des photos Unsplash de vraies personnes. Pour la production : 7 personnages créés pour nous (même direction artistique, tablier Boosteats), ou accord écrit. Livrer les fichiers dans public/marketing/brigade/ pour Brigade 17.',
     'marketing', 'a_faire', 3, 1, ARRAY['Mehdi'], DATE '2026-11-06'),
    ('Brigade 19 · Mettre à jour CLAUDE.md, CONTEXT.md et la fiche marketing',
     'Après les ADR de la brigade et de l''ADR 0086 amendé : glossaire (idée, assistant, les 7 prénoms et leurs postes), statut de l''ADR 0088 (Max et Nina présentés comme disponibles en Pro), .claude/product-marketing.md (message « faire monter votre chiffre d''affaires », brigade, mots à éviter).',
     'produit', 'a_faire', 3, 1, ARRAY['Mehdi'], DATE '2026-11-06'),
    ('Brigade 20 · Vérifier les commissions Uber Eats et Deliveroo en Belgique',
     'La landing affiche « commande de 25 € : − 7,50 €, jusqu''à 30 % selon votre contrat ». À vérifier sur un vrai contrat (Houba, De Bue ou Kraainem, avec accord) avant la mise en ligne de Brigade 17 ; corriger le chiffre sinon.',
     'vente', 'a_faire', 3, 1, ARRAY['Mehdi'], DATE '2026-11-06')
  ) AS v(title, details, area, status, impact, effort, owners, due_date)
 WHERE NOT EXISTS (SELECT 1 FROM platform_backlog b WHERE b.title = v.title);

-- Vérification : les 20 actions sont présentes, dans l'ordre.
SELECT title, status, owners, impact, effort, due_date
  FROM platform_backlog
 WHERE title LIKE 'Brigade __ · %'
 ORDER BY title;
