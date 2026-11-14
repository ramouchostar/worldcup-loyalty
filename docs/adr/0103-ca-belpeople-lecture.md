# ADR 0103 — Le CA total se lit dans Belpeople, en lecture seule, à côté de la saisie

**Statut** : Proposé (2026-11-14) — décidé par le porteur en session, à valider. Pilote :
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
