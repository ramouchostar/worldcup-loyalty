# ADR 0088 — Référencement en Pro : un site optimisé pour Google sur un sous-domaine Boosteats, la commande reste ailleurs

**Statut** : Proposé (2026-11-03). Décidé par le porteur en session le 2026-11-02 (périmètre, plan,
adresse, pilotes), sur la maquette « Site Houba — maquette SEO »
(https://claude.ai/artifact/6qJgFMH7htrkc8XmtGgHzB : accueil, page d'un plat, rapport du mois).
Maquette **validée par le porteur le 2026-11-03**, avec deux ajouts (promo à la une, bouton Commander ou Appeler : §2 et §3). Précise l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md)
§7 (le « référencement » du Pro prend forme) sans toucher à son §4 : **aucune commande ni aucun
paiement chez nous**. Amende l'[ADR 0070](0070-plans-croissance-pro-commande-en-ligne-et-referencement.md)
§2 sur l'adresse du site (sous-domaine Boosteats, plus le domaine du restaurant). S'appuie sur
l'[ADR 0082](0082-fiche-google-geree-sur-invitation.md) (fiche Google gérée sur invitation),
l'[ADR 0083](0083-le-catalogue-menu-s-importe.md) (catalogue importé) et l'[ADR 0069](0069-audit-restaurant-depuis-la-plateforme.md)
(DataForSEO déjà branché). N'amende ni l'ADR 0007 ni l'ADR 0028 : le site est une page publique
du restaurant, pas un écran membre.

## Contexte

Owner.com vend aux restaurants américains un site « qui ramène beaucoup plus de trafic Google »,
avec commande en ligne, et une FAQ qui promet des résultats « en 30 à 60 jours », sans que le
restaurateur ait rien à faire. Mehdi veut une offre équivalente pour nos restaurateurs, en
s'appuyant sur DataForSEO et sur notre savoir-faire.

Ce qu'on a vérifié le 2026-11-02 :

- **La fiche Google de Houba renvoie vers belchicken.com**, le site général de la franchise
  (Places API, `websiteUri`). Quelqu'un qui cherche « poulet frit Laeken » et clique sur « Site
  web » n'arrive pas sur une page qui parle de Houba, de ses horaires ou de sa carte. Kraainem et
  De Bue sont dans le même cas : nos trois clients réels sont des **franchisés Belchicken**.
- **On a déjà toute la matière** : la carte en base (119 plats actifs à Houba, prix, catégories,
  photos — `menu_items`), l'identité (`restaurants` : logo, couleurs, police, adresse,
  coordonnées), les horaires (lus chez Google), la note publique (3,5 sur 156 avis pour Houba).
  Rien ne serait saisi deux fois.
- **DataForSEO sait mesurer la place sur Google Maps à un point précis**
  (`mapsSearch(keyword, lat, lng)`, `lib/audit/dataforseo.ts`). En répétant cette recherche sur
  une grille autour du restaurant, on voit sa place quartier par quartier : c'est la preuve
  mensuelle que l'ADR 0070 exigeait (« sinon le restaurateur résilie au bout de trois mois »).
- **Le site de commande d'Owner ne nous convient pas** : l'ADR 0074 §4 l'a sorti de la feuille
  de route (paiement, support, allergènes), et en Belgique, un restaurant équipé d'une caisse
  enregistreuse certifiée (SCE) doit y enregistrer aussi ses commandes en ligne. Un site qui
  encaisse à côté de la caisse le mettrait en défaut.

## Décision

### 1. Ce qu'on vend : le site, la fiche, la preuve

Le module **Référencement** est inclus dans le plan **Pro** (500 €/mois, ADR 0074 §7). Il n'est
pas vendu à part et n'entre pas dans Croissance. Il réunit trois choses :

1. **Un site optimisé pour Google**, construit et tenu par nous à partir des données du
   restaurant ;
2. **la fiche Google gérée** (ADR 0082) : son lien « Site web » pointe vers ce site, et la carte,
   les horaires et les photos sont les mêmes partout ;
3. **un rapport mensuel** dans la console, qui montre sa place sur Google Maps et ce que les gens
   ont fait.

### 2. Le site

- **Généré depuis la base**, jamais saisi deux fois : identité, carte, prix de vente
  (`menu_price`, jamais le prix de revient), photos, horaires, adresse. Une modification de la
  carte dans la console se retrouve sur le site.
- **Accueil** : le titre porte les mots que les gens tapent (« Poulet frit et burgers à
  Laeken »), puis s'il est ouvert, la note Google, les boutons Commander, Itinéraire et
  Livraison, les plats les plus commandés, la carte, les horaires, l'accès, une FAQ locale et un
  encart vers le programme de fidélité (le site sert aussi à inscrire des membres).
- **La promo à la une** : quand une offre est en cours, elle s'affiche en tête de l'accueil, juste
  sous la photo (texte, mot clé à dire, date de fin), et sur la page du plat concerné. La source
  est l'offre de la pub (`ad_requests.offer_text`, `offer_keyword`, `offer_from`, `offer_to`,
  ADR 0086) : jamais saisie deux fois. Elle apparaît le premier jour et disparaît le lendemain de
  sa date de fin, sans geste de personne. Sans offre en cours, rien ne s'affiche (pas de bloc vide).
- **Une page par plat phare**, seulement si on a une vraie photo et une description validée par
  le restaurateur. **Jamais de page par commune avec le même texte** : Google les sanctionne.
  Aucune description de plat n'est inventée.
- **Ce que lit Google** : données structurées `Restaurant` et `Menu`, plan du site, titres et
  descriptions par page, pages rapides sur téléphone (mesurées par PageSpeed, ADR 0069).
- **Couleurs et police du restaurant** (sa charte, `brand_*`). C'est une page publique de
  l'établissement, pas la console : l'ADR 0054 ne s'y applique pas.

### 3. La commande reste ailleurs

Le bouton principal dépend de ce que le restaurant a :

- **un vrai site de commande** (celui de sa caisse, Takeaway, Uber Eats, Deliveroo ou un
  partenaire, ADR 0074 §7) → « Commander », qui ouvre ce site ;
- **sinon** → « Appeler pour commander », qui lance l'appel (`tel:`) vers son numéro ;
- **ni l'un ni l'autre** → le site n'est pas publié : on ne met pas en ligne une page dont le
  bouton principal ne mène nulle part. La console dit ce qui manque.

Le même choix vaut pour le bouton du haut, celui de la promo et celui de chaque page de plat. Nous ne prenons aucune
commande, n'encaissons rien et ne touchons pas aux allergènes au-delà de ce que le restaurant
nous fournit. Chaque clic sur « Commander » ou « Appeler » est **compté** (destination, page, jour) : c'est la
seule chose qu'on mesure du parcours de commande.

### 4. L'adresse : un sous-domaine Boosteats

Le site vit sur `<établissement>.boosteats.be`. Rien à acheter, en ligne dès que le contenu est
validé. Le prix de ce choix : le référencement gagné est rattaché à **notre** domaine. Pour que
le restaurateur ne perde rien s'il part (ADR 0074 §6), on propose (**à valider**) : à la
résiliation, le sous-domaine renvoie pendant 12 mois (redirection permanente) vers le site qu'il
désigne, et on lui remet le contenu.

### 5. La preuve mensuelle

Mesurée le 1er de chaque mois, affichée dans la console :

- **Place sur Google Maps** : grille de 5 × 5 points sur environ 1,5 km autour du restaurant,
  pour une recherche principale (« poulet frit » pour Houba), plus 3 à 5 recherches suivies
  (« poulet frit laeken », « burger 1020 »…), choisies avec des volumes réels (DataForSEO) ;
- **Ce que les gens ont fait** : vues de la fiche, demandes d'itinéraire, appels, clics vers le
  site (API Performance de Business Profile, accès gestionnaire de l'ADR 0082), visites du site
  venues de Google et clics « Commander » (comptés côté serveur, sans cookie, comme `qr_landings`) ;
- **Ce qu'on a fait** : mises à jour, posts, réponses aux avis.

**La première mesure se fait avant tout travail** : c'est le point de départ, affiché comme tel.

### 6. Ce qu'on ne promet pas

- **Pas de délai garanti** (« résultats en 30 à 60 jours » chez Owner) : on montre la place
  mesurée chaque mois, on ne la promet pas.
- **Jamais « grâce à nous »** (ADR 0064) : « visites venues de Google », « clics sur
  Commander », jamais un chiffre d'affaires en plus.
- **Jamais de points contre un avis Google** (ADR 0070 §5, ADR 0074 §5).

### 7. Deux pilotes en parallèle

- **Houba**, sous réserve de l'**accord de Belchicken** : un site local au nom d'un franchisé
  peut être encadré par le contrat de franchise. Mehdi pose la question à la franchise. Un oui
  ouvre aussi la porte à De Bue et Kraainem.
- **Un indépendant de Bruxelles**, la cible de la prospection, proposé en visite (kit de visite).

## Mesures (ce qui dira que cette décision est fausse)

- **Place sur Google Maps** : si, sur les deux pilotes, la place moyenne sur la grille ne
  progresse pas après **3 mesures mensuelles** (point de départ compris), le site seul ne suffit
  pas : revoir le contenu ou l'offre avant de le vendre plus loin.
- **Clics « Commander » ou « Appeler » et itinéraires** : s'ils restent à zéro alors que les visites montent,
  la page attire sans convertir.
- **Coût DataForSEO** par établissement et par mois, lu dans le champ `cost` déjà enregistré :
  au-delà de 5 € par mois et par établissement, réduire la grille ou les recherches suivies.
- **Résiliations du Pro** à 3 mois : chaque départ est noté avec sa raison.

## Conséquences

- **À construire** (après validation de la maquette) : routage par sous-domaine
  (`*.boosteats.be` sur Vercel, établissement déduit de l'hôte), une table des sites (adresse,
  publié ou non, liens de commande et de livraison, réponses de la FAQ, plats phares), pages
  générées depuis la base, plan du site par sous-domaine, comptage des visites et des clics
  « Commander », tâche mensuelle de mesure DataForSEO, rapport dans la console. Migration
  horodatée et ADR d'exécution au moment du code.
- **Dépend de l'ADR 0082** pour les chiffres de la fiche (vues, itinéraires) : sans accès
  gestionnaire, le rapport affiche seulement la place sur Maps et les chiffres du site, et dit
  pourquoi le reste manque.
- **Textes commerciaux** (`.claude/product-marketing.md`, landing, kit de visite) : le
  référencement reste « en préparation » tant qu'aucun pilote n'est en ligne. On dit
  « référencement » et « Google », jamais « SEO ».
- `lib/entitlements.ts` n'est pas touché avant le premier code.
- Le module est distinct des pages SEO de boosteats.be (`lib/seo-pages.ts`), qui servent à
  trouver des restaurateurs, pas des clients.

## Alternatives rejetées

- **Reprendre Owner tel quel (site + commande + paiement)** : contredit l'ADR 0074 §4 et pose le
  problème de la caisse certifiée. Écartée par le porteur le 2026-11-02.
- **Site sur le domaine du restaurant** (l'ADR 0070 §2) : meilleur pour lui s'il part, mais il
  faut acheter un domaine et régler son DNS pour chaque restaurant. Écartée pour démarrer ; la
  redirection de 12 mois (§4) limite ce qu'il perd.
- **Référencement sans site** (fiche gérée et rapport seulement) : laisse la fiche de Houba
  pointer vers belchicken.com, ce qui est justement le manque constaté.
- **Module vendu à part, ou inclus dans Croissance** : écarté par le porteur ; le référencement
  reste un argument du Pro.
