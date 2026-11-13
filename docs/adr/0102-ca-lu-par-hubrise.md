# ADR 0102 — Le CA se lit par HubRise, en lecture seule, d'abord à côté de la saisie

**Statut** : Proposé (2026-11-13) — décidé par le porteur en session, à valider. Pilote :
Belchicken Kraainem. Amende l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md)
(la lecture seule d'une caisse par une API tierce commence dès un établissement pilote, pas à 10-30)
et l'[ADR 0087](0087-ca-du-jour-saisi-dans-la-console.md) §6 (une connexion existe désormais pour les
caisses présentes sur HubRise ; un jeton d'accès est stocké). Appliqué avec le bouclier de l'[ADR
0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le CA du jour se saisit à la main (ADR 0078, 0087) et le geste s'arrête dès qu'on cesse de
rappeler. Le porteur a ouvert un accès **HubRise** (concentrateur de commandes : caisses et
plateformes de livraison envoient leurs commandes à HubRise, qui les redistribue aux applications
autorisées). Constat du 2026-11-13, sur le back-office HubRise :

- Compte « Belchicken Kraainem » (`1y43q`), point de vente Kraainem (`1y43q-0`).
- **Une seule connexion : Uber Eats Bridge**, branchée le 13/11/2026. La caisse du restaurant n'est
  pas sur HubRise : on ne voit que les commandes Uber Eats, pas la carte, le cash ni les autres
  plateformes.
- HubRise ne reçoit que les commandes **postérieures à la connexion** : pas d'historique.
- Client OAuth « Boosteats » créé côté développeur (identifiant et secret dans Vercel :
  `HUBRISE_CLIENT_ID`, `HUBRISE_CLIENT_SECRET`).

L'ADR 0074 voulait une API unifiée tierce, en lecture seule, pour **mesurer** — c'est exactement
HubRise — mais « à partir de 10 à 30 établissements ». Attendre ces volumes, c'est rester sur la
saisie manuelle qui s'essouffle ; un pilote sur un établissement coûte peu et dit si la source est
fiable.

## Décision

### 1. Lecture seule, droits minimaux

- Boosteats est une application HubRise **en lecture** : portée `location[orders.read]`, un point de
  vente à la fois. Jamais d'écriture (ni commande, ni catalogue, ni statut) : l'ADR 0074 reste vrai.
- Les **fiches clients ne sont pas demandées**. Les commandes en contiennent pourtant (nom,
  téléphone, adresse de livraison) : elles sont **retirées avant tout stockage** (ADR 0025,
  minimisation). On garde : n° de commande HubRise, date, canal, type de service, statut, total,
  remises, frais, articles (nom, quantité, prix).
- La connexion se fait par le flux OAuth de HubRise, lancé **par un super-admin** depuis `/platform`
  pendant le pilote (pas encore depuis la console du restaurateur). Le jeton d'accès (sans
  expiration chez HubRise) est rangé dans **Supabase Vault** ; la table de connexion ne garde que
  sa référence. Déconnexion = révocation côté HubRise + date de fin chez nous ; on ne supprime pas
  les commandes déjà lues.

### 2. Recevoir et rattraper

- HubRise prévient Boosteats à chaque commande créée ou modifiée (rappel `order.create` /
  `order.update`) ; chaque appel est **vérifié par sa signature HMAC** (secret client), sinon refusé.
- Un **rattrapage chaque nuit** relit les commandes de la veille par l'API : un appel perdu ne fait
  jamais perdre une vente. Une commande est identifiée par son n° HubRise (insertion idempotente,
  la dernière version gagne).

### 3. Le jour de vente et ce qui compte

- Jour de vente = date à Bruxelles, **un passage après minuit vaut pour la veille** jusqu'à 5 h
  (même règle que les rappels de l'ADR 0087 §4).
- Comptent les commandes non annulées : les statuts `rejected`, `cancelled`, `delivery_failed` sont
  exclus. Le montant retenu est le **total payé par le client, TVA comprise**, avant la commission de
  la plateforme — c'est ce que l'ADR 0087 appelle la ligne « Uber Eats ». À vérifier (§4).

### 4. D'abord à côté, jamais à la place — tant que l'écart n'est pas mesuré

- **Phase 1 (mesure)** : le chiffre HubRise par canal s'affiche sur `/platform/ca`, **à côté** du
  chiffre de référence (saisie du restaurateur ou relevé Uber Eats Manager). Rien n'est écrit dans
  `daily_revenue_entries` ni `restaurant_sales` : une ligne Uber seule passerait pour un CA du jour
  effondré dans toutes les comparaisons, prévisions et paliers (ADR 0081).
- **Phase 2 (pré-remplissage)** : après **14 jours** avec un écart quotidien ≤ **2 %** sur un canal,
  ce canal est pré-rempli dans la saisie de la console ; le restaurateur valide toujours le total.
  La valeur garde sa source (`hubrise`).
- **Phase 3 (total sans saisie)** : seulement quand **la caisse elle-même** est sur HubRise et a
  passé la même épreuve. Elle fera l'objet d'un amendement de cet ADR.

### 5. Coûts et extension

HubRise (abonnement par point de vente) et ses ponts (Uber Eats Bridge, connecteur de caisse) sont
payants. Le coût par établissement est relevé pendant le pilote ; l'extension à Houba et De Bue se
décide sur ce coût et sur l'existence d'un connecteur HubRise pour la caisse Belchicken.

## Conséquences

- Migration : `pos_connections` (établissement, fournisseur `hubrise`, compte et point de vente
  HubRise, référence du jeton dans Vault, dates de connexion et de fin) et `pos_orders` (une ligne
  par commande, sans donnée client, jour de vente calculé). RLS activée, lecture et écriture par le
  service seulement. Code tolérant à leur absence.
- Routes : lancement et retour OAuth (`/api/hubrise/connect`, `/api/hubrise/callback`), rappels
  (`/api/webhooks/hubrise`), cron de rattrapage nocturne.
- **Trace** : par jour et par canal, chiffre HubRise, chiffre de référence, écart en € et en % ;
  commandes reçues par rappel ÷ commandes relues la nuit (un rappel perdu se voit) ; rappels à
  signature refusée ; jeton révoqué (erreur 401 dite sur `/platform`, jamais silencieuse).
- **ADR 0007 inchangé** : ces chiffres restent dans `/platform` puis la console ; rien vers un membre.
- `CONTEXT.md` : terme « Connexion caisse » ; `CLAUDE.md` : variables `HUBRISE_CLIENT_ID`,
  `HUBRISE_CLIENT_SECRET`.

## Alternatives rejetées

- **Chift ou autre API unifiée** : rien d'ouvert aujourd'hui ; HubRise est déjà en place chez le
  pilote, avec Uber Eats branché.
- **Écrire tout de suite dans le CA du jour** : une source non mesurée qui fausse les comparaisons
  serait pire que la saisie ; l'écart se mesure d'abord.
- **Lire Uber Eats directement** : un accès par plateforme et par restaurant, des droits réservés
  aux partenaires ; HubRise les regroupe déjà.
- **Jeton en clair dans la table** : une fuite de la base ouvrirait les commandes du restaurant ;
  Vault le chiffre au repos.
