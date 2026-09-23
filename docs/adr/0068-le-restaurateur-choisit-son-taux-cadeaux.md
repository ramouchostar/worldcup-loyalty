# ADR 0068 — Le restaurateur choisit son taux cadeaux

**Statut** : Accepté (2026-09-23). Amende l'[ADR 0012](0012-reward-budget-cap-and-incremental-threshold.md)
(le plafond mensuel n'est plus 8 % partout) et l'[ADR 0061](0061-les-cadeaux-se-choisissent-avec-ses-points.md)
(le taux, déjà propre à chaque établissement depuis le 2026-09-19, devient réglable par son
gérant). Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le taux cadeaux — la part des encaissements rendue en cadeaux — pilote tout : prix du
catalogue en points, plafond mensuel, couverture des cadeaux d'équipe, plafonds de paliers.
Il était figé à 8 %, puis réglé **à la main en base** pour Kraainem (4 %, le 2026-09-19).

Deux problèmes : chaque demande de restaurateur passe par une migration, et surtout **un
pourcentage ne dit rien** à un gérant de fast-food. Le propriétaire de Kraainem a d'ailleurs
demandé « 16 % » en croyant être moins généreux, alors que c'était l'inverse.

## Décision

### 1. Un taux se choisit entre 4 % et 12 %

Le gérant ou son manager le règle depuis sa console (page **Taux cadeaux**) ; les sièges
équipe n'y ont pas accès, comme pour les seuils (ADR 0041 §6). Bornes vérifiées **en base**
(`set_reward_pct`), pas seulement dans l'écran. En dessous de 4 %, le programme ne récompense
plus assez pour faire revenir ; au-dessus de 12 %, la marge d'un fast-food ne suit pas.

### 2. On montre ce que le taux donne, jamais ce qu'il rapporterait

L'écran traduit le pourcentage en deux langues calculables, avec les **vrais chiffres** de
l'établissement (panier moyen, articles, chiffre d'affaires du programme) :

- **la vitesse** : « Magnifique Beef Menu : 1 020 points, soit 6 tickets » à 4 %, « 510 points,
  3 tickets » à 8 % ;
- **le coût** : « au plus 49 € ce mois-ci, sur 1 226 € encaissés par le programme », et ce qui
  a déjà été offert.

**Aucune promesse d'acquisition.** Rien dans nos données ne relie un taux à un nombre de
clients ; l'affirmer serait inventer. Ce que l'on fera à la place : `reward_rate_changes` garde
chaque changement (qui, quand, de combien à combien), ce qui permettra plus tard de comparer
l'activité avant et après — une mesure, pas une promesse.

### 3. Changer le taux ne fait perdre de points à personne

Baisser le taux rend les cadeaux plus chers en points. Les soldes des clients sont donc
**ajustés dans la même transaction** (8 % → 4 % : ×2 ; 4 % → 8 % : ÷2), pour que la valeur en
cadeaux de ce qu'ils ont gagné ne bouge pas (décision du porteur). L'écran l'annonce avant
d'enregistrer, et le confirme après (« 9 clients ont vu leur solde ajusté »).

## Conséquences

- Migration `20260923-1200` : `reward_rate_changes` (historique) et `set_reward_pct` (taux +
  soldes, atomique, réservée au rôle serveur).
- `lib/reward-rate.ts` est pur et testé : bornes, aperçu (vitesse et coût), multiplicateur de
  soldes, choix des trois articles repères.
- Le taux reste lu partout par `getRestaurantBudgetPct` (ADR 0061 amendé) : aucun écran ne
  garde un 8 % en dur.
- Limite assumée : un restaurateur peut se tromper dans les bornes autorisées. Le garde-fou
  est l'écran (vitesse et coût côte à côte), pas une interdiction ; l'historique dira si un
  établissement fait le yoyo.
