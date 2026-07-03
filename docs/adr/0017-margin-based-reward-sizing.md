# ADR 0017 — Dimensionnement des récompenses par les coûts de revient (protection par la marge)

**Statut** : Accepté

## Contexte

L'ADR 0013 a rendu le catalogue (prix de vente + prix de revient) propre à chaque établissement, et l'ADR 0012 plafonne le coût mensuel des cadeaux à `REWARD_BUDGET_PCT` (8 %) du CA programme. Mais ce plafond agit **après coup** : il coupe les bonus quand le mois déborde. Rien ne dimensionne les récompenses **en amont**, au moment où l'établissement soumet ses coûts de revient. Trois angles morts, tous dus au fait que les restos n'ont pas les mêmes coûts ni le même panier moyen :

1. **Paliers solo identiques pour tous** (€15/25/40/60). Un resto à panier moyen €10 avec des articles à €0,30 de coût peut offrir dès €15 sans problème ; un resto à panier moyen €30 dont le cadeau le moins cher coûte €2,50 perd de l'argent sur un palier à €15 (€2,50 de coût pour €15 de recette = 16,7 % — plus du double du budget).

2. **Cadeau des 4 jetons non plafonné**. Le cadeau des actions sociales (« 4 jetons = 1 cadeau ») est codé en dur (« 12 Churros », coût Belchicken €0,63) et n'a **aucune commande en face** : c'est un coût pur, financé par la valeur future de l'action (parrainage, avis). Pour un autre resto, l'article et son coût doivent venir de son catalogue, avec un plafond strict.

3. **Seuils communautaires fixes face à des équipes de taille variable — le plus dangereux.** Le score communautaire est `membres × euros dépensés` et les seuils (1 000/3 000/6 000/10 000 pts) sont fixes. Une équipe de 80 membres atteint 1 000 pts avec **€12,50 de dépense totale** (80 × 12,5), puis les 80 membres reçoivent le bonus sur chaque commande : le resto distribue 80 cadeaux financés par €12,50 de recettes. Plus l'équipe est grande, plus le déblocage est facile ET plus la distribution coûte cher — exactement l'inverse de ce qu'il faut.

## Décision

### 0. Principe commun

> **Le coût réel d'un cadeau doit être couvert par le budget cadeaux (`REWARD_BUDGET_PCT`, défaut 8 %) des dépenses qui l'ont déclenché.**

Toutes les règles ci-dessous en découlent. Les calculs vivent dans `lib/reward-sizing.ts` (fonctions pures, testables, importables côté client car sans donnée sensible — les **valeurs** en euros restent service-role, ADR 0007).

### 1. Paliers solo dimensionnés par établissement

- **Plafond dur** : un article assigné à un palier solo de seuil `S` doit vérifier `cost_price ≤ S × pct`. Enforcé au moment de l'enregistrement (`PUT /api/admin/reward-tiers`) — un palier violant la règle est **rejeté** avec un message explicite (article trop cher ou palier trop bas).
- **Paliers suggérés par resto** : à partir du panier moyen (commandes validées, défaut €25 si aucun historique) et du coût du cadeau éligible le moins cher, l'app calcule 4 paliers : `base = max(0,85 × panier moyen, coût_min / pct)` arrondi aux €5, puis multiplicateurs `×1 / ×5⁄3 / ×8⁄3 / ×4` (calibrés sur la grille historique : panier ~€17,6 → 15/25/40/60). La suggestion IA (ADR 0013 §3) utilise ces paliers et ne propose que des articles **sous le plafond de chaque palier** — filtrage déterministe avant l'appel au modèle, re-validation après.
- Les paliers restent des données par établissement (`reward_tiers.min_threshold`) : l'admin peut les ajuster, le plafond dur s'applique quoi qu'il arrive.

### 2. Cadeau des 4 jetons : plafonné, choisi dans le catalogue

- Nouveau champ `restaurants.jetons_gift_menu_item_id` (m28) : l'article remis pour 4 jetons vient du catalogue. Fallback héritage (« Churros 12 pcs ») tant que rien n'est configuré.
- **Plafond dur** : `cost_price ≤ panier moyen × pct` (~€0,80 pour un panier de €10, ~€2,40 pour €30). Un jeton n'ayant aucune recette en face, on le finance comme s'il déclenchait une commande moyenne. Enforcé au `PUT /api/admin/jetons-gift`.
- **Suggestion** : sous ce plafond, l'app propose l'article au meilleur ratio `prix_vente / prix_revient` (valeur perçue maximale par euro de coût) — l'admin accepte ou remplace, comme en ADR 0013.
- Côté membre, seul le **nom** de l'article est renvoyé (jamais les coûts — ADR 0007).

### 3. Couverture communautaire : troisième verrou, dépendant de la taille de l'équipe

Un palier communautaire (couche 2) ou d'équipe (couche 3) distribue son cadeau à **tous les membres** de l'équipe. Règle de couverture :

> `membres × coût_du_cadeau ≤ dépense_cumulée_de_l'équipe × pct`

- Vérifiée **à chaque résolution** (création de `pending_rewards` et affichage dashboard), car la taille de l'équipe varie dans le temps.
- **Cascade** : si le palier atteint au score n'est pas couvert, on retombe sur le palier couvert le plus élevé (une grande équipe reçoit le petit cadeau tant qu'elle n'a pas assez dépensé pour le gros). Exemple : 80 membres, cadeau à €0,60 → l'équipe doit avoir dépensé `80 × 0,60 / 0,08 = €600` (€7,50/membre) — pas €12,50.
- S'ajoute au double verrou (ADR 0005/0007) et au plafond mensuel (ADR 0012) sans les remplacer. Comme eux, **invisible côté client** : un palier non couvert s'affiche simplement comme non atteint, sans explication (ADR 0007). La couche 1 (solo) n'est pas concernée.
- Les récompenses « pourcentage » de la couche 3 (coût 0, réalisé au comptoir) passent toujours.

### 4. Configuration par défaut dès la soumission des coûts

Sans configuration, un établissement retombe sur la grille héritée Belchicken : paliers non dimensionnés et articles absents de son catalogue. Dès que le catalogue est soumis (onboarding `become-a-partner` ou upload `/admin/menu`), l'app applique donc une **grille par défaut protégée**, calculée de façon déterministe (aucun appel IA) :

- paliers solo dimensionnés (§1) ; premier palier → article au meilleur ratio, paliers suivants → article le plus généreux (prix carte maximal) sous le plafond du palier ;
- paliers communautaires : mêmes plafonds progressifs (la couverture §3 protège de toute façon la distribution) ;
- cadeau des 4 jetons (§2) si non configuré.

**Non-destructif** : une couche déjà configurée n'est jamais écrasée — l'app calcule, le restaurateur révise et ajuste depuis `/admin/menu` (où l'onboarding redirige). Best-effort : un échec de la grille par défaut ne bloque jamais l'import du catalogue.

### 5. Notifications alignées sur la délivrabilité

Le cron de notifications (ADR 0009) n'annonce un palier communautaire (« palier franchi », « palier approchant ») que si le bonus serait **réellement délivré** : grille du catalogue (plus de grille codée en dur), double verrou, plafond budget (ADR 0012) et couverture d'équipe (§3). On ne promet jamais un cadeau que la résolution refuserait.

## Alternatives rejetées

- **Seuils communautaires recalculés en points par équipe** (`seuil = membres² × coût / pct`) : équivalent mathématiquement mais instable (le seuil affiché bougerait à chaque arrivée de membre) et incompatible avec des seuils partagés par toutes les équipes. Le verrou de couverture au moment de la résolution donne le même effet sans toucher aux seuils affichés.
- **Plafonner en avertissant sans bloquer** (admin libre) : le but est de protéger la rentabilité de chaque resto (ADR 0012 : « CRITIQUE ») ; un avertissement contournable ne protège pas. L'admin garde la main sur *quel* article, pas sur la violation du plafond.
- **Dimensionner à l'inscription seulement** : le panier moyen et la taille des équipes évoluent ; la couverture doit être vérifiée à la résolution, pas figée.

## Conséquences

### Schéma
- m28 : `restaurants.jetons_gift_menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL`.

### Code
- `lib/reward-sizing.ts` : `soloCostCap`, `suggestSoloBands`, `pickBestGift`, `coverageSatisfied`, `requiredTeamSpend` (fonctions pures).
- `lib/rewards.ts` : `resolveCommunityBonus` accepte la couverture (`memberCount`, `teamTotalSpent`, `budgetPct`) et cascade vers le palier couvert ; grille héritée traitée pareil.
- `lib/team-tiers.ts` : `resolveTeamTier` applique la même couverture aux articles gratuits.
- `app/api/admin/reward-tiers/route.ts` : rejette les assignations solo au-dessus du plafond.
- `lib/menu-suggest.ts` : paliers solo calculés par resto + filtrage déterministe sous plafond ; renvoie les paliers utilisés.
- `lib/jetons-gift.ts` + `app/api/admin/jetons-gift/route.ts` + carte sur `/admin/menu` ; `/api/micro-rewards` renvoie le nom du cadeau ; page membre dynamique.
- `lib/reward-defaults.ts` : grille par défaut déterministe, appelée par `submitOnboardingMenu` (qui redirige vers `/admin/menu`) et `POST /api/admin/menu`.
- `app/api/cron/notifications/route.ts` : grille catalogue + double verrou + budget + couverture au lieu de la grille codée en dur.

### Documentation
- CLAUDE.md : section règles critiques ADR 0017.
- CONTEXT.md : entrées « Couverture communautaire », « Plafond de palier ».
