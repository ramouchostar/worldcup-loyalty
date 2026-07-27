# ADR 0028 — Points client découplés de l'euro (non-dérivables)

**Statut** : Accepté (2026-07-27). **Amende l'ADR 0007** (retire l'exception « dépenses perso en euros » et le score `membres × euros`). Touche l'ADR 0021 (réserve), l'ADR 0006/0017 (paliers). L'ADR 0012 (budget) est **inchangé** — il reste en euros côté serveur.

## Contexte

L'ADR 0007 posait « le client ne voit pas les euros », mais laissait **deux fuites** qui permettent au client de reconstituer les euros :

1. **Le score communautaire valait `membres × dépense cumulée`.** Un client — voire un visiteur anonyme du leaderboard — calcule `score ÷ membres` et **retrouve le CA de l'équipe** (finding d'audit H1).
2. **Les dépenses perso étaient affichées en euros** (« Mes stats »). Or si le membre connaît ses euros **et** voit ses points, il **déduit le taux** (aujourd'hui 1 pt = 1 €, ADR 0021) et reconvertit n'importe quel total de points en euros — y compris le score de son équipe.

Le porteur a tranché : **côté client, zéro euro — même ses propres dépenses ; tout en points ; et les points ne doivent pas être convertibles en euros.**

**Distinction structurante — deux plans de données :**
- **Plan carburant (ingestion)** : tickets scannés, montant saisi une fois, CSV de caisse (ADR 0027). En euros par nature, transitoire ; entre pour *nourrir* l'app.
- **Plan expérience** : ce que l'utilisateur *manipule*. **Client → points. Restaurateur → euros** (CA généré par le programme + euros CSV pour le forecast).

L'euro est la **vérité serveur** ; il ne franchit jamais la frontière vers l'**expérience client**. Il ne faut pas tout prendre au pied de la lettre (« aucun euro ») : la saisie d'un ticket est du carburant, pas de l'expérience.

## Décision

### 1. Deux monnaies, une frontière de transformation
L'euro reste la source de vérité **serveur** (budget ADR 0012, dimensionnement ADR 0017, forecast ADR 0027, CA restaurateur). À la validation d'une commande, le montant (carburant) est **transformé en points** pour l'expérience client. Passé cette frontière, **aucune surface client ne réaffiche d'euro**.

### 2. Calcul des points — non-linéaire + comportemental (équilibre dépense/fréquence, option b)
Points gagnés par commande validée :

> `pts = round( BASE + SCALE_resto × montant^α )`, avec `0 < α < 1`.

- **BASE** : bonus de visite fixe → récompense la **fréquence**, indépendant du montant.
- **montant^α** : composante **dépense**, **concave** (rendements décroissants) → **pas de taux €→pts constant** ; un ticket de €50 ne rapporte pas 2× un ticket de €25.
- **SCALE_resto** : facteur par établissement, **non exposé au client**, calibré sur le panier moyen (points comparables d'un resto à l'autre).
- **Calibrage équilibre (b)** : BASE et la composante dépense contribuent de façon comparable au panier typique — la **fréquence ET la dépense** comptent, aucune ne domine.

### 3. Score d'équipe = somme des points, jamais `membres × euros`
Le score communautaire devient **`Σ points (courbés) des membres`**. Donc `score ÷ membres` = un **point moyen**, pas un euro. La dérivation H1 disparaît **par construction**.

### 4. Non-dérivabilité par découplage, PAS par obscurité
La garantie ne repose pas sur le secret de `SCALE_resto` — elle est **structurelle** :
- BASE (ordonnée à l'origine) + concavité → la relation (€, pts) est une **courbe avec intercept**, pas une droite proportionnelle : aucun « X pts par € » lisible.
- Même un membre qui reconstituerait sa propre courbe **ne peut pas inverser le score d'équipe** : c'est une **somme** sur des membres aux distributions d'achats différentes ; `score ÷ membres` ne redonne pas d'euros sans le détail de chaque membre (inaccessible au client).

Le secret de `SCALE_resto` n'est qu'une marge de confort, jamais la défense principale (pas de sécurité par obscurité).

### 5. Zéro euro côté client (amende l'ADR 0007)
Tous les affichages euros côté client passent en **points** : « Mes stats » (dépense perso), historique « Mes commandes », aperçu de la prochaine commande (le « ~€25 »). **Exception assumée : la saisie du montant du ticket à la soumission reste en euros** — c'est du carburant (donnée du reçu physique), une saisie ponctuelle, pas l'affichage d'une cagnotte.

### 6. Paliers de récompense exprimés en points
- **Paliers communautaires** : en points de score (recalibrés à la nouvelle échelle).
- **Palier solo (par commande, couche 1)** : le serveur choisit le cadeau par bande de montant en euros (carburant) ; le client voit le cadeau comme **conséquence** (« ta commande t'a rapporté : X »), sans euro ni seuil en euros. L'aperçu « prochaine commande » perd le « ~€25 ».
- Les protections (budget ADR 0012, couverture/marge ADR 0017) restent **en euros côté serveur, invisibles**.

## Conséquences sur le schéma & le code (implémentation)

- **`lib/points-model.ts`** (pur, testable) : `pointsForOrder(amount, params)` + params (BASE, α, SCALE_resto) calibrés par resto.
- **Recompute du score d'équipe** : `community_scores.score` ne doit plus valoir `membres × total_spent`. Migration de **backfill** (recalcul depuis l'historique `orders`) + adaptation du trigger de score (m2/m35).
- **`total_spent`** reste en base (vérité serveur pour 0012/0017) mais **ne sort ni n'est dérivable côté client** : le score cesse de l'encoder.
- **Recalibrage des seuils** : paliers communautaires (`reward_tiers` + grilles legacy) et paliers de **réserve** (`saver`, ADR 0021) exprimés dans la nouvelle échelle de points.
- **Réserve (ADR 0021)** : **laissée inchangée après analyse** (2026-07-27). Le ledger reste en **valeur-euro** (`floor(montant)`, 1 pt = 1 €) mais est **déjà affiché en points** → conforme (aucun euro montré). Elle **ne fuit PAS le CA d'équipe** : le score d'équipe utilise la courbe (formule distincte), donc le taux 1:1 de la réserve ne révèle que la dépense *propre* du membre (qu'il connaît déjà). ⚠️ La basculer en points courbés **casserait le plafond de marge ADR 0017 à l'échange** (`cost ≤ seuil × budget_pct`, qui suppose 1 pt = 1 €). Toute évolution = **redesign délibéré** (base-euro explicite pour la marge), jamais une simple bascule du crédit.
- **Sweep client zéro-euro** : tous les `€` / `toLocaleString(...currency...)` des surfaces membre (dashboard, my-rewards, reserve, historique) → points. Admin inchangé.
- **APIs publiques** (`/api/leaderboard`, `/api/scores`) : ne renvoient qu'un score en points **non inversible** (fin de toute valeur ∝ euros) — clôt aussi H1.

## Alternatives rejetées

- **Relabelliser « € » → « pts » (1:1)** : le membre déduit le taux depuis son propre reçu → fuite. Respecte la lettre, casse le fond.
- **Multiplicateur linéaire caché** : inversible depuis un seul couple (€, pts) — sécurité par obscurité, rejetée.
- **Découplage total de la dépense (option a)** : perd l'incitation à dépenser que le restaurateur veut garder.
- **Garder les euros perso côté client** : viole la règle du porteur.

## Périmètre / suite

- **v1** : `lib/points-model.ts` + recompute/trigger du score + sweep client zéro-euro + recalibrage des seuils + migration backfill des scores existants.
- **À caler (produit)** : valeurs de `BASE`, `α`, `SCALE_resto` par resto ; formulation exacte des cadeaux solo sans euro côté client.
