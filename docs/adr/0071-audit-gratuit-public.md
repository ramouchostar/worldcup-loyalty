# ADR 0071 — L'audit gratuit se lance depuis la landing, le numéro débloque le rapport

**Statut** : Proposé (2026-09-26). Demande du porteur du même jour, maquette validée
(« Maquette audit gratuit », trois versions). **Amende l'[ADR 0069](0069-audit-restaurant-depuis-la-plateforme.md) §1**
(« pas de page publique ni d'accès restaurateur tant que le coût d'un audit n'est pas mesuré »).
N'amende ni l'ADR 0007 (aucune donnée d'audit ne descend vers un membre) ni l'ADR 0029.

## Contexte

L'audit de l'ADR 0069 sert à démarcher, mais il ne part que si l'équipe va chercher le
restaurant. Le porteur veut en faire l'appel à l'action principal de la landing : le
restaurateur trouve son établissement, voit l'analyse se faire sous ses yeux, reçoit une
note, et laisse son numéro pour recevoir la suite. C'est le modèle des « graders »
(Owner.com) : la note est la récompense immédiate, le rapport détaillé est l'échange
contre le contact.

Deux contraintes :

- **Coût** : l'audit complet (500 avis, thèmes, concurrents en grille, SEO organique) coûte
  jusqu'à 0,50 € et prend plusieurs minutes. On ne peut pas le lancer pour chaque visiteur.
- **Crédibilité** : le visiteur doit voir que c'est SA fiche qu'on lit (ses avis, ses photos,
  ses voisins), pas une animation générique.

## Décision

### 1. Deux temps : le score rapide pour tout visiteur, l'audit complet contre un numéro

- **Score rapide** (`lib/audit/quick-scan.ts`), lancé dès que le visiteur choisit son
  établissement, en moins d'une minute, environ 0,10 $ :
  Google Places API (New) — fiche, 5 avis les plus pertinents, 4 photos, voisins à 600 m —,
  la fiche DataForSEO (même grille que l'audit complet, ADR 0069 §3 A), le site et PageSpeed
  mobile. Pas d'appel Claude, pas de lecture des 500 avis, pas de recherche organique.
- **Audit complet** : l'audit de l'ADR 0069, lancé automatiquement quand un numéro est
  laissé, sur la même fiche (identifiant Places). Il suit ensuite le chemin habituel :
  relecture par l'équipe, version finale.

Le score rapide et l'audit complet partagent la grille de la fiche : seuls les volets qui
demandent plus de données (avis complets, SEO organique) peuvent faire bouger la note
finale. L'écran le dit en une ligne (« Score rapide, affiné dans le rapport complet »).

### 2. Ce que voit le visiteur est ce qu'on lit

L'écran d'analyse coche chaque étape quand sa donnée est arrivée, jamais sur un minuteur
seul (un minimum d'affichage par étape laisse le temps de lire, mais une étape ne se coche
pas avant sa donnée). À droite défilent les vraies données : voisins, fiche, avis, photos,
constats du site. Les auteurs d'avis apparaissent par leur **initiale** seulement (ADR 0025,
et ADR 0069 : aucun nom d'auteur gardé).

### 3. Garde-fous

- Recherche limitée aux 19 communes (ADR 0069 §2), revérifiée côté serveur sur le code postal
  de la fiche. Hors Bruxelles : pas de score, mais le visiteur peut laisser son numéro
  (« l'audit couvre pour l'instant Bruxelles ») — le contact est gardé.
- Plafonds : 3 analyses par adresse IP et par jour, 150 analyses par jour pour tout le site
  (`AUDIT_PUBLIC_DAILY_MAX`), suggestions de recherche limitées par IP. Une analyse refusée
  pour plafond l'affiche au visiteur, jamais en silence.
- Une même fiche analysée il y a moins de 24 h réutilise le score déjà calculé (pas de
  second appel payant).
- L'adresse IP n'est jamais stockée en clair : empreinte salée (`AUDIT_IP_SALT`).
- Le numéro sert uniquement à l'envoi de cet audit sur WhatsApp : case de consentement
  explicite, jamais de campagne (ADR 0039, 0063).

### 4. Stockage

`audit_leads` : l'établissement choisi, l'état et le résultat du score rapide (étapes et
données affichées), le numéro et son consentement, l'audit complet lié, l'envoi WhatsApp.
RLS sans policy (service role). Les analyses **sans numéro** sont gardées : elles mesurent
l'abandon entre la note et la demande de numéro.

### 5. Livraison

1. Cet ADR, `audit_leads`, la page `/audit-gratuit` (recherche, analyse, note, numéro), le
   lancement de l'audit complet, la liste des demandes dans `/platform/audit`.
2. Les boutons de la landing (« Analyser mon établissement → » en principal, le plan gratuit
   en second), après la refonte de la landing en cours (PR #236).
3. Le lien public du rapport (ADR 0069 §6) et l'envoi WhatsApp automatique à la version
   finale, avec un modèle de message approuvé par Meta.

## Conséquences

- Clé `GOOGLE_PLACES_API_KEY` (serveur uniquement) avec les API Places (New) et PageSpeed
  Insights, plafonnée dans Google Cloud. Sans clé, la page affiche « analyse indisponible »
  et propose de laisser son numéro.
- Chaque analyse enregistre ses appels et son coût : le coût réel se lit dans la console.
- Nouveau taux à suivre : analyses → numéros laissés → rapports envoyés.

## Alternatives écartées

- **Lancer l'audit complet pour chaque visiteur** : 0,50 € par curieux, plusieurs minutes
  d'attente, et un rapport qui part sans relecture.
- **Demander le numéro avant l'analyse** : c'est le formulaire classique ; la note visible
  d'abord est ce qui donne envie de laisser son numéro.
- **Animation factice** (étapes sur minuteur) : contraire à la règle « pas d'échec
  silencieux » et démasquée dès qu'un restaurateur ne reconnaît pas ses propres avis.
