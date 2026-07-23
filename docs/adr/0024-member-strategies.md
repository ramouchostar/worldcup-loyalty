# ADR 0024 — Stratégies membres : nudge de palier, cadeau d'anniversaire, réactivation

**Date** : 2026-07-22
**Statut** : Accepté

## Contexte

Les six stratégies terrain du moteur (ADR 0022) sont **agrégées** : elles
regardent les ventes de l'établissement et produisent des promos à broadcaster.
Or les données les plus précieuses de l'app sont **par membre** : panier
habituel, fréquence de visite, date de naissance, dépense cumulée. Trois
moments de la vie d'un client restaient sans stratégie :

1. Le faire **dépenser un peu plus** (son panier est juste sous un palier solo) ;
2. Le faire **venir accompagné** (son anniversaire — on ne le fête pas seul) ;
3. Le **rattraper avant qu'il parte** (sa fréquence décroche).

Règle terrain confirmée pour l'anniversaire : le cadeau doit **s'adapter au
client**. Un gros dépensier doit voir que le restaurant le sait et lui en est
reconnaissant — cadeau conséquent ; côté restaurateur, on affiche combien ce
client a dépensé pour que le cadeau se lise comme un **investissement sur un
client fidèle**, pas comme une dépense.

## Décision

### 1. Trois triggers membres dans le cron de notifications (ADR 0009)

`lib/member-strategies.ts`, appelé par `/api/cron/notifications` **avant** les
triggers communautaires (l'anniversaire n'arrive qu'un jour par an, il gagne
le créneau anti-spam du jour). Couvre **tous** les membres de l'établissement,
avec ou sans équipe (ADR 0018) — contrairement aux triggers communautaires.
Même enveloppe anti-spam : 48h minimum, 3/semaine, silence 6h post-commande.
`notification_log.community_score_at_send` passe à NULL pour ces triggers
(un 0 fausserait le calcul « +500 pts » du trigger `member_inactive`).

### 2. `tier_nudge` — l'arrondi de panier par la valeur perçue, zéro remise

Le membre dont le panier habituel est juste sous un palier solo (écart ≤ 20 %
du seuil visé, `NUDGE_MAX_GAP_RATIO`) apprend ce qu'il gagnerait : *« Tu
commandes en général ~€22. Dès €25, ton cadeau passe à « X » — plus que €3 ! »*.
La valeur perçue du cadeau fait le travail d'une remise, et son coût est déjà
plafonné par l'ADR 0017 (8 % du seuil). Garde-fous : ≥ 2 commandes validées,
le cadeau visé doit différer du cadeau actuel, 1 nudge / 30 jours max.
Les euros cités sont les dépenses propres du membre et les seuils solo — déjà
visibles côté membre (ADR 0007/0010).

### 3. `birthday` — le cadeau qui grandit avec la fidélité

Le jour J (mois-jour de `profiles.birth_date`, fuseau Bruxelles, 1×/an) :

- **Plafond de coût** : `max(panier moyen × budget %, dépense cumulée du
  membre × 1 %)` (`birthdayGiftCap`, `BIRTHDAY_SPEND_PCT`). Un nouveau membre
  reçoit l'équivalent du cadeau jetons (~€2 de coût) ; un client à €1 000 de
  dépenses peut recevoir jusqu'à €10 de coût réel — conséquent pour lui,
  dérisoire face à sa valeur. Article le plus généreux sous plafond
  (`pickGenerousGift`).
- **Livraison** : `pending_rewards` standard, `source = 'birthday'`,
  `order_id NULL` (m37) → cycle 48h / coupon 10 min inchangé (ADR 0011). Non
  bankable par construction (le RPC exige `order_id IS NOT NULL`). Si une
  récompense est déjà active (index un-seul-actif), simple vœu sans cadeau —
  on ne promet jamais ce que le slot refuse.
- **Budget** : coût compté dans le plafond mensuel (`incrementRewardsCost`,
  ADR 0012) ; plafond atteint → vœu sans cadeau, comme les couches 2/3.
- **Côté cashier** (`/admin/coupon/[token]`) : le coupon anniversaire affiche
  *« 🎂 cadeau d'anniversaire — client fidèle : €X dépensés »* — le
  restaurateur voit l'investissement, pas la dépense.

### 4. `winback` — décrocher se mesure contre son propre rythme

Intervalle médian entre les commandes du membre (≥ 3 commandes) ; décroché si
silence ≥ `max(14 jours, 2× la médiane)` — un habitué hebdomadaire est rattrapé
au bout de deux semaines, un mensuel au bout de deux mois, jamais de faux
positif sur un rythme lent. Message personnalisé sur son panier habituel et le
cadeau qu'il rapporte. 1 relance / 30 jours max.

## Alternatives rejetées

- **Cartes Opportunités + broadcast segmenté** : le broadcast cible des
  équipes, pas des segments de membres ; ces trois stratégies sont
  individuelles par nature — le canal notification personnalisée existe déjà.
- **Cadeau d'anniversaire fixe pour tous** : contredit la règle terrain — la
  reconnaissance doit se calibrer sur la fidélité réelle ; un VIP qui reçoit
  le cadeau d'un inconnu, c'est pire que rien.
- **Remise en euros pour le nudge/winback** : la mécanique de fidélité fait le
  même travail sans toucher à la marge — cohérent avec « la valeur perçue
  oriente les choix » (ADR 0022).
- **Cron dédié** : la limite de crons Vercel et l'enveloppe anti-spam partagée
  plaident pour l'intégration au cron notifications existant.

## Conséquences

- m37 : `notification_log` CHECK += `tier_nudge`/`birthday`/`winback` ;
  `pending_rewards.source` CHECK += `birthday`.
- `lib/member-strategies.ts` (nouveau) : décisions pures (`findTierNudge`,
  `lapsedStatus`, `isBirthday`) + `runMemberStrategies`.
- `lib/reward-sizing.ts` : `birthdayGiftCap` (`BIRTHDAY_SPEND_PCT` 1 %).
- `lib/notifications.ts` : `TriggerType` étendu, `communityScore` nullable.
- `/api/cron/notifications` : appel `runMemberStrategies` par établissement.
- `/admin/coupon/[token]` : ligne anniversaire avec dépense cumulée.
- CONTEXT.md : entrée « Stratégies membres ».
