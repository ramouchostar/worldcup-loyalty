# Le transfert est autorisé uniquement à l'élimination, sans limite de fois

> **Statut : Superseded par l'[ADR 0014](0014-member-created-community-teams.md) (2026-06-24).** Avec le pivot vers des équipes communautaires permanentes, l'élimination disparaît : le changement d'équipe devient volontaire mais limité à **une fois par mois** (anti score-surfing), tandis que *rejoindre* une équipe reste libre. Le texte ci-dessous est conservé pour mémoire.

Un membre ne peut changer de communauté que lorsque son équipe courante est marquée éliminée (`eliminated_at IS NOT NULL`). Il peut transférer autant de fois que nécessaire si ses équipes successives sont éliminées. Aucun transfert volontaire en dehors de l'élimination.

## Pourquoi pas le transfert libre

Le transfert libre permet le "score-surfing" : rejoindre la communauté la plus forte juste avant le déblocage d'un palier sans avoir contribué à son score. Cela vide le programme de son sens communautaire.

## Pourquoi pas limiter à 1 transfert

Limiter à un seul transfert pénalise les membres malchanceux dont la 2e équipe est aussi éliminée — une situation hors de leur contrôle. L'élimination comme seul déclencheur suffit à prévenir le gaming.

## Conséquence

La page `/transfer` et le bouton de transfert ne sont affichés que si `profile.team.eliminated_at IS NOT NULL`. La route API `/api/transfer` vérifie cette condition côté serveur avant tout traitement.
