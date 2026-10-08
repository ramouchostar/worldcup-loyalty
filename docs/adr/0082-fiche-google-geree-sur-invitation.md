# ADR 0082 — Boosteats gère la fiche Google sur invitation, jamais comme propriétaire

**Statut** : Accepté (2026-10-08). Décidé par le porteur en session, après examen de trois
voies (connexion Google, demande de propriété, invitation). L'écran d'invitation reste à
**valider sur maquette** avant d'être codé (ADR 0065). Ce document prolonge le bloc
« Réputation » de l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md) §2
et l'inscription de l'[ADR 0075](0075-inscription-restaurateur-google-multi-etablissements.md).
Il n'amende pas l'ADR 0075 §4 : l'accès à la fiche n'est pas une condition de validation. Il
alimente l'import du catalogue menu de l'[ADR 0083](0083-le-catalogue-menu-s-importe.md). Il
n'amende ni l'ADR 0007 ni l'ADR 0025.

## Contexte

L'ADR 0074 fait de la réputation l'un des quatre blocs du produit : demander des avis après la
visite, y répondre, suivre la note, soigner la fiche Google. Aujourd'hui, nous ne lisons que la
partie publique de la fiche : Places API, clé `GOOGLE_PLACES_API_KEY`, `lib/audit/places.ts`.
Cette lecture donne la note, le nombre d'avis et **cinq avis au plus**. Elle ne permet ni de
répondre, ni de modifier la fiche, ni de lire la carte ou les liens de commande que le gérant y
a enregistrés.

Pour aller plus loin, il faut que le restaurateur nous donne accès à sa fiche. Trois voies ont
été examinées le 2026-10-08 :

1. **Connexion Google avec l'autorisation `business.manage`** : un bouton « Autoriser » à
   l'inscription. Un seul geste pour lui, mais quatre problèmes :
   - Google classe cette autorisation comme **sensible**. L'écran de consentement doit être
     validé par Google (politique de confidentialité, domaine vérifié, vidéo), et avant cette
     validation tout compte non testeur est refusé (erreur 403).
   - Il faudrait garder un jeton par restaurateur, chiffré, et gérer sa révocation.
   - Il ne faut jamais que la connexion Google des **membres** demande cet accès.
   - Cas fréquent : le compte Google du gérant n'est pas celui qui gère la fiche (un associé,
     un proche, une ancienne agence).
2. **Demander la propriété de la fiche** depuis le compte Boosteats. Google écrit au
   propriétaire « quelqu'un demande la propriété de votre fiche » et peut, faute de réponse,
   laisser le demandeur valider la fiche. Le restaurateur y voit une tentative de vol de fiche,
   et Google sanctionne cette pratique. Surtout, ce n'est pas notre rôle : le propriétaire peut
   supprimer la fiche ou en retirer les autres. Le jour où il nous quitte, il doit garder son
   identité sans dépendre de nous. Enfin, aucune API ne permet de faire cette demande : elle ne
   s'automatise pas.
3. **Invitation comme gestionnaire.** Le restaurateur ajoute l'adresse Boosteats dans
   « Personnes et accès » de sa fiche, avec le rôle Gestionnaire. C'est la pratique des agences.

## Décision

### 1. Boosteats est gestionnaire, jamais propriétaire

Boosteats accède aux fiches comme **gestionnaire**, par un **compte Google dédié** à la
plateforme (adresse en configuration : `GOOGLE_BUSINESS_MANAGER_EMAIL`, jamais la boîte
personnelle d'un associé). Nous ne demandons jamais la propriété d'une fiche, ni
manuellement ni autrement. Le restaurateur reste propriétaire et peut nous retirer en un clic.

### 2. L'étape « Donne-nous accès à ta fiche »

Elle apparaît à l'inscription, après le compte (ADR 0075 §1), et sur la page d'avancement tant
que l'accès n'est pas reçu. On la retrouve ensuite dans la console. Elle tient en trois gestes
illustrés :

1. un bouton qui ouvre la fiche Google du restaurateur, aux paramètres d'accès ;
2. l'adresse Boosteats, à copier d'un clic ;
3. le rôle **Gestionnaire**, puis valider.

L'étape est **facultative**. Le bouton « Plus tard » ne bloque ni l'inscription ni la
validation de l'établissement. Une fiche absente de Google (« Saisir à la main », ADR 0075)
n'affiche pas l'étape.

### 3. L'accès se lit dans les données, il ne se déclare pas

Une tâche planifiée liste les invitations reçues par le compte Boosteats (Account Management
API, `accounts.invitations`). Elle n'**accepte** une invitation que si la fiche invitée
correspond au `google_place_id` d'un établissement du réseau. Une invitation pour une fiche
inconnue n'est **jamais acceptée à l'aveugle** : elle est listée sur `/platform`. L'étape passe
au vert quand l'accès est effectif, comme toutes les étapes (ADR 0064, ADR 0075 §3).

Tant que Google n'a pas ouvert le quota de l'API (voir § Prérequis), un super-admin accepte
les invitations depuis l'interface Google et marque l'accès sur `/platform`. Cette saisie est
tracée comme manuelle (`source = 'manual'`) et disparaît quand la tâche planifiée prend le
relais.

### 4. Ce que l'accès permet, et ce qu'il ne permet pas sans accord

- **Lire** tous les avis, la carte enregistrée sur la fiche et les liens de commande. La carte
  et les liens sont une source d'import du catalogue menu (ADR 0083).
- **Répondre aux avis** : Boosteats prépare la réponse, et **rien n'est publié sans la
  validation du restaurateur**. Une réponse automatique est une décision à part, qui demandera
  un ADR.
- **Optimiser la fiche** (catégories, horaires, description, photos) : chaque modification est
  proposée, puis appliquée après accord.
- **Toute écriture sur la fiche est journalisée** : qui, quoi, valeur avant et après, réponse de
  Google. Aucune écriture ne se fait en silence.

### 5. Le retrait

S'il nous retire, la fiche disparaît de la liste du compte Boosteats. La tâche planifiée le
détecte et la console affiche « Accès à la fiche retiré », avec l'étape pour nous réinviter.
Le suivi de la note retombe sur la lecture publique par Places. Rien ne casse.

## Prérequis externes (avant tout code d'API)

1. **Accès à l'API Business Profile.** Le formulaire de demande est envoyé depuis le compte
   Boosteats, qui doit être propriétaire ou gestionnaire d'une fiche vérifiée. Tant que la
   demande n'est pas approuvée, le quota reste à 0. Approuvé, il passe à 300 requêtes par minute.
2. **Écran de consentement.** Seul le compte Boosteats se connecte, ce qui évite la validation
   d'application ouverte au public, la plus lourde. À vérifier : avec un compte Google Workspace
   (domaine boosteats.be), une application « Interne » ne demande pas de validation. Avec une
   application en mode « Test », le jeton expire au bout de 7 jours, ce qui ne convient pas à une
   tâche planifiée.

Le délai est de plusieurs semaines. On peut construire l'étape d'invitation et l'acceptation
manuelle sans attendre.

## Conséquences

- **Données** : une table des accès aux fiches (établissement, `google_place_id`, nom de la
  ressource Google, état reçu, accepté, retiré ou refusé, source automatique ou manuelle, dates)
  et un journal des écritures sur les fiches. Migration horodatée, code tolérant à son absence.
- **Jeton** : un seul jeton (celui du compte Boosteats), stocké côté serveur. Aucun jeton par
  restaurateur.
- **Trace** (ADR 0065) :
  - entonnoir de l'étape : affichée, bouton de la fiche ouvert, adresse copiée, invitation
    reçue, acceptée ;
  - délai entre l'étape et l'invitation ;
  - invitations de fiches inconnues ;
  - accès retirés ;
  - appels d'API en échec, journalisés avec leur cause.
  
  Le seuil d'alerte est fixé à **moins de 50 % d'invitations reçues sous 7 jours**. Au-delà de ce
  seuil, l'étape en trois gestes ne suffit pas. Il faudra alors une aide (vidéo, WhatsApp,
  appel) ou rouvrir la voie de la connexion Google.
- **Échos à suivre dans les PR d'implémentation** :
  - la politique de confidentialité et le registre des traitements (les avis contiennent les
    noms de leurs auteurs, ADR 0025 ; la branche de la politique de confidentialité pour la
    validation Google est en cours) ;
  - les conditions restaurateurs (Boosteats agit comme gestionnaire, sur accord) ;
  - l'action du backlog « Avis Google : suivre note et nombre d'avis » : la lecture publique reste
    la base pour les fiches sans accès ;
  - l'audit (ADR 0069, 0071) et le CRM (ADR 0076), où l'invitation peut devenir l'argument
    « on s'occupe de ta fiche » ;
  - `CONTEXT.md`.

## Alternatives rejetées

- **Connexion Google avec `business.manage`** : la validation Google la plus lourde, un jeton
  par restaurateur, et le problème du mauvais compte. Elle reste la voie de secours si le seuil
  d'alerte ci-dessus est dépassé.
- **Demande de propriété** : elle ressemble à une tentative de vol de fiche, elle est sanctionnée
  par Google, elle donne trop de pouvoir et elle ne s'automatise pas.
- **Lecture automatique des pages Google Maps (scraping)** : fragile, contraire aux conditions
  de Google, et elle ne permet aucune écriture.
