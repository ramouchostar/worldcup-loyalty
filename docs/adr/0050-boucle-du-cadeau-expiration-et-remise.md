# ADR 0050 — La boucle du cadeau se referme : expiration tenue, remise mesurée

**Statut** : Accepté (2026-09-09). Implémente la fenêtre de 48 h de l'[ADR 0011](0011-redemption-coupon-anti-fraud.md)
(décidée, jamais construite — constat déjà posé par l'[ADR 0021](0021-personal-points-reserve.md) §6)
et corrige la définition de la métrique « récupération » de l'[ADR 0033](0033-console-plateforme-demo-chiffres-backlog.md) §2.
Ne change rien au calcul des cadeaux (**ADR 0006**, **0017**), au cycle du coupon
10 minutes (**ADR 0011** §Coupon actif), à la réserve (**ADR 0021**) ni à
l'anti-fraude (**ADR 0008**). Aucune migration : `expired` est dans le CHECK de
`pending_rewards.status` depuis l'ADR 0006.

## Contexte

Le bilan du pilote Kraainem (backlog plateforme, échéance 2026-09-11) demandait
trois chiffres, dont « % des cadeaux validés effectivement récupérés au comptoir
avant expiration 48 h ». En allant le chercher, deux défauts sont apparus — le
second rendait le chiffre non seulement faux mais **structurellement** faux.

**1. Rien ne fait expirer un cadeau.** L'ADR 0011 écrivait : « Un job cron
(toutes les heures) passe les récompenses expirées à `status = 'expired'` ». Il
n'a jamais existé. Au 2026-09-09, cinq cadeaux de Kraainem étaient `available`
depuis deux à trois semaines, dont **trois anniversaires** (ADR 0024). Or l'index
partiel un-seul-actif de l'ADR 0011 interdit de créer un cadeau tant qu'un autre
est `available` : ces cinq membres ne recevront **aucun cadeau** à leur prochaine
commande validée. Le piège se déclenche exactement sur le retour que tout le
programme cherche à provoquer, et il est muet — `createPendingReward` traite le
conflit `23505` comme un no-op attendu, ce qu'il est.

Côté membre, l'écran « Mes récompenses » affichait déjà « ⏰ Expire très
bientôt ! » sur ces cinq cadeaux, indéfiniment, avec un bouton « Récupérer »
toujours actif. La promesse de 48 h était tenue par le texte, jamais par la base.

**2. La tuile « Récupération » mesurait l'ouverture du coupon, pas la remise.**
`lib/health-metrics.ts` comptait `pending_rewards.status = 'redeemed'`. Ce statut
est posé par `POST /api/redemption/generate` **dès que le membre ouvre son
coupon** — c'est un compare-and-swap délibéré, la garde anti-double-coupon. Il ne
dit rien de ce qui s'est passé au comptoir. Le fait « le cadeau a été remis »
vit ailleurs : `redemption_tokens.redeemed_at`, posé par le bouton « Cadeau
remis » (`/admin/coupon/[token]`).

Sur Kraainem : **6 coupons ouverts, 0 remise confirmée**. La tuile annonçait
**100 %**. Et elle ne pouvait afficher que 100 % ou rien, puisque son
dénominateur (`redeemed + expired`) contenait un terme qui n'arrivait jamais,
faute du cron du défaut n° 1. Deux bugs qui se couvraient l'un l'autre.

## Décision

### 1. La fenêtre de 48 h est tenue à deux endroits, pour deux raisons

- **Un cron horaire** (`/api/cron/expire-rewards`, `0 * * * *`) passe à
  `expired` tout cadeau resté `available` au-delà de sa fenêtre. C'est ce qui
  **libère le slot** du membre, donc son cadeau suivant. Horaire et pas
  quotidien : sur une fenêtre de 48 h, une passe par jour laisserait traîner
  jusqu'à 72 h de cadeau fantôme — et le slot bloqué avec.
- **Une garde à la demande** dans `POST /api/redemption/generate` : un cadeau
  hors fenêtre est refusé (410) et clos sur place. Le refus devient
  **déterministe**, au lieu de dépendre de l'instant où le cron a tourné pour la
  dernière fois. Elle clôt aussi la ligne immédiatement : le membre n'attend pas
  l'heure ronde pour redevenir éligible.

Le prédicat est **partagé et pur** (`isClaimWindowOver`, `lib/reward-expiry.ts`,
`now` injecté) précisément pour que les deux chemins ne puissent pas dériver
l'un de l'autre — c'est la faute classique quand un cron et une route
réimplémentent la même règle.

Le balayage ne touche **que** `available` : `redeemed` signifie que le membre est
venu (ce n'est plus une expiration) et `banked` est un choix délibéré (ADR 0021).

### 2. Pas de rétroactivité douce — et c'est l'intention

À sa première passe, le cron fait expirer les **cinq** cadeaux actuellement en
limbes à Kraainem. Aucune fenêtre de grâce n'est accordée, pour trois raisons :

- ces cinq cadeaux affichent « Expire très bientôt ! » depuis des semaines : la
  base rejoint ce que le membre a lu, elle ne lui retire pas une promesse ;
- aucun de ces cinq membres n'est revenu depuis (rétention mesurée à 0 %), donc
  personne n'est en train de compter dessus ;
- **c'est l'expiration qui répare leur compte.** Les garder ne préserve pas un
  cadeau, ça maintient le blocage du suivant.

Une constante de date de grâce aurait par ailleurs survécu des années au
problème d'un jour.

### 3. « Récupération » veut dire remise confirmée au comptoir

La métrique de `/platform/stats` devient :

> `redemption = cadeaux remis (redemption_tokens.redeemed_at) ÷ cadeaux tranchés`

où **tranché** = coupon ouvert (`status = 'redeemed'`) + jamais réclamé
(`status = 'expired'`). Un cadeau encore `available` n'a pas fini ses 48 h : on
ne sait pas de quel côté il tombera, il reste hors du calcul.

Le compte au numérateur ne peut pas dépasser celui des coupons ouverts : la
création d'un token exige `status = 'available'` et l'a déjà basculé en
`redeemed`, donc **au plus un token par cadeau**.

La tuile porte en plus la **décomposition** — « N coupons ouverts par un membre ·
M confirmés au comptoir · P cadeaux jamais réclamés » — parce que le taux seul ne
dit pas où la boucle casse. Un membre qui n'ouvre jamais son coupon et un
comptoir qui ne clique jamais sur « Cadeau remis » sont deux problèmes opposés,
avec deux remèdes opposés : le rappel d'un côté, la formation du caissier de
l'autre. C'est le même raisonnement que l'ADR 0037 §Contexte sur les deux
lectures du haut de l'entonnoir.

### 4. Rien ne change côté membre au-delà de la vérité

Aucun nouveau texte, aucun nouvel écran. Le seul changement visible est qu'un
cadeau réellement périmé rejoint « ⏱ Expirées » au lieu de rester récupérable —
et que le bouton refuse alors, avec un message qui ouvre la suite plutôt que de
constater la perte : « Ce cadeau n'est plus récupérable. Ta prochaine commande
t'en ouvre un nouveau. » Le message ne dit ni « validé », ni « automatique »
(ADR 0008), ni aucun euro (ADR 0007/0028).

## Alternatives rejetées

- **Compter la remise depuis `pending_rewards.status`, en ajoutant un statut
  `remitted`.** Ferait de la table des cadeaux la mémoire d'un geste de comptoir
  que `redemption_tokens` enregistre déjà, avec le risque de deux sources de
  vérité qui divergent. Le fait est là où il est produit.
- **Poser `status = 'redeemed'` seulement à la remise** (et non à l'ouverture du
  coupon). Reviendrait à défaire le compare-and-swap anti-double-coupon : deux
  onglets ouvriraient deux coupons valides pour le même cadeau. Le commentaire
  de `generate` documente déjà pourquoi ce choix a été fait, et il tient.
- **Expiration paresseuse seule** (pas de cron, on clôt à la lecture). Ne
  libérerait le slot que si le membre ouvre « Mes récompenses » — or celui qui
  ne revient pas ne l'ouvre pas, et c'est précisément lui qui est bloqué. Le
  blocage doit se lever sans le membre.
- **Un cron quotidien** (aucun cron à ajouter au-delà des trois existants). Sur
  une fenêtre de 48 h, ça laisse jusqu'à 72 h de cadeau fantôme, et le slot
  bloqué avec — pour économiser 23 invocations par jour.
- **Une fenêtre de grâce à la mise en service.** Voir §2 : elle protégerait cinq
  cadeaux que personne ne réclame, au prix de maintenir cinq comptes bloqués et
  d'une constante de date à porter indéfiniment.
- **Convertir le cadeau expiré en points de réserve.** Déjà pesé et rejeté par
  l'ADR 0021 §6 : l'urgence des 48 h est le moteur du retour, et « Mettre de
  côté » offre déjà l'échappatoire active. Rien de nouveau ici.

## Conséquences

### Code
- `lib/reward-expiry.ts` (nouveau) : `REWARD_CLAIM_WINDOW_HOURS`,
  `claimDeadline`, `isClaimWindowOver` (purs, testés) et `expireStaleRewards`.
- `app/api/cron/expire-rewards/route.ts` (nouveau) + entrée `vercel.json`
  (`0 * * * *`) — quatrième cron, gardé par `CRON_SECRET` comme les trois autres.
- `app/api/redemption/generate/route.ts` : garde de fenêtre → 410, ligne close
  sur place.
- `app/r/[restaurantId]/my-rewards/RedeemButton.tsx` : un 410 rafraîchit la page,
  pour que la carte rejoigne « Expirées » au lieu de garder un bouton inerte.
- `lib/health-metrics.ts` : `redemption` lit `redemption_tokens.redeemed_at` ;
  `couponsOpened` / `giftsRemitted` / `rewardsExpired` exposés pour la
  décomposition.
- `components/platform/HealthMetricTile.tsx` : prop `note` optionnelle.
- `app/platform/stats/page.tsx` : libellé aligné sur ce qui est réellement
  mesuré, décomposition affichée.

### Mesure
- La tuile « Récupération » va **chuter de 100 % à 0 %** sur le réseau réel. Ce
  n'est pas une régression : c'est le premier chiffre juste qu'elle ait affiché.
- La première passe du cron crée cinq lignes `expired` (voir §2) : le
  dénominateur cesse d'être dégénéré, la métrique devient lisible.
- Effet de bord utile : le taux de cadeaux jamais réclamés devient enfin
  observable, alors qu'il valait zéro par construction.

### À surveiller
- **Le geste du comptoir.** 0 remise confirmée sur 6 coupons ouverts peut
  vouloir dire que le caissier ne connaît pas l'écran `/admin/coupon/[token]`,
  qu'il remet le cadeau sans cliquer, ou qu'il ne remet rien. La donnée ne
  départage pas ces trois lectures — seule une visite sur place le fera. C'est
  le pendant exact de l'ADR 0037 : instrumenter dit *où* ça casse, pas
  *pourquoi*.
- Si l'expiration se révèle trop sèche en usage réel (un membre qui passe le
  surlendemain), le réglage est `REWARD_CLAIM_WINDOW_HOURS` — un paramètre, pas
  une réécriture. Le rendre configurable **par établissement** serait la suite
  logique, elle n'est pas construite ici.
