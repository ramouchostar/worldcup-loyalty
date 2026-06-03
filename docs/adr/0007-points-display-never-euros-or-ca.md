# ADR 0007 — Le client ne voit jamais d'euros ni de seuil CA

**Statut** : Accepté

## Contexte

Le double verrou repose sur deux conditions : score communautaire ET seuil CA restaurant. Afficher le CA du restaurant au client crée plusieurs problèmes :
1. Le client se demande pourquoi ses efforts communautaires ne suffisent pas — sentiment d'injustice.
2. Divulguer le CA cible d'un restaurant est une information commerciale sensible.
3. La mécanique du double verrou devient une excuse pour ne pas récompenser — perception négative du programme.

## Décision

**Côté client : score communautaire en points, dépenses personnelles en euros.**

Deux règles distinctes selon le type de donnée :

**Score communautaire → points uniquement**
Le score est affiché en points (valeur brute : `membres × euros`). Les seuils des paliers sont exprimés en points. Le seuil CA restaurant est entièrement absent. Règles :
- Tous les composants de score/classement utilisent `pts`, jamais `€`.
- Un palier non satisfait s'affiche "verrouillé 🔒" sans raison explicite.
- La barre de progression affiche : `score actuel / seuil en points`.
- `is_unlocked` de `restaurant_thresholds` → donnée admin uniquement, jamais exposée côté client.

**Dépenses personnelles → euros autorisés**
La section "Mes stats" du dashboard peut afficher les euros du membre ("3 commandes · €200 dépensés"). Ce sont les propres dépenses du membre, pas le score communautaire — c'est une donnée transparente et attendue. L'euro n'est masqué que pour protéger la logique business (CA restaurant, score collectif), pas pour masquer au membre ce qu'il a lui-même dépensé.

## Pourquoi pas "expliquer honnêtement au client"

Montrer au client que le restaurant n'a pas atteint son objectif de CA revient à dire "vous avez fait votre part mais le restaurant n'a pas fait la sienne". Même si c'est techniquement vrai, ce message détruit la confiance envers le programme. Le double verrou est une protection business, pas une règle équitable du point de vue client — elle ne doit pas être visible.

## Conséquence

- Toutes les routes API publiques (`/api/leaderboard`, `/api/rewards`, `/api/dashboard`) calculent le statut débloqué/verrouillé côté serveur sans jamais exposer `target_revenue`, `current_revenue` ou `is_unlocked` dans la réponse JSON client.
- L'interface admin (/admin/thresholds) est la seule vue où ces données sont visibles.
- Les tests d'intégration doivent vérifier que les routes publiques ne leakent aucune donnée CA.
