# ADR 0015 — Pivot plateforme : un réseau de restaurants en libre-service (remplace le modèle 3-Belchicken)

**Statut** : Accepté (2026-07-01) — cadré en session avec l'utilisateur (§ Décisions confirmées). Cet ADR **supersede l'ADR 0005** et **amende l'ADR 0014 §1 et §4** ainsi que `CONTEXT.md` § Établissements.

## Contexte

Le programme a démarré comme un dispositif de fidélité pour **3 restaurants Belchicken** liés à la Coupe du Monde 2026 (ADR 0005) : un déploiement Vercel séparé par établissement, un membre choisit "son" Belchicken à l'inscription et n'en change jamais (règle documentée dans `CONTEXT.md` § Établissements — *"Un membre appartient à un seul établissement — choisi à l'inscription, non modifiable"*).

Le projet change d'échelle. L'objectif devient une **plateforme de fidélité que n'importe quel restaurant peut rejoindre**, avec un client qui garde **une seule app** quel que soit le nombre de restaurants qu'il fréquente — au lieu d'installer une app différente par enseigne. C'est aussi un levier commercial : montrer à un restaurateur prospect qu'il y a déjà des clients actifs dans son secteur (ADR de suivi, § Évolutions hors périmètre).

Investigation préalable (session du 2026-07-01) : le code contient déjà un signe de dérive vers ce modèle — `app/(auth)/register/page.tsx` propose un choix entre 3 restaurants à l'inscription (`ALLOWED_RESTAURANTS`) — mais `getRestaurantId()` (utilisé dans ~40 endroits : dashboard, équipes, commandes, classement, admin, cron) ignore ce choix et retourne toujours la variable d'environnement fixe du déploiement. Ce bug devra être corrigé au moment de l'implémentation (hors scope de cet ADR, qui ne touche pas au code).

## Décision

### 1. Un seul déploiement sert tous les restaurants (supersede ADR 0005)

Fin du modèle "1 déploiement Vercel = 1 établissement, verrouillé par variable d'environnement". Une seule app, un seul déploiement, capable de servir un nombre croissant de restaurants. `restaurant_id` reste la clé d'isolation des données (comme aujourd'hui), mais n'est plus figé par l'environnement — il est déterminé par le contexte de navigation du membre (établissement consulté) plutôt que par le déploiement.

### 2. Un membre peut appartenir à plusieurs établissements simultanément

Amende ADR 0014 §1. La règle *"un membre appartient à au plus une équipe par établissement"* reste vraie **par établissement**, mais un membre n'est plus limité à un seul établissement au total — il peut être membre (avec au plus une équipe) dans chacun des restaurants du réseau qu'il fréquente.

### 3. Adhésion à un restaurant = libre

Cohérent avec l'adhésion aux équipes (ADR 0014 §2) : rejoindre un restaurant du réseau ne nécessite pas d'invitation — un membre peut parcourir/rejoindre n'importe quel établissement actif, comme il pousserait la porte de n'importe quel restaurant.

### 4. Score, paliers et budget cadeaux restent scopés par restaurant

Aucun changement à ADR 0007 (jamais d'euros/CA côté client) ni à ADR 0012 (plafond budget cadeaux = % du CA propre de l'établissement, double verrou basé sur la croissance de CET établissement). Chaque établissement garde son économie totalement isolée — c'est déjà le modèle actuel (`community_scores.restaurant_id`, `restaurant_thresholds.restaurant_id`) et il n'y a aucune raison d'y toucher.

### 5. Changement d'équipe : cooldown scopé par établissement (amende ADR 0014 §4)

Le cooldown "1 changement d'équipe par mois" (anti score-surfing) protège l'économie d'un établissement donné. Il devient **scopé par restaurant** : changer d'équipe chez le resto A n'affecte pas le droit de changer d'équipe chez le resto B. Nécessite d'ajouter `restaurant_id` à la table `transfers` (actuellement absent — le cooldown est aujourd'hui appliqué globalement par erreur, cf. investigation `lib/teams.ts`).

### 6. Onboarding restaurant en self-service, avec validation manuelle avant mise en ligne

Un restaurateur peut créer son établissement lui-même (formulaire d'inscription — flow détaillé dans une ADR de suivi). Le restaurant reste **invisible aux clients** (statut `pending`) jusqu'à validation manuelle par le super-admin plateforme — contrôle qualité pendant la phase de lancement, évite les comptes non sérieux ou test.

### 7. Rôles admin à deux niveaux

- **Admin établissement** = le compte qui a créé le restaurant (`restaurants.owner_id`), sur le modèle "capitaine" déjà utilisé pour les équipes (ADR 0014 §2, §3). Un seul admin par établissement pour l'instant — pas de co-admins/gérants (évolution possible si le besoin est validé, § Évolutions hors périmètre).
- **Un restaurateur peut posséder plusieurs établissements** — `restaurants.owner_id` peut référencer plusieurs lignes `restaurants` (pensé dès le départ pour les chaînes/franchises).
- **Super-admin plateforme** (l'opérateur de la plateforme) : rôle au-dessus de tous les établissements — approuve les nouvelles inscriptions (§6), voit les statistiques cross-restaurant (argument commercial). Bootstrap par variable d'environnement, sur le modèle de l'actuel `ADMIN_EMAILS`.

### 8. Branding différé

L'app et le repo gardent leurs noms de travail actuels ("Belchicken", `worldcup-loyalty`) le temps de stabiliser le cœur technique multi-établissements. Un vrai passage de rebranding (nom de plateforme, logo, repo, domaine) fera l'objet d'une ADR/session dédiée.

Nuance technique à ne pas perdre : même sans rebranding complet, tout le texte UI actuellement codé en dur pour Belchicken (nom affiché, liens sociaux) devra devenir **dynamique par établissement** dès l'implémentation du cœur multi-resto — sinon un membre qui rejoint un 2ᵉ restaurant verrait "Belchicken" partout. C'est un prérequis technique du pivot, indépendant de la question du rebranding produit.

### 9. Carte/page "activité par secteur" — confirmée, hors scope immédiat

Fonctionnalité in-app réelle (pas seulement un argument oral en rendez-vous commercial) : une page montrant l'activité (membres, équipes actives) par secteur/zone géographique, utilisable comme pitch devant un restaurateur prospect. Nécessite un champ secteur/zone sur `restaurants` (MVP : texte libre ville/quartier ; évolutif vers géolocalisation). Renvoyée à une **ADR de suivi dédiée**, une fois le cœur multi-établissements posé.

## Modèle de données (esquisse — non exécutable, à affiner à l'implémentation)

```sql
-- Nouvelle table : un établissement du réseau (remplace le "1 resto = 1 déploiement" d'ADR 0005)
CREATE TABLE restaurants (
  id          TEXT PRIMARY KEY,                 -- slug, ex. 'kraainem'
  name        TEXT NOT NULL,
  owner_id    UUID REFERENCES profiles(id),      -- admin établissement (§7)
  sector      TEXT,                              -- zone/quartier — MVP texte libre (§9)
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'disabled')),  -- §6
  google_maps_url  TEXT,
  instagram_url    TEXT,
  tiktok_url       TEXT,
  facebook_url     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Nouvelle table : appartenance d'un membre à un établissement (remplace profiles.restaurant_id + profiles.team_id comme source de vérité)
CREATE TABLE memberships (
  user_id       UUID REFERENCES profiles(id) NOT NULL,
  restaurant_id TEXT REFERENCES restaurants(id) NOT NULL,
  team_id       UUID REFERENCES teams(id),        -- nullable tant que pas d'équipe choisie (§2)
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, restaurant_id)
);

-- transfers : cooldown scopé par établissement (§5)
ALTER TABLE transfers
  ADD COLUMN restaurant_id TEXT REFERENCES restaurants(id);
```

`profiles.restaurant_id` et `profiles.team_id` (colonnes uniques actuelles) deviennent obsolètes comme source de vérité — remplacés par `memberships`. La stratégie de migration exacte (colonnes dérivées vs suppression complète, sort des lignes `profiles` existantes) sera tranchée au moment de l'implémentation, pas dans cet ADR.

## Conséquences sur les autres ADR / docs (à appliquer une fois cet ADR accepté)

- **ADR 0005** — superseded (déploiement séparé par restaurant → un seul déploiement multi-établissements, §1).
- **ADR 0014** — amendée : §1 (un membre → plusieurs établissements, une équipe max par établissement, §2) ; §4 (cooldown changement d'équipe scopé par établissement, §5).
- **CONTEXT.md** — réécrire § Établissements (**Établissement** : un membre appartient désormais à N établissements ; **Déploiement par établissement** : obsolète, remplacé par un déploiement unique multi-tenant) ; ajouter les nouveaux termes **Restaurant/Établissement en self-service**, **Admin établissement**, **Super-admin plateforme**, **Statut restaurant (pending/active)**.
- **`lib/restaurant.ts`** (`getRestaurantId()`) — doit cesser de retourner uniquement la variable d'environnement fixe ; doit résoudre le restaurant à partir du contexte de navigation du membre (bug identifié en investigation, à corriger à l'implémentation).
- **Code à faire évoluer à l'implémentation** : tout usage de `profiles.team_id` / `profiles.restaurant_id` comme colonnes uniques (dashboard, my-team, orders, notifications, admin sandbox, triggers SQL `update_community_score()` / `update_member_counts()` / `handle_first_team_join()`) devra être réécrit pour passer par `memberships`. Inventaire détaillé disponible dans la session d'investigation du 2026-07-01 (non reproduit ici — à refaire/vérifier au moment de l'implémentation, le code aura bougé).

## Décisions confirmées (session du 2026-07-01)

1. **Onboarding** — self-service pour les restaurateurs (§6).
2. **Argument "clients actifs par secteur"** — vraie fonctionnalité in-app, pas juste un pitch oral (§9).
3. **Branding** — différé, pas dans cette étape (§8).
4. **Rôles admin** — deux niveaux, un restaurateur peut posséder plusieurs établissements, un seul admin par établissement pour l'instant (§7).
5. **Validation restaurant** — manuelle par le super-admin avant mise en ligne (§6).

## Alternatives rejetées

- **Garder un déploiement par restaurant (ADR 0005 inchangé)** : incompatible avec l'objectif "une seule app pour tous les restaurants" — c'est précisément ce que le pivot vise à corriger.
- **Restaurants visibles immédiatement à l'inscription (pas de validation)** : plus simple, mais expose à des comptes non sérieux/test pendant la phase de lancement — rejeté en faveur du contrôle qualité manuel (§6).
- **Co-admins par établissement dès le départ** : sur-conception avant qu'un besoin réel soit exprimé par un restaurateur — reporté (§ Évolutions hors périmètre).
- **Rebranding immédiat** : bloquerait la conception du cœur technique sur une question de nom/identité — reporté (§8).

## Évolutions (hors périmètre de cet ADR)

- **Flow UI self-service complet** pour les restaurateurs (formulaire d'inscription établissement, upload menu, configuration seuils CA) → ADR de suivi.
- **Carte/page "activité par secteur"** (§9) → ADR de suivi, une fois le cœur multi-établissements posé.
- **Co-admins par établissement** (gérants, employés) → si un restaurateur en exprime le besoin.
- **Rebranding complet** (nom de plateforme, logo, domaine, repo) → ADR/session dédiée.
