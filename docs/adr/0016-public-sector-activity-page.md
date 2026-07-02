# ADR 0016 — Page publique "activité par secteur"

**Statut** : Accepté (2026-07-02) — ADR de suivi annoncée par l'ADR 0015 §9, cadrée en session avec l'utilisateur (visibilité publique confirmée).

## Contexte

L'ADR 0015 a posé le cœur multi-établissements (un déploiement unique, memberships, onboarding self-service, rôles admin à deux niveaux). Son §9 confirmait une fonctionnalité in-app réelle — pas seulement un argument oral en rendez-vous commercial : montrer l'activité du réseau (membres, équipes actives) par secteur géographique, pour prouver à un restaurateur prospect qu'il existe déjà une clientèle fidélisée dans sa zone. Le §9 renvoyait le cadrage à une ADR dédiée une fois le cœur posé — c'est cet ADR.

Au moment du cadrage, `restaurants` possède `address` (texte libre) et `cuisine_types`, mais pas encore de champ secteur (la migration m27 l'avait volontairement laissé de côté).

## Décision

### 1. Page publique `/secteurs`

La page est **publique, sans authentification** — le restaurateur prospect vérifie lui-même l'activité de son secteur, ce qui prolonge le funnel self-service de l'ADR 0015 §6 (landing → "Devenir partenaire" → preuve sociale → inscription). Elle sert aussi de support de pitch en rendez-vous.

### 2. `restaurants.sector` — texte libre ville/quartier (MVP confirmé 0015 §9)

- Nouvelle colonne `sector TEXT` sur `restaurants` (migration m30), **distincte de `address`** : l'adresse localise un établissement précis, le secteur est la maille d'agrégation commerciale (ex. "Molenbeek", "Kraainem", "Ixelles — Flagey").
- **Obligatoire à l'inscription partenaire** (`/become-a-partner`) — sans secteur, l'établissement n'apparaîtrait dans aucune agrégation.
- Backfill des établissements existants dans la migration.
- Pas de géolocalisation ni de liste fermée à ce stade — évolutif (§ Évolutions).

### 3. Contenu : agrégats non sensibles uniquement

Par secteur, la page affiche : **nombre d'établissements actifs**, **adhésions membres** (lignes `memberships`), **équipes actives**, et la liste des noms d'établissements (déjà publics sur `/join`). 

**Jamais d'euros, de CA ni de volumes de commandes** — l'ADR 0007 s'applique au public comme aux membres, et les chiffres d'affaires des établissements du réseau ne regardent pas leurs concurrents prospects.

Seuls les restaurants `status = 'active'` comptent : un établissement `pending`/`disabled` reste invisible (cohérent ADR 0015 §6).

### 4. Groupement tolérant à la casse et aux accents

Le secteur étant du texte libre, l'agrégation se fait sur une clé normalisée (minuscules, accents retirés, espaces réduits) — "Molenbeek" et "molenbeek " forment un seul secteur. Le libellé affiché est celui de la première occurrence. La normalisation vit côté application (pas de contrainte SQL) pour rester ajustable.

## Modèle de données

```sql
-- m30
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sector TEXT;
UPDATE restaurants SET sector = 'Kraainem' WHERE id = 'kraainem' AND sector IS NULL;
```

## Conséquences

- `/become-a-partner` : champ "Ville / quartier" obligatoire (validation applicative).
- `/platform` : la file d'approbation affiche le secteur déclaré — le super-admin vérifie sa cohérence avant mise en ligne.
- `CONTEXT.md` : nouveau terme **Secteur**.
- Un restaurant actif sans secteur (données antérieures à m30 non backfillées) est regroupé sous "Secteur non renseigné" plutôt qu'exclu — visible, donc corrigeable.

## Alternatives rejetées

- **Réservée au super-admin (/platform)** : garde le contrôle du discours mais tue l'effet self-service — le prospect ne peut pas vérifier seul, décision utilisateur en faveur du public.
- **Dériver le secteur de `address`** : le parsing d'adresses libres est fragile et l'adresse est optionnelle ; un champ dédié obligatoire est plus fiable.
- **Liste fermée de secteurs** : prématuré tant que le réseau est petit — le texte libre + normalisation suffit, une taxonomie pourra émerger des données réelles.
- **Carte géographique interactive** : sur-conception au stade MVP — une liste agrégée porte le même argument commercial ; la carte reste une évolution.

## Évolutions (hors périmètre)

- Géolocalisation réelle (lat/lng) et carte interactive.
- Filtre par type de cuisine (`cuisine_types` est déjà là).
- Édition du secteur par l'admin établissement après mise en ligne (aujourd'hui : figé à l'inscription, corrigeable par le super-admin en SQL).
