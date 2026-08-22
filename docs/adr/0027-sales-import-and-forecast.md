# ADR 0027 — Import des ventes de caisse & prévision de chiffre d'affaires (forecast)

**Statut** : Accepté — **v1 implémentée** (2026-07-26 ; build vert). Reste à faire côté exploitant : appliquer `docs/m45-sales-forecast.sql` dans Supabase, renseigner `restaurants.school_calendar`, peupler `reference_calendar` (calendrier belge officiel), déployer. Décision d'architecture, pas un engagement de résultat : le forecast est une **aide à la décision**, jamais une garantie. Prolonge l'ADR 0007 (euros = admin, jamais membre), l'ADR 0012 (données financières du programme), l'ADR 0020 (`order_time` / créneaux) et les stratégies programmées (m36 `scheduled_broadcasts`).

## Contexte

Le restaurateur ne « voit » aujourd'hui que les ventes **scannées par les membres** (`orders`) — un sous-ensemble **partiel et biaisé** de son activité (seuls scannent ceux qui jouent au programme). Deux besoins liés en découlent :

1. **Import des ventes de caisse** : permettre au restaurateur d'uploader l'export complet de son système de caisse (CSV/Excel) — la **vraie** demande, toutes ventes confondues.
2. **Forecast de CA** : prédire **combien il va faire** (CA total), influencé par la demande de base **et** par la saisonnalité (période de l'année, moment du mois / paye, vacances scolaires, jours fériés, événements) **et** par les actions du programme (promos programmées).

Objectif produit assumé : faire de Boosteats un **outil de gestion** (pas qu'un programme de fidélité) — ce qui l'ancre dans le quotidien du restaurateur et le rend **indispensable**.

## Décision

### 1. Le forecast prédit le **CA total** — vue **admin/restaurateur** uniquement

- Le forecast vise le **chiffre d'affaires total** de l'établissement (pas seulement la part programme). C'est ce que le restaurateur veut piloter, et c'est ce qui rend l'app indispensable à sa gestion.
- **Cloisonnement (rappel ADR 0007)** : l'ADR 0007 protège la vue **membre/client** (jamais d'euros / CA). Le **restaurateur a toujours le droit** de voir ses euros — le forecast, comme la page Ventes et les coûts, est une surface **admin**, gardée par `requireAdmin` / `isEstablishmentAdmin`. **Aucune donnée de forecast ni de vente caisse n'atteint jamais une surface membre.**

### 2. Import des ventes de caisse — table dédiée, jamais affichée ligne à ligne

- Nouvelle table **`restaurant_sales`** (une ligne = une **vente caisse**, cf. glossaire) : `restaurant_id`, `sold_on DATE`, `sold_at TIME` (nullable), `amount NUMERIC`, `source_import_id`, `created_at`. **RLS service-role only** (aucune policy) — même régime que `reward_budget_tracking` / `restaurant_receipt_config`.
- **Import CSV ET Excel (.xlsx)**. Le restaurateur **mappe les colonnes** : `date` (obligatoire), `montant` (obligatoire), `heure` (recommandée — améliore la granularité créneau, cf. ADR 0020). Aperçu + validation d'un échantillon avant enregistrement.
- **Jamais affichée ligne à ligne** : le restaurateur a déjà le détail dans son logiciel de caisse. `restaurant_sales` est **la matière brute du forecast**, point.

### 3. Une seule source pour le forecast : le CSV (pas de fusion avec les scans)

- Le forecast est calculé **uniquement** à partir de `restaurant_sales` (le CSV). Les commandes scannées (`orders`) **ne sont pas** ré-agrégées dans le CA total.
- Conséquence directe : **le double-comptage n'existe pas par construction** — une seule source, rien à dédupliquer entre scans et CSV. Les scans restent au service du **programme** (score, récompenses) ; le CSV au service du **forecast**. Deux mondes séparés.
- La **découverte de clé de ticket** (ADR 0019) est donc **hors périmètre** de ce chantier (elle servait à matcher scan ↔ caisse, ce qu'on ne fait pas ici).

### 4. Idempotence de l'import — remplacement par plage de dates

- Un import **remplace** les `restaurant_sales` de l'établissement **sur la plage `[date_min, date_max]` couverte** par le fichier (delete puis insert dans une transaction). Ré-uploader la même semaine, ou des périodes qui se chevauchent, **écrase proprement** — pas besoin d'un identifiant par vente, pas de doublon possible.
- Chaque import trace une ligne (`sales_imports` : `restaurant_id`, `filename`, `row_count`, `date_min`, `date_max`, `imported_by`, `imported_at`) pour l'audit et l'affichage « dernier import ».

### 5. Moteur de forecast — **déterministe et explicable** (pas de ML, pas d'IA pour le chiffre)

Modèle en couches, chaque facteur **visible** par le restaurateur :

- **L0 — Base (CSV)** : profil de demande **jour-de-semaine × créneau**, lissé sur l'historique importé. C'est le **niveau**.
- **L1 — Calendrier** (multiplicateurs empilables, **calibrés sur le CSV de l'établissement**) :
  - **Paye** : **calculée** à partir du jour du mois (fin/début de mois, mi-mois) — aucune donnée externe.
  - **Jours fériés belges** : **calculés** (fixes + mobiles via Pâques).
  - **Vacances scolaires** : **table de référence plateforme** — la Belgique a **3 calendriers** (communautés **FR / NL / DE**) ; champ **`restaurants.school_calendar` (FR|NL|DE)** déduit du secteur/adresse à l'onboarding, ajustable.
  - **Événements nationaux / sportifs** (Euro, JO…) : **table de référence plateforme**.
- **L2 — Signaux programme (v1 : promos programmées uniquement)** : une **promo programmée** (`scheduled_broadcasts.promo_on`) est un événement daté et net → intégrée comme multiplicateur. Les signaux **flous** (équipes au bord d'un palier, campagnes anniversaire/nudge/winback) sont **différés en v1.5** : ils exigent un historique d'événements programme mesurés pour être calibrés honnêtement (sinon multiplicateur inventé).

Le calcul reste **déterministe et reproductible**. Un LLM (`@anthropic-ai/sdk`) peut éventuellement **rédiger la phrase d'explication**, **jamais** produire le chiffre.

### 6. Données de référence

- **Calculé (aucune table)** : paye, jours fériés belges.
- **Table plateforme `reference_calendar`** (service-role, partagée) : vacances scolaires par **communauté (FR/NL/DE)** et par année + événements **nationaux/sportifs**. Maintenue par la plateforme.
- **Événements locaux** (`restaurant_events`, éditables par le restaurateur) : sa braderie de quartier, un concert voisin, une fermeture… Il connaît son terrain mieux que la plateforme, et l'édition **l'ancre** dans l'outil. Chaque événement porte une date (ou plage) et un sens attendu (hausse/baisse).

### 7. Sortie — **fourchette + niveau de confiance + plancher**

- **Fourchette**, jamais un chiffre sec : « entre €3 800 et €4 600 vendredi ». La largeur reflète la **variance historique** du jour.
- **Niveau de confiance** explicite (**Faible / Moyen / Élevé**), fonction du **volume d'historique** et de la **régularité**.
- **Plancher** : sous **4 semaines** de CSV importé → **pas de forecast**, message « importe encore quelques semaines pour débloquer tes prévisions » (même philosophie que le baromètre ADR 0023 et les insights « pas assez de données »).
- **Explication toujours visible** : les facteurs L1/L2 appliqués (« paye +25 %, Euro +15 %, vacances −10 % ») — le restaurateur comprend le *pourquoi*, donc garde confiance même quand le réel s'écarte.
- **Horizon v1** : **7 jours à venir, jour par jour**, + un **total semaine**. Le mois est trop incertain au démarrage.

## Périmètre v1 / suite

- **v1** : §2–§7 avec **L0 + L1 + promos programmées**. Sortie 7 jours + total semaine, fourchette + confiance, plancher 4 semaines.
- **v1.5** : **L2 complet** (équipes au bord d'un palier, campagnes membres) une fois un historique d'événements programme disponible pour calibrer ; horizon étendu ; back-test automatique (comparer prévu vs réel importé pour afficher la précision passée).
- **Hors périmètre** : ML / séries temporelles avancées ; forecast au niveau article ; toute exposition de vente caisse ou de forecast à un membre.

## Conséquences sur le schéma & le code (pour l'agent d'implémentation)

- **Migration `docs/mNN-sales-forecast.sql`** (idempotente, non-cassante) :
  - `restaurant_sales` (RLS service-role only) + index `(restaurant_id, sold_on)`.
  - `sales_imports` (journal des imports, service-role only).
  - `reference_calendar` (service-role ; vacances FR/NL/DE + événements nationaux) — seedée par la plateforme.
  - `restaurant_events` (événements locaux ; écriture admin via route gardée).
  - `restaurants.school_calendar TEXT CHECK (school_calendar IN ('FR','NL','DE'))`.
- **`lib/sales-import.ts`** : parse CSV/Excel, mapping colonnes, validation, remplacement transactionnel par plage de dates.
- **`lib/forecast.ts`** : L0 (base jour×créneau depuis `restaurant_sales`), L1 (paye/fériés calculés + `reference_calendar` + `restaurant_events`), L2 (promos `scheduled_broadcasts`), calcul fourchette + confiance + plancher. **Déterministe, testable** (dates injectées, pas de `Date.now()` caché).
- **APIs / écrans admin** (gardés `requireAdmin`) : `POST /api/admin/sales-import` (upload + mapping), écran `/admin/[restaurantId]/forecast` (« Prévisions » : 7 jours + total semaine, fourchette, confiance, explication, état « pas assez de données »), gestion des événements locaux.
- **Aucune** surface membre, **aucune** API publique ne renvoie de vente caisse ni de forecast (régression ADR 0007 sinon).
- **Excel** : `.xlsx` lu via **`fflate`** (dézip OOXML, zéro-dépendance, audité) + lecteur maison `lib/xlsx.ts`, **côté client** — le serveur ne reçoit qu'une grille JSON bornée (aucun binaire non fiable dézippé sur notre infra). CSV en natif. Les deux formats convergent vers `parseRowsFromGrid`. Le vieux `.xls` binaire n'est pas supporté (enregistrer en `.xlsx` ou CSV).

## Points à valider par un juriste / à l'implémentation

1. **RGPD** : les ventes caisse importées peuvent contenir des données indirectes ; on n'importe et ne stocke que **date + heure + montant** (pas de PII client). À confirmer que l'export mappé ne charrie pas d'identifiant nominatif.
2. **Exactitude du calendrier scolaire** FR/NL/DE (réforme rythme scolaire communauté française 2022) — source officielle à figer.
3. ~~Choix de la lib de parsing Excel~~ — **résolu** : `fflate` (zéro-dépendance, audité) + lecteur maison `lib/xlsx.ts`, parsing côté client. Le paquet npm `xlsx`/SheetJS (figé en 0.18.5 vulnérable sur npm) et `exceljs` (lourd) ont été écartés.

## Alternatives rejetées

- **Réutiliser `orders` pour les ventes caisse** : rejeté — `orders.user_id`/`team_id` sont `NOT NULL` et déclenchent triggers score + récompenses ; y verser des ventes anonymes casserait le programme et mélangerait données membres et CA brut.
- **Fusionner scans + CSV pour le CA (avec dédup)** : rejeté — le porteur a tranché « CSV seul » ; supprime tout risque de double-comptage et toute dépendance à la clé de ticket.
- **Forecast par ML / séries temporelles (Prophet, régression)** : rejeté en v1 — peu d'historique par resto, infra en plus, perte d'explicabilité ; les multiplicateurs calibrés suffisent et restent lisibles.
- **IA (LLM) pour calculer le chiffre** : rejeté — non reproductible, non fiable sur des maths de série temporelle, coûteux, non explicable. Le LLM ne peut que **rédiger** l'explication.
- **Chiffre unique “punchy”** : rejeté au profit d'une **fourchette + confiance** — un chiffre faux une fois détruit la crédibilité de tout l'outil.
- **Forecast de la seule part programme** : rejeté — le porteur veut le **CA total** (ancrage gestion) ; la part programme reste dérivable en interne mais n'est pas la cible affichée.

---

## Amendement 2026-08-22 — plusieurs calendriers scolaires par établissement

**Constat** : à Bruxelles (et dans les communes à facilités), la clientèle d'un même resto suit des écoles **francophones et néerlandophones** ; un seul `school_calendar` fausse le facteur « vacances » une semaine sur deux (Carnaval FWB ≠ Krokusvakantie, Pâques décalées…).

**Décision** :
- `restaurants.school_calendars TEXT[]` (migration `docs/migrations/20260822-2245-school-calendars.sql`) : **1 à 3** valeurs parmi `FR | NL | DE` (CHECK en base). `school_calendar` (une valeur) est conservée comme **miroir legacy** (= premier élément) ; le code lit la nouvelle colonne et retombe sur l'ancienne si la migration manque (fail-open). Helpers dans `lib/school-calendar.ts`.
- Réglages « Mon établissement » : cases à cocher (au moins une, max trois) à la place du `<select>`.
- Moteur (`lib/forecast.ts`, `schoolCommunities[]`) : deux états calibrés **séparément** pour éviter le double comptage quand les congés se chevauchent (été, Noël) — « Vacances scolaires » (toutes les communautés choisies en congé) et « Vacances scolaires (écoles francophones seulement) » (une partie). Chaque état n'est montré que s'il est calibré (≥ 3 jours d'historique), comme les autres facteurs.
