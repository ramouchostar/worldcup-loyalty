# ADR 0050 — La boucle du cadeau se referme : expiration tenue, remise mesurée

**Statut** : Accepté (2026-09-09) — **§3 corrigé le 2026-09-12** (voir *Correction* en fin de document) : la métrique ne mesure plus la remise au comptoir, qui n'est enregistrée nulle part, mais la **réclamation**. Implémente la fenêtre de 48 h de l'[ADR 0011](0011-redemption-coupon-anti-fraud.md)
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


---

## Correction — 2026-09-12 : le §3 mesurait un bouton, pas la vie du programme

**Constat terrain du porteur** : des cadeaux ont bel et bien été remis au comptoir,
alors que la tuile annonçait **0 %**. La mesure était fausse, pas le terrain.

### Ce que j'avais raté

Il existe **trois** chemins qui marquent un cadeau, et le §3 n'en mesurait qu'un :

| Chemin | Ce qui est écrit | Qui l'emprunte |
|---|---|---|
| Le membre ouvre son coupon (`/api/redemption/generate`) | `pending_rewards.status = 'redeemed'` + token créé | le membre, systématiquement |
| Le restaurateur clique « Remis » dans sa console (`PATCH /api/admin/pending-rewards`) | `status = 'redeemed'`, **aucun token touché** | le restaurateur |
| Le caissier ouvre `/admin/coupon/[token]` → « Cadeau remis » | `redemption_tokens.redeemed_at` | **personne** |

Le troisième est **court-circuité par construction**, et pas par négligence :
l'ouverture du coupon bascule déjà `status` en `redeemed`, donc le cadeau quitte
aussitôt la liste « À remettre » de la console — le restaurateur n'a plus rien à
cliquer. Et `/admin/coupon/[token]` n'est lié depuis aucune surface : il faudrait
taper un jeton de 12 caractères à la main, au comptoir, avec un client qui attend.

L'ADR 0011 l'avait d'ailleurs conçu ainsi : le contrôle anti-capture d'écran est
**visuel** (le caissier regarde l'horloge vivante sur le téléphone du membre). Le
bouton « Cadeau remis » a toujours été facultatif.

Mesuré au 2026-09-12 : **0 token confirmé sur 9**, pour 9 cadeaux réclamés. Le
`redeemed_at` des tokens n'est pas un signal faible — c'est un signal **mort**.

### Ce que la correction change

`redemption` redevient un **taux de réclamation** :

> `cadeaux réclamés (status = 'redeemed') ÷ (réclamés + expirés)`

C'est-à-dire, exactement, ce que le code d'origine calculait **avant** cet ADR. Le
vrai défaut que l'ADR 0050 a corrigé était l'autre : l'absence du cron
d'expiration, qui rendait le dénominateur dégénéré. Ce correctif-là tient, et il
reste. C'est le numérateur que j'ai cassé en le déplaçant vers les tokens.

Le comptage `giftsRemitted` est **supprimé** plutôt que laissé à zéro : une colonne
qui vaut structurellement 0 sur un tableau de bord n'informe pas, elle inquiète.

### Ce qu'on ne mesure pas, et qu'on assume

**L'instant de la remise est physique et n'est enregistré nulle part.** La base ne
distingue pas « le membre a ouvert son coupon et reparti avec son burger » de « le
membre a ouvert son coupon et changé d'avis ». La tuile le dit désormais en toutes
lettres au lieu de le laisser croire.

Rendre ce geste mesurable serait un **chantier produit**, pas un correctif de
métrique : il faudrait un chemin réel vers la confirmation (un lien depuis la
console, ou un scan du coupon), et surtout une raison pour le caissier de le
faire — sans quoi on aurait un bouton de plus et le même zéro. À trancher
séparément ; l'ADR 0011 a pour l'instant choisi le contrôle visuel, et rien dans
le terrain ne dit encore que ce choix est mauvais.

### La leçon, pour la prochaine métrique

Un champ qui *porte le bon nom* (`redeemed_at`) n'est pas une preuve qu'il est
*alimenté par le bon geste*. Avant de faire d'une colonne le numérateur d'un
indicateur, vérifier **qui l'écrit, depuis quel écran, et si cet écran est
atteignable** — un taux à 0 % doit faire suspecter la mesure avant de faire
condamner l'opération.
