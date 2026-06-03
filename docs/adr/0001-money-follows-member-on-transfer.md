# L'historique de dépenses suit le membre lors d'un transfert

Quand un membre transfère vers une nouvelle communauté (équipe éliminée), son total de dépenses validées est déplacé de l'ancienne équipe vers la nouvelle. Le trigger `on_team_change` recalcule les `community_scores` des deux équipes concernées.

## Pourquoi pas l'inverse

L'alternative naturelle — laisser l'argent dans l'équipe d'origine — pénalise les membres qui ont bien joué le jeu avant l'élimination de leur équipe. La règle métier fondamentale du programme est "le restaurant récompense ceux qui ont dépensé". Couper le lien entre le membre et ses euros au moment du transfert contredit cette règle.

## Conséquence

Le trigger `on_team_change` doit : (1) soustraire le `total_spent` du membre de l'ancienne équipe dans `community_scores`, (2) l'ajouter à la nouvelle équipe. `total_spent` du membre = somme des `amount` des commandes `validated` de ce membre.
