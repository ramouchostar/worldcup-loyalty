# ADR 0103 — Le CA total se lit dans Belpeople, en lecture seule, à côté de la saisie

**Statut** : Accepté (2026-11-14, Mehdi) — **amendé le 2026-11-14** : Belpeople remplace la saisie (§4 bis), les conditions du §2 (accord écrit du siège) et du §4 (14 jours de mesure) sont levées par le porteur. Pilote :
Belchicken Kraainem. **Amende l'[ADR 0078](0078-ca-du-jour-saisi-a-la-main.md)** (qui refusait de se
connecter à Belpeople avec l'identifiant d'un restaurant) : la lecture devient possible, à des
conditions strictes, parce que la caisse Belchicken (S4D) n'est pas sur HubRise et que Belpeople
expose une **API de données** (pas seulement des écrans). Complète l'[ADR 0102](0102-ca-lu-par-hubrise.md)
(HubRise ne donne que les plateformes ; Belpeople donne le **total**). Appliqué avec le bouclier de
l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

L'ADR 0078 avait refusé de se connecter à Belpeople, le portail de rapports du franchiseur
Belchicken, pour trois raisons : un portail fait pour des humains (lecture d'écran fragile),
l'accès appartient au franchiseur, et un mot de passe qui ouvre plus que les ventes.

Essai en lecture seule du 2026-11-14 (compte d'Aram, propriétaire de Kraainem, **accord donné**) :

- Belpeople est une application **Supabase**. Connexion par **e-mail + mot de passe**, **sans
  double authentification** (`aal1`). On lit donc une **API de données** (REST PostgREST), pas des
  écrans : robuste, contrairement à ce que craignait l'ADR 0078.
- Table `agg_sales_daily` : par restaurant (`store_id`) et par jour (`business_date_utc`), le **CA
  TTC** (`gross_inc_vat`), le **CA HT** (`gross_exc_vat`), le **nombre de commandes** et les
  articles vendus. `store_id = 223` pour Kraainem = le `store_code` de nos tickets.
- Données réelles et complètes (Kraainem ≈ 2 800–4 700 € TTC/jour), **tous canaux réunis** : c'est
  le CA total que vise la saisie de l'ADR 0087, pas seulement les plateformes.
- **Fraîcheur** : les données se remplissent avec **quelques jours de retard** (le 2026-11-14, le
  dernier jour plein était le 08/11). Comportement normal de Belpeople, confirmé par le porteur.
- Le compte voit **les 64 restaurants** de la chaîne : accès large → on ne lit que Kraainem.

## Décision

### 1. Lecture seule, un restaurant, pas d'écran

- Boosteats lit l'API de données de Belpeople **en lecture seule**, pour le **seul** `store_id`
  autorisé (223, Kraainem). Jamais d'écriture, jamais de lecture d'un autre restaurant, jamais la
  table `restaurants` de Belpeople (elle porte `target_revenue` et d'autres données de la chaîne).
- On lit `agg_sales_daily` : jour, CA TTC, CA HT, nombre de commandes. Rien d'autre.

### 2. L'accès ne vit jamais dans le dépôt ni en clair

- L'e-mail et le mot de passe du compte Belpeople sont saisis par un super-admin dans un
  **formulaire de `/platform`**, rangés **chiffrés dans Supabase Vault** (JSON, via `pos_store_token`,
  comme le jeton HubRise). Jamais dans le chat, jamais dans le dépôt, jamais relisibles en clair.
- L'URL Supabase et la clé publique de Belpeople (valeurs publiques de son application) sont des
  **variables d'environnement** (`BELPEOPLE_SUPABASE_URL`, `BELPEOPLE_ANON_KEY`), pas codées dans le
  dépôt : les identifiants de Belchicken restent hors de notre code public.
- **Condition d'ouverture** : un **accord écrit du siège** Belchicken (le portail appartient au
  franchiseur, pas à l'exploitant). Tant qu'il n'est pas là, la lecture ne tourne pas en continu.

### 3. Une fenêtre glissante, pas « hier »

- Comme Belpeople se remplit en différé, la lecture de nuit relit **les 10 derniers jours** à
  chaque passage et met à jour `pos_daily_sales` : un jour qui se complète après coup est rattrapé.
- Une erreur (connexion refusée, double authentification apparue, API changée) est **dite** sur
  `/platform/ca` (rouge) et tracée (`pos_connections.last_failed_*`), jamais un faux chiffre.

### 4. À côté de la saisie, jamais à la place — tant que l'écart n'est pas mesuré

- **Phase 1 (mesure)** : le CA total Belpeople s'affiche sur `/platform/ca`, **à côté** du total
  saisi par le restaurateur (ADR 0087) et, pour recoupement, du total HubRise des plateformes. Rien
  n'est écrit dans `daily_revenue_entries` ni `restaurant_sales`.
- **Phase 2 (pré-remplissage)** : après **14 jours comparables** avec un écart ≤ **2 %** entre
  Belpeople et la saisie, on pré-remplit le total du jour depuis Belpeople ; le restaurateur valide
  toujours. La valeur garde sa source (`belpeople`). Décision à acter par amendement.

### 4 bis. Belpeople remplace la saisie (amendé le 2026-11-14, décision de Mehdi)

Le porteur lève les conditions des §2 et §4 : Kraainem n'a **jamais** saisi son CA à la main
(aucune ligne `daily_revenue_entries` au 2026-11-14), la phase de comparaison n'a donc rien à
mesurer, et la saisie n'est plus utile quand la caisse elle-même est lue.

- Le cron (et « Relire » / « Recharger l'historique ») écrit chaque jour **rempli et terminé** chez
  Belpeople (`revenueEntriesFrom`, `lib/belpeople/model.ts`) dans `daily_revenue_entries` :
  `amount` = CA TTC, `tickets` = commandes, `outcome = 'historique'` (un chiffre venu d'ailleurs, hors
  taux de réponse du test), `source = 'belpeople'` (migration `20261114-2000-ca-source-belpeople`),
  et la vente caisse du même jour dans `restaurant_sales`, comme `save_daily_revenue_console`.
  Stats, « Ta progression », prévisions et Chloé lisent donc le chiffre sans autre changement.
- **Belpeople fait foi** : il remplace une saisie du même jour (le détail par canal est vidé). Le
  nombre de saisies remplacées est tracé (`replaced` dans le journal `belpeople_sync`).
- **Un jour vide n'est jamais 0 €** : il attend. Au-delà de 10 jours toujours vide, il est signalé
  en rouge sur `/platform/ca` (`staleDays`) — fermé, ou Belpeople en retard, à l'équipe de juger.
- **On ne demande plus rien** à un établissement connecté (`readsRevenueFromBelpeople`) : pas de
  rappel du soir, pas de tâche « CA de … à saisir », pas d'idée « Tu n'as pas noté hier », pas de
  lien « Noter le chiffre d'hier » ni de barre à corriger dans Stats. Le retard de Belpeople
  (~6 jours) est assumé : les niveaux du jeu de la croissance (ADR 0081) se comptent en semaines.
- Fail-open : une connexion illisible répond « non connecté » (on redemande la saisie plutôt que
  de se taire) ; une écriture refusée met la connexion en échec, dit en rouge sur `/platform/ca`.
- Reste à faire (maquette d'abord) : la page de saisie `/admin/[id]/ca/[jour]` en lecture seule
  pour un établissement connecté (« Lu dans Belpeople »).

### 5. Les ventes par heure, pour le personnel (ajouté le 2026-11-14)

La table `agg_sales_hourly` (heure, CA, commandes par `store_id`) est lue par le même cron, dans la
même fenêtre, et rangée dans `pos_hourly_sales` (SANS donnée client). `/platform/ca` en tire un
**profil des heures pleines et creuses** (moyenne des commandes par heure de Bruxelles, en semaine
et le week-end, sur 28 jours ; pur et testé, `lib/belpeople/hourly.ts`) — pour caler le personnel.
Une heure est « pleine » à ≥ 66 % du pic du jour, « creuse » à ≤ 33 %. Opérationnel, console seule,
rien côté membre.

### 6. Ventes par produit : on explore d'abord (ajouté le 2026-11-14)

Mehdi veut que « Ventes par plat » (console) montre le **total de la caisse**, pas seulement les
tickets du programme. Avant de construire, un bouton « Explorer les ventes par produit » sur
`/platform/ca` (super-admin) liste les tables de produits et de ventes de Belpeople et en lit **5
lignes au plus, filtrées sur le seul magasin autorisé** ; une table sans colonne magasin est
seulement décrite ; les colonnes qui pourraient porter une donnée client ne sont **jamais** lues
(`lib/belpeople/explore.ts`, testé). Rien n'est enregistré ; chaque exploration est journalisée
(`belpeople_explore`). La page « Ventes par plat » sur le total sera décidée sur cette base
(finesse des périodes, rapprochement produit ↔ carte pour la marge), maquette d'abord.

Belpeople refuse la liste des tables à ce compte (401 sur la description OpenAPI) : l'exploration
sonde des noms. Ceux de la page « Ventes de produits » de Belpeople ont été lus dans le **code
public** de son site (2026-11-14, aucun mot de passe) : `v_agg_products_sold_daily` / `_weekly` /
`_monthly` (filtrées par `store_id`, période `business_date` / `week_start` / `month_start`,
quantités par produit et par canal) et la fonction `report_food_cost_product_sales(p_store_ids,
p_months)` (CA TTC et HT par produit et par mois). `v_odoo_product_sales_monthly` est une table de
la centrale d'achat, **toute la chaîne sans magasin** : jamais lue.

**Construit (2026-11-14, maquette validée par Mehdi : https://claude.ai/artifact/R5gSvUfuMLQwv1vb5XcQqg)** :
la lecture de nuit (et « Recharger l'historique ») range `v_agg_products_sold_daily` du seul magasin
dans `pos_product_sales` (jour, canal, produit, quantité ; migration `20261114-2200`, appliquée).
Belpeople ne donne pas le CA par plat (la fonction `report_food_cost_product_sales` n'a rien renvoyé
à ce compte) : « Ventes par plat » montre par défaut **Toute la caisse** — quantités × prix et coûts
de la carte (CA et marge **estimés**, dit sur la page), part par canal, part des articles achetés
par les clients du programme — et garde la vue **Clients du programme** telle quelle. Un produit de
la caisse est rattaché à la carte par nom + taille (ADR 0067), jamais deviné entre plusieurs tailles ;
les produits non reconnus et les plats sans coût sont listés (`lib/belpeople/products.ts`, testé).

**Hors de cet ADR, à décider avec le porteur** : les **ventes par produit** (`v_odoo_product_sales_monthly`,
mensuelles, par `product_id`, avec des euros) et leur usage pour des **offres personnalisées** côté
membre. Cela touche l'ADR 0007 (jamais d'euros ni de seuil au membre), l'ADR 0025 (aucune donnée
client) et la brigade (ADR 0089) : un chantier produit à part, pas une simple lecture.

## Conséquences

- Migration `20261114-1130-belpeople-lecture.sql` : `pos_connections.provider` accepte `belpeople` ;
  table `pos_daily_sales` (RLS sans policy). Coffre réutilisé (`pos_store_token`/`read`/`forget`).
- `lib/belpeople/` (logique pure testée, API REST serveur, stockage) ; cron
  `/api/cron/belpeople-sync` (nuit) ; formulaire d'accès et affichage sur `/platform/ca`.
- **Trace** : par jour, CA Belpeople ↔ total saisi ↔ Uber HubRise, écart en € et % ; dernière
  lecture réussie, dernier échec et sa cause ; fenêtre relue.
- **ADR 0007 inchangé** : ces chiffres restent dans `/platform` ; rien vers un membre.
- `CONTEXT.md` (« CA du jour » : la connexion Belpeople devient possible, sous conditions) et
  `CLAUDE.md` (variables `BELPEOPLE_*`).

## Alternatives rejetées

- **Lecture d'écran (navigateur automatisé)** : l'ADR 0078 avait raison de la refuser ; l'API de
  données la rend inutile.
- **Écrire tout de suite dans le CA du jour** : une source non mesurée fausserait comparaisons et
  prévisions (ADR 0081) ; on mesure d'abord.
- **Rapport Belpeople par e-mail** : piste plus propre (pas de mot de passe stocké, fonction
  `send-franchisee-report` repérée dans l'app) ; à préférer si le siège l'ouvre — un amendement
  remplacera alors la connexion directe.
- **Stocker l'URL et la clé de Belpeople dans le dépôt** : ce sont les identifiants d'un tiers ;
  variables d'environnement.
