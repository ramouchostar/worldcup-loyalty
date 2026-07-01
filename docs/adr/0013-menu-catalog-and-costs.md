# ADR 0013 — Catalogue menu & prix de revient soumis par l'établissement

**Statut** : Accepté

## Contexte

Les articles de récompense et leur coût réel sont aujourd'hui **codés en dur** dans `lib/rewards.ts` (grilles `getSoloReward`, `getCommunityBonus`, `getAdvancementBonus`) et recopiés dans CONTEXT.md / ADR 0006. Ces valeurs sont propres à Belchicken (« Finest burger €0,94 », « Churros 6 pcs €0,31 »…).

Deux limites :

1. **Impossible d'ouvrir le programme à un autre établissement** sans réécrire le code — chaque resto a son menu, ses prix de vente et ses marges.
2. **Le plafond de budget cadeaux (ADR 0012) repose sur ces coûts en dur** : il n'est exact que pour Belchicken.

Par ailleurs, le restaurateur sait quels articles ont la meilleure marge (forte valeur perçue, faible coût) mais n'a aucun outil pour décider quoi offrir. L'app doit pouvoir le **suggérer** à partir de ses vrais chiffres.

## Décision

### 1. L'établissement soumet son catalogue (il le remplit lui-même)

Le restaurateur téléverse un fichier **CSV** (modèle téléchargeable depuis `/admin`) décrivant chaque article. **Une ligne par article, 4 colonnes obligatoires** :

| Colonne | Description |
|---|---|
| `nom` | Nom de l'article (ex. « Finest burger ») |
| `categorie` | Famille menu (ex. « Burger », « Accompagnement », « Dessert », « Boisson ») |
| `prix_vente` | Prix de vente carte — la **valeur perçue** par le client |
| `prix_revient` | **Prix de revient réel** (coût matière) |

Le prix de revient est **saisi par le restaurateur** : pas de décomposition par ingrédients, on ne le calcule pas à sa place (voir « Évolutions »).

### 2. Le catalogue est l'unique source de vérité des articles + coûts

Table `menu_items` :

```sql
CREATE TABLE menu_items (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id      TEXT NOT NULL,
  name               TEXT NOT NULL,
  category           TEXT NOT NULL,
  menu_price         NUMERIC(6,2) NOT NULL,   -- prix de vente (valeur perçue)
  cost_price         NUMERIC(6,2) NOT NULL,   -- prix de revient réel
  is_active          BOOLEAN DEFAULT true,
  reward_eligible    BOOLEAN DEFAULT true,    -- peut être proposé en cadeau
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (restaurant_id, name)
);
```

Re-téléversement = **upsert** sur `(restaurant_id, name)` : met à jour prix/coût ; les articles absents du nouveau fichier passent `is_active = false` au lieu d'être supprimés (préserve l'historique référencé par `pending_rewards`).

Les grilles de récompense (ADR 0006) ne contiennent plus d'articles ni de coûts en dur : **chaque palier référence un `menu_items.id`**. Les **seuils** (montant de commande, score communautaire, tour) restent dans la grille ; seul le **cadeau** vient du catalogue.

### 3. L'app suggère, l'admin décide

Pour chaque emplacement de récompense, l'app classe les articles `reward_eligible` par **attractivité = `menu_price / cost_price`** (forte valeur perçue par euro de coût réel), filtrés pour que le coût projeté reste sous le plafond ADR 0012, et restreints à une catégorie cohérente avec le palier (un petit palier ne propose pas un menu complet).

`@anthropic-ai/sdk` (déjà présent pour l'OCR des tickets) formule la recommandation en clair : *« Pour le palier €15–24, propose les Frites Medium : perçues à 3 €, coût 0,24 € (ratio 12,5), bien sous ton plafond. »* Le restaurateur **accepte ou remplace** — la suggestion n'est jamais appliquée automatiquement.

### 4. Strictement côté admin (respect ADR 0007)

`menu_price` et `cost_price` sont des données euros : **service-role uniquement, jamais exposées à une surface membre**. Le catalogue, l'upload et les suggestions vivent exclusivement sous `/admin`. Aucune API publique ne renvoie ces champs. Toute fuite est une régression ADR 0007.

## Alternatives rejetées

- **Décomposition par ingrédients (nomenclature/BOM)** : calculer le prix de revient à partir des coûts matières. Plus juste mais lourd (recettes, quantités) et hors MVP. Réservé à une évolution alimentée par le projet Ozashi (référentiel prix/kg-L-pièce).
- **Garder les coûts en dur, configurables par variables d'environnement** : ne passe pas à l'échelle (un déploiement = un menu figé) et n'autorise aucune suggestion.
- **Upload XLSX direct** : nécessite une dépendance de parsing. Le CSV (modèle fourni) couvre le besoin sans nouvelle dépendance ; XLSX possible plus tard.

## Conséquences

### Sur le schéma
- Nouvelle table `menu_items` (ci-dessus).
- Les paliers/récompenses référencent `menu_items.id` au lieu de stocker `item TEXT` + `cost NUMERIC` en dur.
- `pending_rewards` continue de **figer** `*_item` (nom) et `*_cost` (coût) au moment de la validation — snapshot historique, insensible aux re-téléversements ultérieurs du catalogue.

### Sur le code
- `lib/rewards.ts` : `getSoloReward` / `getCommunityBonus` / `getAdvancementBonus` lisent l'article assigné au palier dans le catalogue au lieu des `if` codés en dur. Les seuils restent.
- `lib/budget.ts` (ADR 0012) : le coût distribué provient de `menu_items.cost_price` → plafond exact par établissement.
- Nouvelle surface `/admin/menu` : upload CSV + table éditable + bouton « Suggérer les cadeaux ».
- Nouvelle route `app/api/admin/menu/route.ts` (+ import CSV), sur le modèle de `app/api/admin/import-schedule/route.ts`.

### Sur la documentation
- ADR 0006 et ADR 0012 amendés (les grilles chiffrées ne sont plus la source de vérité des coûts).
- CONTEXT.md : ajouter les termes « Catalogue », « Article », « Catégorie », « Prix de revient », « Prix de vente » et signaler que les grilles chiffrées y deviennent des exemples par défaut. **(à faire — non inclus dans ce lot)**

## Évolutions (hors périmètre)

- **Combos / bundles** : un article composite = plusieurs `menu_items` ; coût = somme des `cost_price`, valeur perçue = somme des `menu_price`. L'app proposera les combos au meilleur ratio. S'appuie entièrement sur ce catalogue.
- **Coût par ingrédients** : alimentation automatique de `cost_price` depuis le référentiel Ozashi.
- **Multi-établissement dans une seule app** : `menu_items` est déjà porté par `restaurant_id` → prêt pour la future révision de l'ADR 0005 (déploiements séparés → vrai multi-tenant). Le catalogue par établissement est un pas dans cette direction.
