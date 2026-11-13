# ADR 0099 — Le site de commande, en option, avec des options d'article

**Statut** : Accepté (2026-11-11) — proposé par Omar le même jour, accord de Mehdi donné à Omar pour amender les ADR concernés. **Périmètre accepté : les options des articles et, ensuite, le retrait au comptoir payé au comptoir. Le paiement en ligne et la livraison restent exclus** (chacun aura son ADR). **Amende** l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md) §4 (« prise de commande, paiement, livraison » hors du produit), l'[ADR 0088](0088-site-referencement-pro.md) §3 (« la commande reste ailleurs », aucun paiement chez nous) et l'[ADR 0070](0070-plans-croissance-pro-commande-en-ligne-et-referencement.md) (le site de commande Boosteats). La caisse certifiée reste une **question ouverte** (Contexte) à faire confirmer avant la première commande réelle. Les options des articles sont livrées sans écran, sans commande, sans paiement ; le reste de la décision s'applique aux PR suivantes.

## Contexte

Les restaurateurs qui arrivent chez nous dépendent des plateformes (Uber Eats, Deliveroo, Takeaway) pour recevoir des commandes, avec 15 à 30 % de commission. Un site de commande à leur marque, généré depuis leur catalogue, leur donnerait un canal direct sans commission. Un partenaire de livraison est évoqué, rien n'est signé.

L'ADR 0074 §4 l'a sorti de la feuille de route pour trois raisons : le support, les allergènes, la complexité. L'ADR 0088 y ajoute une raison de conformité : en Belgique, un restaurant équipé d'une caisse enregistreuse certifiée devrait y enregistrer aussi ses commandes en ligne. **Cette raison n'est pas établie.** Les sources consultées le 2026-11-10 se contredisent (seuil de 25 000 € de repas sur place ou 10 % du chiffre d'affaires ; la vente à emporter est soit exclue soit incluse) et aucune source officielle n'a été lue. Un restaurateur à qui nous avons déjà livré un site de commande avec imprimante affirme n'avoir rien eu à certifier, mais son cas (petit chiffre d'affaires sur place ?) n'est peut-être pas général. À faire confirmer par le comptable ou le SPF Finances avant la première commande réelle.

Ce qui a été examiné avant d'écrire cet ADR : huit cartes réelles de six cuisines (poulet frit, pizzeria, burger, pâtes, mitraillette, sushi, donburi), collées par le porteur à partir des pages Uber Eats de restaurants, et un parcours de commande maquetté avec lui le 2026-11-11 (https://claude.ai/code/artifact/b5fe41c9-f398-414d-95a7-ae94d245e2d1).

## Décision

### 1. Une option, pas une obligation

Le site de commande est **proposé** à tout établissement, quel que soit son forfait (le forfait qui le porte : voir §8, celui de Nina), et généré depuis son catalogue, ses photos et ses options. Un restaurateur qui n'en veut pas ne le voit pas. Le site vitrine de l'ADR 0088 reste le même ; la commande y est un module.

### 2. Première version : retrait au comptoir, paiement au comptoir

Ni paiement en ligne, ni livraison : chacun aura son ADR. Le client choisit, envoie son prénom et son téléphone, et la commande **sort sur l'imprimante du restaurant** (imprimante réseau ou cloud, sans tablette intermédiaire). L'imprimante confirme : le client voit « reçue par le restaurant » à ce moment-là. Imprimante hors ligne ou pause : les commandes se bloquent côté client. Pas d'étape d'acceptation : le restaurateur dit seulement « prête ».

### 3. Les options des articles (cette PR)

Un article peut avoir des **groupes d'options**, de quatre sortes : **inclus** (compris dans le prix), **variante** (taille, type de pâtes), **extra** (supplément payant, l'upsell), **retrait** (« je le prends sans… », toujours à 0 €, imprimé en gros sur le ticket). « Inclus » ne veut pas dire « obligatoire » : une sauce comprise peut être facultative. Un groupe a un **minimum** et un **maximum** de sélections ; une option a une **quantité maximale** (la même sauce jusqu'à 4 fois), peut être **cochée d'office** (les crudités ; décochée, elle s'imprime « SANS ») et peut **ouvrir des sous-groupes** (un menu dont on choisit les frites, puis la boisson de ces frites, sur trois niveaux au plus).

Les options vivent dans **des tables à part**, pas dans `menu_items` : le catalogue sert aux cadeaux (ADR 0013) et au rapprochement des tickets par le nom (ADR 0067) ; « Cornichon » ou « Fries Medium » y fausseraient les suggestions. Une **bibliothèque d'options** par établissement évite de ressaisir : la sauce « Samouraï » existe une fois, et son prix est porté par chaque groupe qui la propose (0 € dans « Sauce au choix », +1,50 € dans « Sauces supplémentaires »). Les allergènes se renseignent sur la bibliothèque, jamais préremplis comme des faits.

La logique est pure et testée (`lib/menu-options/`) : groupes ouverts, minimum et maximum, prix en centimes, lignes lisibles. **C'est elle qui fait foi côté serveur** quand une commande arrivera : le navigateur envoie ce que le client a choisi, jamais un prix.

### 4. Reprendre les options d'une carte existante

Par l'import du catalogue de l'ADR 0083 : le restaurateur colle le **texte** de sa propre carte (ou des captures), notre code la met au format (noms nettoyés, « 99 » traduit en « sans limite », « SANS X » reconnu comme retrait, sorte de groupe proposée), et le **tableau à vérifier** lui laisse le dernier mot. Les prix des plateformes sont gonflés de 15 à 30 % (ADR 0083) : le prix de commande direct est saisi par le restaurateur. **Pas de scraping des plateformes** (leurs conditions l'interdisent, ADR 0083). L'accès par API officielle (Uber Eats, Deliveroo, sur approbation) est une piste à part.

### 5. Gabarits par type d'établissement (PR suivante)

Un snack arrive avec les sauces, crudités et suppléments habituels déjà proposés, le restaurateur décoche. Données **éditoriales versionnées** dans le dépôt, bâties par fréquence ; **jamais de prix ni d'allergènes préremplis**, rien en ligne sans validation du tableau, et on mesure la part des suggestions gardées.

### 6. Vocabulaire

« Commande » est réservé à la commande directe d'un membre, comptée dans le programme (CONTEXT.md). Une commande passée sur le site s'appelle **commande du site** et ne s'écrit jamais dans `orders` (les tickets). Un point par commande du site pourra être crédité plus tard (PR à part), sans OCR.

### 7. Mise en œuvre de la réception des commandes (PR « commande du site »)

Première tranche de §2, **fermée par un drapeau** : `SITE_ORDER_RESTAURANTS` (identifiants séparés par des virgules, ou « * », **vide au départ**) ; sans lui, la route publique et les routes de la console répondent 404 comme si elles n'existaient pas, y compris pour le super-admin (un vrai client ne doit jamais pouvoir commander par accident). **Ne pas l'ouvrir à un vrai restaurant avant** : la réponse du comptable sur la caisse certifiée (Restent ouverts 3), les conditions sur les données personnelles (la **purge** est écrite, voir plus bas, sa durée reste à confirmer), et le choix de l'imprimante (Restent ouverts 4) ou l'acceptation écrite du restaurateur de lire son écran sans son.

`POST /api/site-orders` reçoit des **identifiants de plats, des quantités et des choix, jamais un prix ni un nom** : le serveur recalcule tout à partir du catalogue et des arbres d'options (`lib/site-orders/order.ts`, via `validateSelection` et `priceCents` de l'ADR 0099 §3). Un plat sans option n'accepte aucun choix ; un plat inconnu, plus proposé, un choix manquant ou impossible, un total au-dessus de 500 € refusent **toute** la commande. Prénom et téléphone nettoyés (8 à 15 chiffres) ; au plus 30 lignes et 20 exemplaires par ligne ; une adresse (hachée, jamais en clair) ne passe pas plus de 6 commandes en 10 minutes. La commande est une **photo figée** (`site_orders.lines`) : un prix changé plus tard ne la réécrit pas ; son numéro est celui du jour, à l'heure de Bruxelles (« N° 0147 »). États : reçue, prête, retirée ou annulée (raison à l'écran, le client n'est pas prévenu : le restaurateur l'appelle) ; un état dépassé n'est jamais écrasé. Dans la console, « Commandes du site » (lien visible seulement si le drapeau est ouvert) se rafraîchit toute seule et montre les tickets de cuisine par coin (ADR 0100 §9). Migration `20261113-2330-site-orders` (deux tables, service role seul) ; fail-open : sans elle, « pas encore activé ».

**Pas dans cette tranche** : la page de commande du client (elle partage routes et mise en page avec le site public, Brigade 15), l'impression, un son d'arrivée (le restaurateur doit garder l'écran ouvert), les points de fidélité pour une commande du site. **Trace** (ADR 0065) : `site_order_refusals` (motif de chaque commande refusée, sans donnée du client) et le délai entre la commande et « prête » (`docs/mesures/suivi-options-menu.sql`, requêtes 10 et 11) ; seuil : plus d'une commande refusée sur cinq pour « choix_invalide » ou « plat_indisponible » = la page client montre des choix que le serveur refuse, à corriger avant d'ouvrir.

**Purge du prénom et du téléphone** (cron `/api/cron/purge-site-orders`, chaque nuit à 3 h 30 UTC, `lib/site-orders/purge.ts`) : ces données ne servent qu'à appeler le client pour retirer sa commande ; au-delà de **30 jours** (réglable par `SITE_ORDER_PURGE_DAYS`, entre 7 et 365) le téléphone est effacé et le prénom remplacé par « — ». La commande elle-même (plats, prix, numéro) reste : c'est une vente du restaurateur, pas une donnée du client. La passe est idempotente ; `?dry=1` compte sans rien effacer ; une panne répond 503 (le cron échoue, Vercel le montre) ; un réglage illisible prend le défaut et le dit dans le résultat. **La durée de 30 jours est un défaut de produit, pas une décision juridique** : à faire confirmer avec les conditions avant d'ouvrir le drapeau (comme pour la purge des missions, ADR 0084 §5). **Trace** : le résultat du cron (commandes concernées et effacées) et la requête 12 de `docs/mesures/suivi-options-menu.sql` (commandes qui portent encore des données au-delà de la durée : doit rester à 0).

### 8. La commande du site est le module de Nina

La brigade (ADR 0089) a un poste pour le site : **Nina** « crée un site qui donne envie de commander ». La commande du site (§2 et §7) est ce qu'elle apporte : le site de Nina, généré depuis la carte (ADR 0088), reçoit les commandes à emporter dont les options, les descriptions, les allergènes confirmés et les tickets de cuisine ont été réglés (ADR 0100). **Forfait et statut : ceux de Nina**, c'est-à-dire Pro et **en pilote**, jamais présenté comme disponible pour tous (ADR 0070), tant que Mehdi et Omar n'ont pas décidé d'ouvrir la commande aux autres forfaits (le §1 le permettait ; Restent ouverts 1).

Dans le code, rien ne lit le forfait : `SITE_ORDER_RESTAURANTS` est la seule porte, établissement par établissement, comme `PUB_RESTAURANTS` pour Emma. Il n'existe pas de générateur d'idées de Nina (`lib/agents/nina.ts`) : c'est un personnage de la brigade. Une idée de Nina au gérant (« ton site est prêt à recevoir des commandes ») passerait par `recordIdeas` comme celles des autres assistants ; elle n'est pas faite.

**Échos à mettre à jour le jour où le drapeau s'ouvre** (ils sont vrais aujourd'hui, car la commande est fermée, et ne doivent pas être changés avant) : le bouton « Commander » de `components/restaurateurs/SiteSection.tsx` (aujourd'hui vers la commande que le restaurant utilise déjà), l'article de blog `site-internet-restaurant-developpeur-ou-boosteats` (« Boosteats ne prend ni commande ni paiement »), `zenchef-ou-boosteats`, `.claude/product-marketing.md` et le test `lib/marketing-pages.test.ts` qui garde ces textes.

## Conséquences

- **ADR à amender si Mehdi accepte** : 0074 §4, 0088 §3, 0070 (statut), et l'ordre de la feuille de route du Pro (ADR 0074 §7 : « site de commande d'un partenaire »).
- **Données personnelles** : le nom et le téléphone d'un client sont des données de ce client ; le restaurant est responsable du traitement, Boosteats son sous-traitant, durée de conservation courte, jamais de croisement avec les membres sans consentement (ADR 0025). À écrire dans les conditions avant la première commande réelle.
- **Responsabilité** : Boosteats fournit un outil ; le restaurateur reste responsable de ses ventes, de ses prix, de ses allergènes et de leur enregistrement dans sa caisse. Le ticket imprimé et un récapitulatif du jour exportable servent à les reporter, quelle que soit la réponse sur la caisse certifiée.
- **Trace** (ADR 0065) : part des lignes corrigées par le restaurateur au tableau à vérifier (qualité de l'import, par import) ; part des suggestions d'un gabarit gardées ; délai entre l'envoi d'une commande et la confirmation de l'imprimante ; commandes non retirées par établissement ; imprimantes hors ligne.
- **Migration** `20261111-1500-menu-options` : cinq tables, service role uniquement, déclencheurs qui refusent de rattacher l'option ou l'article d'un établissement au groupe d'un autre. Le code qui les lit reste tolérant à leur absence.

## Alternatives rejetées

- **Un site de commande confié à un partenaire** (ADR 0074 §7) comme seul chemin : reste possible pour les restaurants équipés d'une caisse qui l'impose, mais ne donne pas à un restaurateur sans site le canal direct qu'il demande.
- **Des options dans `menu_items`** : voir §3.
- **Un modèle d'options propre à Belchicken** : le piège identifié par le porteur. Le modèle a été relu sur six cuisines avant d'être écrit.
- **Lire les cartes des plateformes automatiquement** : conditions d'utilisation, blocages, risque pour tout le projet.
- **Paiement en ligne dès la première version** : Stripe Connect ou équivalent, remboursements, litiges, TVA. Une phase à part, une fois le canal prouvé.

## Restent ouverts

1. Rouvre-t-on l'ADR 0074 §4, et pour quels forfaits ? (§8 : pour l'instant ceux de Nina, Pro en pilote ; l'ouverture aux autres forfaits reste à décider.)
2. Qui pose le générateur de site (Brigade 15) : le site de commande et la vitrine partagent routes et mise en page.
3. La réponse du comptable sur la caisse certifiée (la question sur la TVA de la Pub attend depuis le 2026-10-19).
4. Le choix de l'imprimante cloud (Star CloudPRNT ou Epson Server Direct Print) et qui fournit le matériel.
