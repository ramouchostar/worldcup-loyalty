# ADR 0068 — L'audit d'un restaurant se lance depuis la plateforme

**Statut** : Proposé (2026-09-23). Demande du porteur du même jour. Étend l'[ADR
0033](0033-console-plateforme-demo-chiffres-backlog.md) §4 (un onglet de plus dans `/platform`).
Reprend l'item de backlog « audit fiche Google My Business » (m57, PR #51), jamais implémenté.
N'amende **ni l'ADR 0007** (aucune donnée d'audit ne descend vers un membre) **ni l'ADR 0029** :
l'audit sert à **démarcher**, ce n'est pas une offre facturée.

## Contexte

Avant de proposer Boosteats à un restaurant, on veut lui montrer ce qui ne va pas dans sa présence
en ligne : sa fiche Google, ses réseaux sociaux, ses concurrents directs et ses avis. Aujourd'hui,
ce diagnostic se fait à la main, n'est pas comparable d'un restaurant à l'autre et n'est gardé
nulle part.

Ce que les sources permettent vraiment (vérifié le 2026-09-23) :

- **Google Places API (New)** : recherche, fiche détaillée, concurrents à proximité (Nearby
  Search). Mais **5 avis au maximum** et **10 photos au maximum**, sans réponse du propriétaire,
  sans description rédigée par l'établissement, sans Q&R et sans posts. Avec 5 avis, impossible
  de trouver le moment où la note a basculé.
- **Le dépôt `cporter202/social-media-scraping-apis`** n'est pas une bibliothèque : c'est une liste
  de liens d'affiliation vers des **scrapers Apify** hébergés et payants. Il n'y a rien à
  installer. Ce qu'il faut, c'est un compte Apify et une poignée d'actors choisis.

## Décision

### 1. Où et pour qui

Un onglet **Audit** dans `/platform` (`/platform/audit`), **super-admin uniquement** (garde du
layout et contrôle `is_super_admin` sur chaque page et chaque route, ADR 0033 §4). Pas de page
publique ni d'accès restaurateur tant que le coût d'un audit n'est pas mesuré.

### 2. Recherche limitée aux 19 communes de Bruxelles

Une seule barre de recherche. Le serveur interroge Places **Text Search** dans un rectangle qui
couvre la Région, puis garde seulement les établissements dont le **code postal** appartient aux
19 communes (1000, 1020, 1030, 1040, 1050, 1060, 1070, 1080, 1081, 1082, 1083, 1090, 1120,
1130, 1140, 1150, 1160, 1170, 1180, 1190, 1200, 1210). Le code postal est revérifié au
lancement de l'audit, jamais seulement dans le navigateur. Un résultat écarté est **compté**
(« 3 résultats hors Bruxelles masqués ») : il n'est pas caché en silence.

### 3. Un audit = cinq volets indépendants, une note sur 100 par volet

Chaque volet s'exécute, échoue et se relance seul : un scraper en panne ne bloque pas le reste.
Chaque critère vaut `ok`, `partiel`, `manquant` ou **`non vérifié`**. Un critère non vérifié
**sort du dénominateur** : on ne pénalise jamais une information qu'on n'a pas pu lire, et le
rapport indique « note sur N critères vérifiés ».

**A. Fiche Google** (Places, puis Apify quand il est branché) :

| Bloc | Pts | Critères |
|---|---|---|
| Identité | 15 | nom sans mots-clés ajoutés · catégorie principale précise (pas seulement « restaurant ») · catégories secondaires |
| Coordonnées | 15 | téléphone · vrai site web (pas une page Facebook) · adresse complète |
| Horaires | 15 | horaires réguliers · horaires exceptionnels déclarés · horaires livraison/emporter |
| Photos | 15 | volume · photos postées par l'établissement · photo récente (< 90 j) |
| Attributs | 10 | sur place / emporter / livraison · paiements · accessibilité · options (végé, halal…) |
| Liens d'action | 10 | menu · commande en ligne · réservation |
| Avis | 20 | note · volume par rapport aux concurrents · taux de réponse du propriétaire · délai de réponse |

**B. Réseaux sociaux** (Instagram, TikTok, Facebook via Apify). Comptes repérés sur le site web et
la fiche, **confirmés à la main** avant de lancer le scraping (un homonyme fausserait tout) :

| Bloc | Pts | Critères |
|---|---|---|
| Présence et cohérence | 20 | compte trouvé · même nom et même logo · bio avec adresse, horaires et lien de commande · mêmes infos que la fiche Google |
| Régularité | 25 | publications par semaine sur 90 jours · dernière publication de moins de 7 jours |
| Engagement | 30 | taux d'engagement médian par publication, comparé à un repère **par taille de compte** |
| Formats | 15 | part de vidéos (Reels, TikTok) · plats et visages visibles |
| Communauté | 10 | réponses aux commentaires · contenu de clients repartagé |

Les repères d'engagement sont des **hypothèses de départ** (`lib/audit/benchmarks.ts`), à
recalibrer sur les vingt premiers audits. Le rapport les présente comme des repères, pas comme
une norme.

**C. Concurrents** : établissements à moins de **600 m** (Nearby Search) dont le type est proche
(même cuisine ou même catégorie de prix), huit au maximum. Pour chacun : note, volume d'avis,
gamme de prix, horaires, services, et la note de sa fiche calculée avec la grille A. Claude
déduit la **cible** (à partir du quartier, du prix et du contenu des avis) et écrit ce que les
concurrents font mieux, avec chaque affirmation liée à une donnée du tableau.

**D. Avis** (Apify, jusqu'aux **500 avis les plus récents** avec leur date) :

- courbe de la note moyenne par mois, avec la moyenne glissante sur 3 mois ;
- **point de bascule** : le mois où la note moyenne avant et après diffère le plus, avec au
  moins 20 avis de chaque côté. En dessous d'un écart de 0,3 étoile, le rapport dit « pas de
  bascule nette » : il n'en invente pas ;
- thèmes négatifs et positifs regroupés par Claude, avec leur fréquence et deux citations
  exactes chacun, et les thèmes qui apparaissent autour du point de bascule ;
- taux et délai de réponse du propriétaire ;
- conclusion : trois à cinq actions, chacune reliée à un thème chiffré.

**E. Questions à l'établissement** (approfondissement, saisies par nous pendant ou après
l'échange) : répartition du chiffre d'affaires par canal (sur place, à emporter, Takeaway.com,
Uber Eats, Deliveroo, commandes directes par téléphone ou WhatsApp) en pourcentages qui font
100 %. Les réponses enrichissent la synthèse ; elles ne changent pas les notes A à D, qui restent
mesurées.

**Synthèse** : une note globale (moyenne pondérée des volets disponibles : A 30 %, B 20 %,
C 20 %, D 30 %), puis les cinq priorités classées par effet attendu et effort.

### 4. Exécution et stockage

- `restaurant_audits` (un audit, sa fiche, son statut, ses notes) et `restaurant_audit_sections`
  (données brutes, résultat, erreur éventuelle par volet), RLS activée **sans policy** =
  service-role seulement.
- Lancement : l'audit est créé, puis chaque volet tourne en tâche de fond (`after()`) ; la page
  se rafraîchit toutes les 5 secondes jusqu'à ce que tous les volets soient terminés.
- Un volet échoué affiche son **motif** à l'écran et le garde en base, avec un bouton
  « Relancer ce volet ».
- Clés : `GOOGLE_PLACES_API_KEY` (serveur uniquement, jamais `NEXT_PUBLIC_`), `APIFY_TOKEN`,
  `ANTHROPIC_API_KEY` (déjà présent). Sans `APIFY_TOKEN`, les volets B et D affichent « source non
  branchée » et la grille A se limite à ce que Places renvoie : on ne fait pas semblant.

### 5. Le rapport

Consultable à `/platform/audit/[id]`, gardé en historique par établissement (on peut refaire
l'audit trois mois plus tard et comparer), et exportable en **PDF** par une version imprimable
(`/platform/audit/[id]/print` avec une feuille de style d'impression, sans dépendance
ajoutée).

### 6. Livraison en cinq PR

1. Cet ADR, les tables, la recherche limitée à Bruxelles, le volet A (Places), le volet E, la page
   du rapport.
2. Volet D (avis Apify, tendance, thèmes).
3. Volet C (concurrents).
4. Volet B (réseaux sociaux).
5. Synthèse, export PDF, volet A complété par Apify.

## Conséquences

- **Coût par audit** estimé entre 2 et 4 € (Places environ 0,50 €, Apify de 1 à 3 € selon le
  volume d'avis et de publications, Claude environ 0,30 €). Chaque audit enregistre le nombre
  d'appels par source pour qu'on mesure le coût réel au lieu de le supposer.
- Le scraping de réseaux sociaux passe par un tiers (Apify), soumis aux conditions des
  plateformes. On ne lit que des données **publiques** d'un **établissement**, jamais de profils
  de particuliers au-delà du texte public des avis et commentaires. Les noms des auteurs d'avis
  ne sont ni stockés dans le rapport ni exportés (ADR 0025).
- L'onglet Audit ne touche à aucune donnée du programme de fidélité.

## Alternatives écartées

- **Places API seule** : pas assez d'avis pour trouver une bascule et aucune réponse du
  propriétaire.
- **Scraper maison (Playwright)** : cassé à chaque changement de Google ou Meta, et c'est à nous
  de le maintenir. Apify porte ce risque.
- **Note globale sans « non vérifié »** : une fiche paraîtrait mauvaise uniquement parce qu'une
  source est en panne, et on le dirait à un prospect.
