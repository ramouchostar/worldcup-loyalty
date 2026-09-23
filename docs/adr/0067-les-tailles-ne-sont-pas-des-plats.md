# ADR 0067 — Les tailles ne sont pas des plats

**Statut** : Accepté (2026-09-23). Complète l'[ADR 0020](0020-ocr-line-items-and-time.md) (lignes de
ticket) et l'[ADR 0046](0046-rapprochement-catalogue-tickets.md) (boucle de complétion du
catalogue). Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Retour du porteur (2026-09-23) : « le système pense que ce sont de nouveaux plats… mais
Nugget (4), c'est juste quelqu'un qui prend 4 nuggets ».

Sur le terrain, la carte et la caisse n'écrivent pas la même chose :

| Le ticket imprime | La carte contient | Ce que faisait le système |
|---|---|---|
| `Nuggets (4PC.)` | `Nugget (4)` | proposait d'ajouter un nouveau plat |
| `Wings (4PC.)` | `Wings (4)` | proposait d'ajouter un nouveau plat |
| `BelTacos Nuggets` et `Bel Tacos Nuggets` | — | **deux** suggestions pour un seul plat |
| `Nuggets (3PC)` | `Nugget (1/4/8/16)` | proposait un nouveau plat, alors que c'est une taille manquante |

Mesure sur Kraainem : **6 suggestions, dont 3 fausses**. Chaque fausse suggestion fait perdre
du temps au restaurateur et, si elle est acceptée, crée un doublon dans sa carte — donc des
statistiques de ventes fausses.

## Décision

### 1. Un plat a un nom et, parfois, une taille

`lib/menu-quantity.ts` (pur, testé) sépare les deux avant toute comparaison : `(4)`, `(4PC.)`,
`(3 pc)`, `3pc …`, `… x4` donnent tous la même taille. La comparaison du **plat** ignore la
casse, les accents, les espaces et le pluriel ; la comparaison de la **taille** est exacte —
`Nugget (4)` et `Nugget (8)` restent deux articles différents.

Cette lecture sert partout : rattachement des lignes de ticket (`lib/menu-match.ts`),
suggestions de catalogue (`lib/catalog-gaps.ts`), et regroupement des variantes d'écriture.

### 2. Une taille absente n'est pas un nouveau plat

Quand le plat est connu mais pas la taille (`Nuggets (3PC)` alors que la carte a 1, 4, 8 et
16), la suggestion le dit : « ce n'est pas un nouveau plat, c'est une taille absente — déjà au
catalogue : Nugget (1), Nugget (4)… ». Le restaurateur décide en connaissance de cause.

### 3. Côté client, la taille se lit devant

`displayItemName` : « Churros (6) » s'affiche **« 6 Churros »**, « Nugget (4) » → « 4 Nuggets »
(choix du porteur). C'est un **affichage**, jamais un renommage en base : la carte du
restaurateur garde ses libellés, et l'historique des cadeaux n'est pas réécrit. Appliqué au
catalogue « Mes points » et aux grilles de cadeaux, donc aux écrans membre, à la vitrine, aux
messages et au coupon que lit le caissier.

## Conséquences

- Kraainem passe de **6 suggestions à 3**, toutes vraies : un plat manquant (Bel Tacos
  Nuggets, 6 tickets — les deux écritures fusionnées), une taille manquante (Nuggets 3), un
  menu manquant (Spicy Legend Burger Menu).
- Les lignes `Nuggets (4PC.)` et `Wings (4PC.)` rejoignent enfin les ventes du bon article :
  les statistiques du restaurateur gagnent ces tickets.
- Pas de migration : aucune donnée n'est réécrite.
- Limite assumée : un plat dont le nom **contient** un nombre qui n'est pas une taille
  (« 1664 Blanche ») n'est pas coupé, mais un format exotique inconnu passera encore en
  suggestion — c'est le rôle de la boucle de complétion (ADR 0046) de le rattraper.
