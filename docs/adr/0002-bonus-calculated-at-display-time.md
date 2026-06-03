# Le bonus de tour (×1.5) est calculé à l'affichage, pas stocké en base

Le bonus de 48h accordé quand une équipe passe un tour est appliqué uniquement au moment d'afficher le score — jamais persisté dans `community_scores`. La colonne `round_advanced_at` sur `teams` (alimentée automatiquement par trigger quand `round_reached` change) permet de calculer si le bonus est encore actif.

## Pourquoi pas stocker le score bonifié

Si le score bonifié était stocké, une erreur admin (mauvais `round_reached`) nécessiterait une correction manuelle des données. En ne stockant que `round_advanced_at`, toute correction de `round_reached` se répercute immédiatement sur l'affichage sans migration de données.

## Conséquence

Toute couche qui lit le score (API leaderboard, dashboard membre) doit appliquer la formule : `displayScore = score × (1.5 si NOW() - round_advanced_at < 48h, sinon 1)`. Ne jamais lire `community_scores.score` directement pour l'affichage sans passer par cette fonction.
