# ADR 0107 — Les tickets de cuisine sortent sur l'imprimante du restaurant, ou le client envoie sa commande par WhatsApp

**Statut** : Proposé (2026-11-20, révisé le même jour après les décisions du porteur). Choisit le principe d'impression que l'[ADR 0099](0099-le-site-de-commande-en-option.md) §2 laissait ouvert (Restent ouverts 4), réalise ce que l'[ADR 0100](0100-les-options-se-reglent-par-groupes-de-plats.md) §9 appelait « rien n'est imprimé », et **complète l'ADR 0099 §2** : une imprimante hors ligne bloque l'envoi, mais le client garde son panier et peut l'envoyer par WhatsApp (§10). **Amende l'ADR 0099 §8** (le forfait) **si Mehdi le confirme dans cette PR** : le site de commande ne serait plus réservé au Pro (§12). À la rédaction, rien n'était construit : cet ADR se valide avant le code. La commande du site reste fermée par `SITE_ORDER_RESTAURANTS` (vide) ; aucune imprimante n'a été essayée. **Amendé le 2026-11-26** (§13, toujours « Proposé ») : Kraainem passe en premier, donc **Epson avant Star**, et la traduction du ticket est écrite sans être branchée.

## Contexte

Aujourd'hui une commande du site est **lue à l'écran** : la console « Commandes du site » la montre avec ses tickets de cuisine par coin, et un carillon sonne tant que le restaurateur n'a pas dit « J'ai vu » (ADR 0099 §7 et §10). Le contenu des tickets est déjà calculé et testé (`lib/menu-options/tickets.ts`, logique pure : un ticket par coin, le prénom en grand, « SANS SALADE » en entier). **Aucun papier ne sort.** Le choix du découpage (un ticket par coin ou un seul, avec ou sans ticket « CAISSE · TOUT ») n'est pas enregistré.

**Décisions du porteur, 2026-11-20** :

1. Un système **hybride** : le site relié directement à l'imprimante, **et** une application qui lance l'impression ; **plusieurs marques**.
2. **Imprimante hors ligne** : la commande ne s'envoie pas ; **le client garde son panier avec toutes ses informations** et un bouton « Envoyer ma commande via WhatsApp » lui permet de la transmettre lui-même ; les deux coches bleues lui disent que le restaurateur l'a vue. La langue du message est **celle du client**.
3. **L'installation est facturée, sauf pour les plans Pro** ; **Mehdi a changé d'avis : le site de commande sera accessible à tous** les forfaits (décision rapportée par Omar, à confirmer par Mehdi).
4. **Réutiliser l'imprimante que le restaurateur a déjà** : c'est le but. Celui qui n'en a pas l'achète.

Contrainte qui décide du protocole : notre serveur est sans état (Vercel). Il ne peut pas **ouvrir une connexion vers** une imprimante qui vit derrière la box du restaurant. C'est donc l'imprimante (ou une application sur place) qui doit **venir chercher** ses tickets. Une page web ne sait pas non plus parler à une imprimante réseau.

Ce qui a été lu le 2026-11-20 (documentation des fabricants, **aucun matériel essayé**) :

- **Star CloudPRNT** : l'imprimante envoie un POST à intervalle régulier avec son état (`statusCode`, 2xx = prête ; 410 plus de papier ; 420 capot ouvert) et son adresse MAC. Le serveur répond « un ticket est prêt » (`jobReady`, avec un jeton). L'imprimante le télécharge (GET), l'imprime, puis **confirme** (DELETE). Une erreur en cours d'impression arrive dans le POST suivant. Les TSP143IV et mC-Print3 le portent ; **d'anciens modèles Star** (TSP650II, TSP700II, TSP800II) le gagnent avec une carte d'interface (HI01X/HI02X) selon le guide du fabricant.
- **Epson Server Direct Print** : même principe (l'imprimante interroge une adresse à intervalle fixe et reçoit un XML ePOS-Print). Seule la description générale a pu être lue (la page du fabricant a refusé l'accès) : intervalle minimal, accusé d'impression, **liste des modèles compatibles** et authentification **restent à vérifier**.
- **Prix** (un revendeur belge, logiscenter.be, 2026-11-20) : Star TSP143IV avec Ethernet, USB et CloudPRNT, environ **234 € HT** l'unité ; dix rouleaux de papier, environ 16 € HT.
- **Ce qu'on ne sait pas** : **quelle imprimante ont les restaurants pilotes** (Houba, De Bue, Kraainem). C'est le fait qui décide du premier adaptateur (§12).
- Le téléphone que la base connaît (`restaurants.phone`) vient de la fiche Google et peut être un fixe : ce n'est pas un numéro WhatsApp.

## Décision (proposée)

### 1. Une file, plusieurs canaux, plusieurs marques

La commande produit des **tickets** dans un modèle neutre (lignes, tailles, gras, « SANS X »). Une **file** les garde (§2). Chaque ticket est remis par un **canal** ; un établissement peut en combiner plusieurs :

- **Imprimante qui interroge notre serveur** : Star CloudPRNT en premier, Epson Server Direct Print ensuite (après vérification). Chaque marque est un **adaptateur** qui traduit le ticket neutre dans son langage (balisage Star, XML ePOS-Print).
- **Application relais** : une petite application sur un appareil du restaurant (tablette, téléphone, PC) interroge la **même file** et imprime sur ce qui est branché (réseau, USB, Bluetooth). C'est **la voie pour les imprimantes que le restaurateur a déjà** et qui ne savent pas interroger un serveur. Sa forme (application Android, programme PC, boîtier) et son rang se décident **après l'inventaire du §12**.
- **La console** : écran et carillon de l'ADR 0099 §10, toujours actifs. Le filet de sécurité.
- **WhatsApp** : le secours du client (§10).

Plusieurs marques est donc possible, parce que **seul l'adaptateur connaît la marque** ; la file, le routage par coin, l'état et les alertes sont communs. Un modèle n'entre dans la liste « testé » qu'après un vrai ticket sorti dessus (La mise en service).

### 2. Une file d'impression en base

Deux tables, service role seul, code tolérant à leur absence (sans elles : rien ne part, l'écran et le carillon restent le filet) :

- `print_printers` : l'établissement, un nom (« Cuisine », « Pizza »), le **canal** (`star_cloudprnt`, `epson_sdp`, plus tard `relais`), les **coins desservis**, une clé secrète (hachée), la MAC, la date du dernier passage et le dernier état lu.
- `print_jobs` : la commande, l'imprimante, le **ticket figé** (le texte exact), l'état (`en_attente`, `envoye`, `imprime`, `en_erreur`, `abandonne`), le nombre d'essais, les dates.

### 3. Un ticket par coin, vers l'imprimante du coin

À l'enregistrement d'une commande, `buildTickets` (existant) produit les tickets ; chacun va à l'imprimante qui **dessert son coin**. Un coin sans imprimante va à l'imprimante « par défaut » de l'établissement ; sans imprimante par défaut, **rien n'est imprimé et l'écran le dit**. Le découpage et le ticket « CAISSE · TOUT » deviennent des **réglages enregistrés** de l'établissement.

### 4. Le ticket est une photo figée

Écrit au moment de la commande : renommer un plat ou changer son coin plus tard ne réécrit pas un ticket déjà parti, et « Réimprimer » sort exactement le même.

### 5. Le texte

Texte simple, prénom et « SANS X » en grand. Les imprimantes thermiques ont un jeu de caractères limité (accents, « œ », guillemets typographiques) : tant que la page de codes n'est pas essayée sur chaque modèle, un **tableau de repli** (œ → oe, guillemets droits, tiret simple) évite les caractères illisibles. À vérifier sur la première imprimante de chaque marque.

### 6. L'accès

Chaque imprimante a une **adresse secrète** (`/api/print/<clé>`) : l'imprimante ne signe rien, c'est la seule authentification qu'elle sait faire. Clé jamais en clair en base, **renouvelable**. Le serveur vérifie que la clé et la MAC correspondent, sinon il répond comme si l'adresse n'existait pas.

### 7. L'état est montré, la panne est dite

La console affiche pour chaque imprimante « vue il y a 3 s », « hors ligne depuis 4 min » ou la cause quand l'imprimante la donne (« plus de papier », « capot ouvert »). Une imprimante est **hors ligne** après trois intervalles sans passage (seuil à mesurer).

### 8. Aucun échec silencieux

Un ticket pas imprimé deux minutes après la commande déclenche le **bandeau rouge et le carillon** de la console : c'est le cas d'une imprimante qui tombe **après** l'envoi d'une commande. Un ticket n'est pas renvoyé plus de deux fois sans qu'une personne le décide (un doublon de papier envoie deux fois le même plat en cuisine). « Réimprimer » est un geste du restaurateur.

### 9. Ce que le client voit quand tout marche

La page de commande continue de dire « envoyée », pas « reçue par le restaurant » (ADR 0099 §9) : le suivi de l'état par le client n'existe pas. L'état « imprimé à 12:04 » est montré à la console seulement.

### 10. Imprimante hors ligne : le client envoie son panier par WhatsApp

Quand l'établissement a des imprimantes et qu'**aucune en ligne ne dessert la commande**, **la commande n'est pas envoyée** : le serveur refuse avec un motif propre (`imprimante_hors_ligne`), **le panier reste intact dans le navigateur**, et l'écran propose un bouton **« Envoyer ma commande via WhatsApp »**. Il ouvre WhatsApp vers le **numéro WhatsApp de commande** du restaurant, avec un message déjà écrit qui reprend **tout le panier** : prénom, plats avec leurs choix, quantités, « SANS X », suppléments, total à régler, heure de retrait si elle existe. Le client appuie sur « Envoyer » **depuis son propre téléphone** : c'est un message ordinaire, **sans l'API WhatsApp Business** de notre côté et sans modèle à faire approuver par Meta. Les **deux coches bleues** lui disent que le restaurateur a ouvert la conversation.

- **Rien n'est enregistré chez nous** dans ce cas : pas de numéro de commande, pas de ticket qui attend, donc **aucun doublon possible** avec l'imprimante qui reviendrait. Le texte et le total du message sont produits par **le même code que le panier** (test d'équivalence, comme l'ADR 0099 §9) : le message ne dit jamais un autre prix que la page.
- **La langue du message est celle du client**, c'est-à-dire celle de la page qu'il utilise. **Elle n'existe aujourd'hui qu'en français** : le message sera en français tant que la page n'est pas traduite, puis suivra la page. Les noms de plats sont ceux du catalogue du restaurateur, jamais traduits.
- **Le serveur dit l'état avant la commande** : la page du menu sait si une imprimante est en ligne, pour prévenir le client avant qu'il remplisse son panier.
- **Sans numéro WhatsApp de commande**, le bouton ne s'affiche pas : la page dit d'appeler le restaurant. Ce numéro est un champ à part (`restaurants.phone` vient de la fiche Google et peut être un fixe), **saisi par le restaurateur et vérifié** par un message de test avant qu'il serve.
- **Un établissement sans aucune imprimante** garde le fonctionnement actuel (console et carillon, ADR 0099 §10) ; faire de WhatsApp son circuit principal est une question ouverte (Restent ouverts 5).

Ce que ce canal ne promet pas, et que la page ne doit pas promettre :

- Les coches bleues dépendent du réglage « confirmations de lecture » du téléphone du restaurateur, et disent « ouvert », pas « en préparation ».
- **Le client doit appuyer sur « Envoyer »** : un bouton touché n'est pas un message parti, et nous ne verrons jamais la différence.
- Un client qui renvoie sa commande par le site quand l'imprimante revient, **après** l'avoir envoyée par WhatsApp, crée un doublon de son fait : le message le dit (« Commande par WhatsApp, ne pas refaire »), rien de plus.

### 11. Pas dans cette décision

Tiroir-caisse, ticket du client sorti sur l'imprimante, commandes de livraison, **la forme exacte de l'application relais**, l'API WhatsApp Business (réponses automatiques au client).

### 12. On part de l'imprimante que le restaurateur a déjà

Le but est de **réutiliser** ce qu'il possède. Avant tout code d'adaptateur, **on relève** l'imprimante de chaque établissement pilote, comme la caisse (ADR 0102 §6, `restaurants.pos_system`) : modèle (étiquette sous l'imprimante), branchement (réseau, USB, Bluetooth), et **si la caisse s'en sert déjà**. La réponse décide du canal :

- **Star ou Epson reconnu comme capable d'interroger un serveur**, ou **ancien Star qui accepte la carte d'interface** : canal direct (§1).
- **Une autre imprimante thermique** branchée au réseau ou à un appareil qui reste allumé : **application relais** (§1).
- **Imprimante branchée en USB à la caisse seulement** : souvent impossible à partager ; une deuxième imprimante (au restaurateur) ou le relais sur le PC de la caisse, à voir au cas par cas.
- **Aucune imprimante** : il en achète une compatible (environ 234 € HT, voir Prix), ou reste sur la console et le secours WhatsApp.

**Forfait et prix** (décision de Mehdi rapportée par Omar, **à confirmer**) : le site de commande **n'est plus réservé au Pro** (amende l'ADR 0099 §8, où « Pro seulement » avait été précisé le 2026-11-13) ; **l'installation est facturée, sauf pour les plans Pro**. Le **prix de l'installation** n'est pas fixé (Restent ouverts 3). Le code de l'accès (`lib/site-orders/access.ts`, qui exige aujourd'hui le drapeau **et** un forfait Pro) change dans une PR à part, une fois la décision confirmée ; les échos du §8 de l'ADR 0099 (landing, blog, fiche marketing) se mettent à jour le jour où le drapeau s'ouvre, pas avant.

### 13. Kraainem d'abord, donc Epson (2026-11-26)

**La demande** (Omar) : faire l'essai au Belchicken de Kraainem, qui a des imprimantes Epson. L'ordre du §1 s'inverse : **Epson d'abord**, Star ensuite.

**Ce que montrent les photos envoyées par le restaurant** : des Epson compactes de la série TM-m (levier de capot gris, repère NFC, boutons en façade), a priori **TM-m30 ou TM-m30II**. La photo ne départage pas les versions : leurs façades se ressemblent. Près de l'une d'elles, un PC affiche des onglets de commandes et un téléphone « Prêt à recevoir des commandes » : **elle sert peut-être déjà à autre chose**. À demander, avec le **ticket d'auto-test** de chaque imprimante (nom du produit, micrologiciel, type de connexion).

**Ce qui décide** (liste « Server Direct Print » d'Epson, rév. U, août 2023) : le canal direct existe sur les TM-m30II-H, -NT, -S, -SL, les TM-m30III, m50, m50II, les TM-T88VI et VII, et plusieurs modèles « -i » et « -DT ». **Ni la TM-m30 ni la TM-m30II sans suffixe n'y figurent**, et le guide technique de la TM-m30II ne mentionne pas cette fonction. Dans ce cas : une **imprimante compatible réservée aux commandes du site** (TM-m30III vue à 299,95 € dans une annonce en Belgique le 2026-11-26, offre non vérifiée) ou l'**application relais** (§1). Le choix reste ouvert jusqu'au ticket d'auto-test.

**Lu dans les manuels** (« Server Direct Print » rév. K, plus ancienne que la liste ci-dessus, et « ePOS-Print XML » rév. AF ; à relire pour le modèle retenu) :

- L'imprimante envoie un POST de formulaire (`ConnectionType=GetRequest`, `ID`) à intervalle réglable. Rien à imprimer : réponse 200 **vide**. Sinon : `PrintRequestInfo` en version 2.00, avec un **numéro de tirage**.
- Après l'impression, elle renvoie `ConnectionType=SetResponse` avec le résultat (`success`, code : plus de papier, capot ouvert…).
- HTTPS pris en charge, avec une vérification optionnelle du certificat du serveur (certificats à enregistrer), et une authentification **Digest** (ID et mot de passe réglés dans l'imprimante).

**Ce que cela corrige dans cet ADR** : au §6, une Epson **sait** s'authentifier (Digest) et sa demande porte un `ID`, **pas d'adresse MAC** ; l'adresse secrète reste commune aux marques, la vérification MAC ne vaut que pour Star. Au §7, la demande d'une Epson ne dit pas l'état du papier ou du capot : on le sait par le résultat d'un tirage (ou par la fonction « Status Notification », non étudiée).

**Écrit, pas branché** : `lib/printing/paper.ts` (mise en page commune aux marques : prénom en grand, « SANS X » en gras, repli des caractères du §5, 48 ou 35 colonnes) et `lib/printing/epson.ts` (document ePOS-Print, réponse et lecture du résultat « Server Direct Print »). Purs et testés : ni route, ni table, ni écran. La mise en page sert quel que soit le canal.

**L'imprimante est partagée** (dit par le restaurant, rapporté par Omar le 2026-11-26) : la même sort les tickets **Deliveroo, Uber Eats et Takeaway**. Deux suites :

- **Chaque ticket du site s'ouvre par « COMMANDE DU SITE »** et « À retirer et payer au comptoir » (validé par Omar sur un aperçu en texte), pour ne pas être pris pour une livraison.
- **Un mauvais réglage arrêterait les trois plateformes.** Pour l'essai, conseil donné : une imprimante compatible **réservée au site**, sans toucher à celle qui sert. Pas encore tranché. Pour partager plus tard : le guide de la TM-m30II dit qu'un modèle à plusieurs connexions garde les données de chacune à part et les imprime à tour de rôle ; à demander, **quel appareil envoie les tickets des plateformes et par quelle liaison** (un PC qui les imprime ouvrirait la voie d'une application relais sur ce PC).

## La mise en service (la scène)

**Boosteats installe.** L'équipe relève l'imprimante (§12), la branche ou la configure, colle dans ses réglages l'adresse secrète donnée par la console (« Ajouter une imprimante »), règle les coins, puis touche « Ticket de test ». La console dit « vue il y a 3 s » ou « jamais vue », avec la marche à suivre. **Un établissement n'est pas ouvert aux commandes tant qu'un ticket de test n'est pas sorti**, et un modèle n'entre dans la liste « testé » qu'après ce ticket. La durée de chaque installation se note : c'est le vrai coût de la promesse, et la base du prix.

## Trace (ADR 0065)

Délai entre la commande et « imprimé » (médiane et 90e centile ; **seuil : plus de 60 s au 90e centile**) ; tickets non imprimés après deux minutes ; passages manquants par imprimante et par jour ; erreurs par code (papier, capot) ; part de réimpressions faites à la main (**plus de 5 %** = quelque chose cloche) ; **charge** : appels de sondage par jour et par imprimante (la date du dernier passage s'écrit au plus toutes les 30 s). **WhatsApp** : commandes refusées pour `imprimante_hors_ligne` (déjà dans `site_order_refusals`, **seuil : plus d'une commande sur dix** = le matériel ou le réseau est trop fragile pour ouvrir à d'autres) et part des clients qui **touchent** le bouton (**seuil : moins de la moitié** = le message est mal placé ou mal compris ; c'est tout ce que nous voyons). **Installation** : durée et nombre de visites par établissement, modèle relevé et canal retenu. Requêtes dans `docs/mesures/suivi-impression.sql`.

## Échos à suivre (ADR 0065)

ADR 0099 §2 (l'imprimante confirme ; hors ligne = blocage **avec secours**), §7 (« l'impression » hors tranche), §8 (**forfait**), §9 (promesse de la confirmation), §10 (sans imprimante), Restent ouverts 4 ; ADR 0100 §9 (« Rien n'est imprimé », jeu de caractères) ; `CONTEXT.md` (**Commande du site** « à venir » et « forfait Pro », **Coin de cuisine**, nouveaux termes **Imprimante** et **Numéro WhatsApp de commande**, jamais confondus avec le ticket de caisse du programme ni avec le numéro de la fiche Google) ; `lib/site-orders/access.ts` et son test (les deux portes) ; l'écran « Commandes du site » ; l'écran de confirmation du client ; `CLAUDE.md` (état actuel). **Vocabulaire** : un ticket de cuisine n'est jamais écrit dans `orders` (les tickets de fidélité).

## Conséquences

- **Matériel** : le restaurateur **réutilise son imprimante** si elle est compatible (directement ou par le relais), sinon il en achète une (environ 234 € HT plus le papier). Boosteats installe : du temps d'équipe, facturé hors Pro.
- **Sondage sur Vercel** : à un appel toutes les 5 secondes, une imprimante appelle environ 17 000 fois par jour (trois établissements, environ 52 000). Mesurer le coût avant d'ouvrir à d'autres ; l'intervalle se règle dans l'imprimante.
- **Jamais essayé sur du vrai matériel** : le code se teste contre un faux client qui rejoue le protocole, mais la preuve est **une imprimante de test par marque**, et surtout **les vraies imprimantes des pilotes**.
- **L'application relais est un vrai chantier** (application à écrire, publier, maintenir) : son rang dépend de l'inventaire.
- **Ouvrir à tous les forfaits** augmente le nombre d'installations à faire : à surveiller avec la durée d'installation.

## Alternatives rejetées

- **Bloquer les commandes sans rien proposer** : un restaurateur dont la box tombe perdrait toutes ses commandes. Remplacé par le secours du §10.
- **Enregistrer la commande ET proposer WhatsApp quand l'imprimante est hors ligne** : deux chemins pour une même commande, un doublon quand l'imprimante revient, un numéro que personne n'a vu. Écarté pour que le client garde son panier et envoie lui-même.
- **Imprimer depuis le navigateur du restaurateur** : page ouverte obligatoire, fenêtre d'impression, aucun accusé. Même fragilité que le son.
- **L'API WhatsApp Business pour envoyer la commande au restaurant** : approbation de modèles chez Meta, coût par message, délai, alors que le message ordinaire du client donne déjà les coches bleues. Reste une piste à part (Brigade 16).
- **Imposer une imprimante achetée chez nous** : le porteur veut réutiliser l'existante.
- **Un service d'impression tiers** : un intermédiaire de plus avec les prénoms et téléphones des clients (ADR 0099, données personnelles) ; non évalué.

## Restent ouverts

1. **Quelles imprimantes ont les restaurants pilotes** (Houba, De Bue, Kraainem) : modèle, branchement, usage par la caisse. Kraainem : série Epson TM-m d'après les photos (§13), **ticket d'auto-test attendu** ; Houba et De Bue : inconnus. **C'est ce qui décide du canal.**
2. **Epson** : liste des modèles et échange lus (§13). Reste à relire pour le modèle retenu : confirmation du tirage (version 2.00), certificat accepté en HTTPS, page de codes (§5).
3. **Le prix de l'installation** (gratuite en Pro) et **qui commande** l'imprimante quand il faut en acheter une.
4. **La caisse certifiée** (ADR 0099, Restent ouverts 3) : toujours à faire confirmer avant la première commande réelle.
5. **Un établissement sans imprimante** : console et carillon seulement, ou WhatsApp comme circuit principal (le client envoie, le restaurateur lit sur son téléphone) ?
6. **L'application relais** : forme et rang, après l'inventaire.
7. **Mehdi** : confirmer que le site de commande s'ouvre à tous les forfaits (§12).
8. **L'intervalle de sondage et le seuil « hors ligne »** : à mesurer sur le vrai matériel.
