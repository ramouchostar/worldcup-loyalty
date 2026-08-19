# ADR 0035 — Gérer les équipes depuis la console restaurateur

**Statut** : Accepté (2026-08-19). Complète l'**ADR 0014** (équipes créées par les membres) et l'**ADR 0031** (communautés déclarées). S'appuie sur l'**ADR 0034** : un membre sans équipe est désormais un état normal, ce qui rend une suppression d'équipe inoffensive pour ses membres.

## Contexte

Le restaurateur déclare les communautés qu'il connaît (ADR 0031) mais n'avait aucune vue sur ce que ses clients en font. Concrètement, à Kraainem : six équipes, dont quatre inventées pendant les tests (`Zart`, `ISND`, `saint paule`, `Boosteats`), une cinquième au nom bâclé par son créateur (`hopital Saint luc`), et aucun moyen de faire le ménage autrement qu'en écrivant un script avec la clé service role.

Trois besoins distincts se cachaient derrière « je voudrais gérer les équipes » : **voir** (qui a rejoint quoi, ce que ça pèse), **corriger** (un nom saisi à la va-vite reste affiché à tous les membres), **retirer** (une équipe de test n'a rien à faire dans un classement).

## Décision

### 1. Une page « Équipes », distincte de « Communautés »

`/admin/[restaurantId]/teams`. La séparation est volontaire : dans les réglages, le restaurateur déclare des **noms qu'il connaît** ; ici, il voit les **équipes réelles** que ses clients ont matérialisées. Deux objets différents (ADR 0031 : « une suggestion n'est PAS une équipe »), deux écrans.

Chaque équipe affiche ses membres, leur nombre de commandes et leur dépense — **nom d'affichage uniquement, jamais d'email ni de téléphone** (ADR 0025, même règle que « Mes clients »).

### 2. Le restaurateur ne crée pas d'équipe

Aucun bouton « nouvelle équipe ». Une équipe naît au premier « oui » d'un membre, et ce membre en devient le capitaine — c'est ce qui porte la viralité (ADR 0014, § alternatives rejetées : « équipes créées par l'admin »). Lui laisser peupler la liste produirait des coquilles vides, exactement ce que l'ADR 0031 évite en distinguant suggestion et équipe.

### 3. Archiver par défaut, supprimer seulement sans historique

| État de l'équipe | Action offerte |
|---|---|
| Aucune commande ni changement d'équipe rattaché | Suppression définitive |
| Le moindre historique | Archivage (`is_active = false`), réversible |

Les clés étrangères vers `teams` sont en RESTRICT (`orders`, `memberships`, `profiles`, `transfers`) : une suppression qui « marche » malgré un historique n'existe pas — elle échouerait, ou pire, exigerait une cascade qui effacerait des commandes validées. L'archivage est donc la voie normale, la suppression l'exception réservée aux équipes de test.

À la suppression, les membres sont **libérés** (`memberships.team_id → NULL`), jamais retirés de l'établissement : ils gardent leur compte, leur adhésion et leurs points personnels, et depuis l'ADR 0034 ils continuent d'envoyer leurs tickets. Cette garantie est précisément ce qui rend la suppression acceptable.

### 4. Renommer une équipe renomme la communauté qui l'a matérialisée

Quand l'équipe vient d'une suggestion déclarée, les deux portent le même libellé côté membre. Les renommer séparément afficherait l'ancien nom dans le raccourci d'adhésion et le nouveau dans l'équipe.

## Conséquences

- Le ménage post-test ne demande plus la clé service role : c'est une opération de console, tracée par la garde `requireAdmin`.
- Une équipe archivée conserve son score et son historique ; elle disparaît des surfaces membres sans fausser les cumuls.
- Le restaurateur voit enfin la contrepartie de ses communautés déclarées — quelles suggestions ont pris, lesquelles sont restées lettre morte.
- Rien de nouveau n'est exposé sur les membres : la page reprend la pseudonymisation de « Mes clients ».

## Alternatives écartées

- **Suppression franche avec cascade** — effacerait des commandes validées (donc du chiffre) et, sur `memberships`, éjecterait les membres de l'établissement entier pour avoir retiré une équipe. Disproportionné.
- **Archivage seul, jamais de suppression** — laisse traîner indéfiniment les équipes de test dans la console. Le critère « aucun historique » distingue proprement les deux cas.
- **Fusionner deux équipes** — utile un jour (« Saint-Luc » et « hôpital Saint-Luc » créées en parallèle), mais suppose de transférer scores, historiques et capitaine. Hors périmètre : le lien suggestion → équipe (ADR 0031 §1) empêche déjà le doublon le plus courant.
