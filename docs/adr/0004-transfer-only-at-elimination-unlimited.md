# Le transfert est autorisé uniquement à l'élimination, sans limite de fois

Un membre ne peut changer de communauté que lorsque son équipe courante est marquée éliminée (`eliminated_at IS NOT NULL`). Il peut transférer autant de fois que nécessaire si ses équipes successives sont éliminées. Aucun transfert volontaire en dehors de l'élimination.

## Pourquoi pas le transfert libre

Le transfert libre permet le "score-surfing" : rejoindre la communauté la plus forte juste avant le déblocage d'un palier sans avoir contribué à son score. Cela vide le programme de son sens communautaire.

## Pourquoi pas limiter à 1 transfert

Limiter à un seul transfert pénalise les membres malchanceux dont la 2e équipe est aussi éliminée — une situation hors de leur contrôle. L'élimination comme seul déclencheur suffit à prévenir le gaming.

## Conséquence

La page `/transfer` et le bouton de transfert ne sont affichés que si `profile.team.eliminated_at IS NOT NULL`. La route API `/api/transfer` vérifie cette condition côté serveur avant tout traitement.
