# ADR 0100 — Les options des plats se règlent par groupes de plats, à partir du catalogue

**Statut** : Proposé (2026-11-12) — décidé avec Omar en session après maquette validée (https://claude.ai/artifact/KnwLvKxKaFkESZhTYVyTvN). **Précise** l'[ADR 0099](0099-le-site-de-commande-en-option.md) §4 (reprendre les options d'une carte existante) et §5 (gabarits) : le point de départ est le catalogue Boosteats, pas un texte collé, et le gabarit devient un **lot de départ par famille de plats**. N'amende ni l'ADR 0013 (les options restent hors de `menu_items`), ni l'ADR 0083 (le prix de revient reste saisi par le restaurateur).

## Contexte

Un restaurateur qui veut un site de commande a déjà son menu dans Boosteats (nom, catégorie, prix de vente, photo). Lui faire coller le texte d'une plateforme puis relire chaque ligne est long, et il est la cible qui abandonne l'étape (ADR 0083). L'objectif posé par le porteur : **que le restaurateur en fasse le moins possible**. On lit son menu, on repère les plats, on met les options qui correspondent, on lui présente ensemble les plats qui ont les mêmes options, et il valide par groupe.

Preuves, lues en lecture seule sur un corpus de 876 restaurants et 60 624 articles, agrégées, sans nom d'enseigne ni prix (le corpus n'entre pas dans le dépôt, aucun texte n'en est repris) :

- **Dans un même restaurant, les articles d'une même famille ont les mêmes types d'options 89 % du temps** (mitraillette 94 %, durum 94 %, pizza 96 %, burger 69 %). Mettre ensemble par famille est fiable.
- **Durums, pains turcs, paninis et mitraillettes partagent leurs options** quand un restaurant les vend ensemble (76 à 81 % des paires).
- **Le lot d'options que prédit la seule famille est fort pour le snack et faible ailleurs.** Mitraillette : 97 % des vrais types d'options retrouvés ; pizza 46 %, pâtes 54 %, sushi 48 %. Pour une famille « libre », chaque restaurant fait à sa façon.
- **Connaître la cuisine de l'établissement n'améliore pas le lot** : 5 à 10 points de plus d'options retrouvées, mais 6 à 11 points de propositions fausses en plus. La cuisine servira à proposer des familles, pas des options.
- Un restaurant de 63 articles se règle en **3 ou 4 groupes** (médiane, 2 à 7 selon les cartes).

## Décision

### 1. On part du catalogue

L'écran « Options de mes plats » (`/admin/[id]/menu/options`) lit les articles actifs de l'établissement. Rien à saisir ni à coller. Un texte collé qui contient de vrais choix pourra s'y ajouter plus tard et **passera avant** nos propositions.

### 2. Des familles, puis des groupes de plats

Un **dictionnaire de familles écrit à la main** (`lib/menu-options/families.ts`, aucune donnée de plateforme) range chaque article d'après son nom puis sa catégorie. Les articles d'une même famille forment un **groupe de plats** ; durum et pain turc n'en font qu'un, et les boissons, desserts et sauces forment le groupe « sans choix ». Nous **proposons** (jamais n'imposons) d'y ajouter les plats qui vont avec (paninis et sandwichs avec les durums), de réunir deux groupes qui ont souvent les mêmes choix (mitraillettes et durums), et le restaurateur retire, ajoute ou sort un plat qui a d'autres choix. Un article que nous ne savons pas ranger (formule, promotion, inconnu) reste à part : une formule demande ses propres écrans.

### 3. La confiance se dit, par famille

Chaque groupe porte une confiance **mesurée** : *forte* (mitraillette, durum, pain turc, kapsalon : lot préparé à décocher), *moyenne* (tacos, sandwich, panini), *faible* (pizza, pâtes, burger… : des idées à cocher, jamais une réponse), *aucune* (boissons, desserts, sauces). L'écran le dit en une phrase. Le lot de départ de chaque famille est éditorial (`lib/menu-options/packs.ts`), versionné dans le dépôt.

### 4. Jamais de prix préremplis

Nous ne connaissons pas les prix de ses suppléments. Un choix payant ou une variante qui coûte plus que la base **attend son prix** ; un groupe ne se valide pas tant qu'un prix manque (ou que le choix est décoché). Un champ « même prix pour tous » évite de les taper un par un. Aucun allergène n'est préparé à cette étape (ADR 0099 §3).

### 5. Valider un groupe, enregistrer ce qui est validé

« Je valide ce groupe » règle d'un coup tous ses plats. « Enregistrer » n'écrit que les groupes validés ; ce qui n'est pas validé n'existe pas en base. Un groupe se rouvre et se ré-enregistre ; l'enregistrement **remplace** l'ancien réglage des mêmes plats, et l'écran prévient quand des plats en ont déjà.

### 6. L'écriture ne croit pas le navigateur et ne laisse pas de demi-réglage

Le serveur relit la forme, rejoue la validation du modèle (`validateTree`), vérifie que chaque plat est celui de l'établissement, puis écrit : bibliothèque d'options, **nouveaux** groupes (un jeu par groupe de plats, partagé par tous ses plats), liens des plats, et enfin la bascule des anciens liens. Supabase n'a pas de transaction côté client : si quelque chose échoue avant la bascule, les nouveaux groupes sont supprimés (cascade) et l'ancien réglage reste intact ; les anciens groupes devenus orphelins, sous-groupes compris, sont nettoyés ensuite, sans jamais toucher un groupe encore utilisé ailleurs. Tables absentes : l'écran le dit (le code reste fail-open).

### 7. Les descriptions s'écrivent d'après le nom du plat, et rien d'autre

Chaque plat d'un groupe reçoit une description composée **à partir de son nom seulement** (`lib/menu-options/descriptions.ts`), en trois tons au choix (sobre, gourmand, fun). Règle : **jamais un ingrédient, une viande, une origine ou une qualité absents du nom** ; la phrase de ton parle du client, jamais du plat. Un garde-fou (`inventedWords`) rejoue la règle sur chaque texte composé. Une seule question par groupe, pour les burgers (« la viande ? », facultative) ; si le nom dit déjà la viande et que la réponse dit autre chose, le nom gagne et le conflit est signalé. Familles sans confiance (boisson, dessert, sauce, menu…) : pas de description composée. Maximum 300 caractères, sans balise.

Le restaurateur peut réécrire chaque description ; ce qu'il a écrit n'est jamais réécrit par un changement de ton. Source gardée par plat (`generated`, `restaurateur`, `pdf`) dans `menu_items.description` et `description_source` (migration `20261113-1758`). Écriture **fail-open** : si les colonnes manquent, les options s'enregistrent quand même, l'écran le dit et le groupe reste « à enregistrer ».

**Trace** (ADR 0065) : par groupe, descriptions composées, gardées, réécrites, vidées (`docs/mesures/suivi-options-menu.sql`, requêtes 5 et 6). **Seuil** : plus d'un tiers retouché (même seuil que l'import du catalogue, ADR 0083) → la règle « d'après le nom » est à revoir.

### 8. Le PDF du menu : ce que le restaurateur a écrit, relu et confirmé

Facultatif, après les descriptions. Le restaurateur envoie son PDF (4 Mo au plus, limite d'un corps de requête sur Vercel) ; Claude **recopie** pour chaque plat son nom, sa description imprimée et les allergènes **imprimés** (jamais déduits, jamais de liste vide, le texte du PDF est une donnée et non une consigne), puis le code rapproche chaque ligne d'un plat du catalogue (`lib/menu-options/pdf.ts`). **Un rapprochement n'est gardé que s'il est sans ambiguïté** : mêmes mots à l'ordre près, ou au moins trois quarts de mots communs avec un seul plat candidat, et une seule ligne pour ce plat. Sinon la ligne reste « à part » et le restaurateur la voit ; on ne rapproche jamais « au plus ressemblant ».

Ce qui vient du PDF est une **proposition à relire**. La description s'écrit avec la source `pdf` (ou `restaurateur` s'il la retouche) et une description composée par nous ne la recouvre plus jamais ; les allergènes, eux, ne deviennent un fait que par la **confirmation du restaurateur, plat par plat** : `menu_items.allergens` vaut `NULL` (pas confirmé : le site dira « demande-nous au comptoir », jamais « aucun »), `{}` (confirmé : aucun des 14) ou la liste confirmée, avec `allergens_confirmed_at`. Changer la liste défait la confirmation. Un geste « j'ai tout relu » confirme d'un coup les plats dont les allergènes sont écrits dans le PDF ; il ne confirme jamais un plat sans allergène écrit. Écriture : le serveur revérifie tout (liste fermée des 14 allergènes du règlement UE 1169/2011, longueur, appartenance des plats) et ne touche que ce que le restaurateur a décidé. Migration `20261113-2130` ; fail-open (rien n'est écrit, l'écran le dit).

**Trace** (ADR 0065) : table `menu_pdf_imports`, une ligne par enregistrement, des compteurs seulement (lignes lues, rapprochées, rapprochées « de près », à part, plats sans ligne, descriptions gardées ou retouchées, listes d'allergènes corrigées ou confirmées ; `docs/mesures/suivi-options-menu.sql`, requêtes 7 et 8). **Seuils** : moins de deux tiers des lignes rapprochées, ou plus d'un quart des listes d'allergènes corrigées, et la lecture est à revoir avant d'aller plus loin. **Limite connue** : écrit sans PDF réel (le restaurateur n'en a pas fourni) ; un PDF scanné en image, ou une mise en page à colonnes, peuvent être mal lus, ce que la trace dira.

## Conséquences

- **Données** : une table de trace `menu_option_setups` (migration `20261112-0417`, service-role seul), à appliquer à la main à la fusion. Sans elle, les options s'enregistrent et le journal le dit.
- **Trace** (ADR 0065) : par enregistrement et par groupe de plats, la **part de nos choix proposés que le restaurateur garde**, les lignes qu'il change, les prix qu'il met, les plats proposés gardés, retirés ou ajoutés, la part des plats que nous avons rangés d'eux-mêmes (`docs/mesures/suivi-options-menu.sql`). **Seuil** : sous deux tiers de choix gardés pour une famille, ses propositions sont à revoir ou la famille passe à « faible ».
- **Échos** : `CONTEXT.md` (famille de plats, groupe de plats), lien depuis « Menu & coûts », ADR 0099 §4 et §5 précisés. Aucun écran membre, aucune commande, aucun paiement : rien n'est visible d'un client.
- **Limites connues** : le corpus vient de cartes de plateformes, très belges pour le snack ; les familles « faibles » seront corrigées par la trace, pas par une nouvelle intuition.

## Alternatives rejetées

- **Partir d'un texte collé** (ADR 0099 §4 seul) : le restaurateur a déjà son menu chez nous, et l'étape qu'on lui demande est celle qu'il repousse.
- **Un groupe par article** : 63 validations au lieu de 3 ou 4.
- **Préremplir tous les lots comme des réponses** : faux pour pizza, pâtes ou sushi (la moitié des types d'options seulement). Un lot faible présenté comme une réponse se valide sans être lu.
- **Préremplir des prix ou des allergènes à partir du corpus** : un prix inventé est pire qu'un prix manquant (ADR 0083), un allergène déduit n'est pas un fait (ADR 0099 §3).
- **Choisir le lot selon la cuisine de l'établissement** : mesuré, ça n'améliore pas les options.

## Restent ouverts

La suite est décidée dans la maquette validée, pas dans cette PR :

1. ~~Descriptions~~ : faites, voir §7.
2. ~~PDF du menu~~ : fait, voir §8. Reste à coordonner avec la Brigade 15 (générateur de site) : lire `description` et `allergens` (`NULL` = « demande-nous au comptoir »).
3. **Aperçu du site, tickets par coin de cuisine** (le nom du client en grand, un ticket par zone).
4. Les règles sur les allergènes à la vente à distance (règlement UE 1169/2011, art. 14) sont à faire confirmer avant la première commande réelle.
