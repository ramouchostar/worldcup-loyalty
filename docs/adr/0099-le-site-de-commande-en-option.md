# ADR 0099 — Le site de commande, en option, avec des options d'article

**Statut** : Proposé (2026-11-11), par Omar. **Demande à Mehdi d'amender** l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md) §4 (« prise de commande, paiement, livraison » hors du produit), l'[ADR 0088](0088-site-referencement-pro.md) §3 (« la commande reste ailleurs », aucun paiement chez nous) et l'[ADR 0070](0070-plans-croissance-pro-commande-en-ligne-et-referencement.md) (le site de commande Boosteats). **Rien de ce qui suit n'est décidé** tant que Mehdi ne l'a pas accepté ; cette PR n'ajoute que les options des articles, sans écran, sans commande, sans paiement.

## Contexte

Les restaurateurs qui arrivent chez nous dépendent des plateformes (Uber Eats, Deliveroo, Takeaway) pour recevoir des commandes, avec 15 à 30 % de commission. Un site de commande à leur marque, généré depuis leur catalogue, leur donnerait un canal direct sans commission. Un partenaire de livraison est évoqué, rien n'est signé.

L'ADR 0074 §4 l'a sorti de la feuille de route pour trois raisons : le support, les allergènes, la complexité. L'ADR 0088 y ajoute une raison de conformité : en Belgique, un restaurant équipé d'une caisse enregistreuse certifiée devrait y enregistrer aussi ses commandes en ligne. **Cette raison n'est pas établie.** Les sources consultées le 2026-11-10 se contredisent (seuil de 25 000 € de repas sur place ou 10 % du chiffre d'affaires ; la vente à emporter est soit exclue soit incluse) et aucune source officielle n'a été lue. Un restaurateur à qui nous avons déjà livré un site de commande avec imprimante affirme n'avoir rien eu à certifier, mais son cas (petit chiffre d'affaires sur place ?) n'est peut-être pas général. À faire confirmer par le comptable ou le SPF Finances avant la première commande réelle.

Ce qui a été examiné avant d'écrire cet ADR : huit cartes réelles de six cuisines (poulet frit, pizzeria, burger, pâtes, mitraillette, sushi, donburi), collées par le porteur à partir des pages Uber Eats de restaurants, et un parcours de commande maquetté avec lui le 2026-11-11 (https://claude.ai/code/artifact/b5fe41c9-f398-414d-95a7-ae94d245e2d1).

## Décision (proposée)

### 1. Une option, pas une obligation

Le site de commande est **proposé** à tout établissement, quel que soit son forfait (le forfait qui le porte est à décider), et généré depuis son catalogue, ses photos et ses options. Un restaurateur qui n'en veut pas ne le voit pas. Le site vitrine de l'ADR 0088 reste le même ; la commande y est un module.

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

## À valider par Mehdi

1. Rouvre-t-on l'ADR 0074 §4, et pour quels forfaits ?
2. Qui pose le générateur de site (Brigade 15) : le site de commande et la vitrine partagent routes et mise en page.
3. La réponse du comptable sur la caisse certifiée (la question sur la TVA de la Pub attend depuis le 2026-10-19).
4. Le choix de l'imprimante cloud (Star CloudPRNT ou Epson Server Direct Print) et qui fournit le matériel.
