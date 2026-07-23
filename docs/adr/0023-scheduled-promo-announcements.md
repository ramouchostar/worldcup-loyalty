# ADR 0023 — Promos planifiées : annonce à J-1/J-2, jamais plus tôt

**Date** : 2026-07-21
**Statut** : Accepté

## Contexte

Les stratégies terrain (ADR 0022) visent des jours précis : « N achetés =
1 offert » un jour creux, arrondi de ticket un jour de rush. Or la page
Opportunités proposait un envoi immédiat du broadcast : le restaurateur qui
acceptait la suggestion un samedi annonçait sa promo du mardi trois jours à
l'avance.

Deux problèmes, un par côté du comptoir :

1. **Côté membre** : un client notifié le samedi d'une promo du mardi reporte
   sa commande du week-end pour la réserver au mardi. L'annonce précoce ne
   crée pas de visite — elle déplace une commande plein tarif vers un jour
   remisé, l'inverse exact du but d'une promo de jour creux.
2. **Côté restaurateur** : la suggestion n'indiquait ni la date visée ni le
   moment d'annonce, et ne laissait aucun temps de préparation (stock des
   ingrédients du produit en promo).

## Décision

### 1. Les suggestions liées à un jour deviennent des promos datées

`nextPromoDates(today, weekday)` (`lib/insights.ts`, pure) : la promo vise la
**prochaine occurrence** du jour ciblé, au plus tôt à J+2 (sinon on saute à la
semaine suivante — il faut que l'annonce de la veille puisse encore partir).
La date d'annonce est **promo − 1 jour**. Les cartes Opportunités affichent un
bloc « Planning » : date de la promo, date d'annonce, rappel de stock.

### 2. Fenêtre d'annonce verrouillée : J-1 ou J-2

La règle terrain — le client doit savoir à l'avance qu'il aura une belle
promo, mais pas assez tôt pour déprogrammer ses autres visites — devient une
contrainte serveur : quand un broadcast programmé porte une date de promo,
`1 ≤ promo − envoi ≤ 2` jours, sinon rejet avec message explicite. Pas de
jour même non plus : le cron du soir arriverait après le service.

### 3. Broadcasts programmés — même pipeline, plus tard

Table `scheduled_broadcasts` (m36, service-role uniquement) : message, cible
JSONB, `send_on`, `promo_on`, `sent_at`, `result`. Le cron quotidien
`/api/cron/broadcasts` (17h UTC — début de soirée belge, le moment où
« demain : promo » travaille le mieux) envoie ce qui est dû via
`sendBroadcast` : **même enveloppe anti-spam** (2/semaine/membre, ADR 0014),
même journalisation `notification_log`. Le marquage `sent_at` avant envoi
rend le cron ré-entrant (une ligne prise n'est jamais reprise).

La page Broadcast gagne un champ « Programmer l'envoi » (pré-rempli par les
cartes Opportunités via `?sendOn=&promoOn=`), la liste des annonces
programmées et l'annulation tant que l'envoi n'a pas eu lieu.

### 4. Dates calendaires belges

`send_on`/`promo_on` sont des jours calendaires (`DATE`), comparés à
« aujourd'hui à Bruxelles » (`todayInBrussels()`), pas des instants UTC — un
restaurateur raisonne en jours de service, pas en fuseaux.

## Alternatives rejetées

- **Envoi immédiat avec un texte « mardi prochain »** : c'est précisément le
  comportement qui cannibalise les jours pleins (contexte §1).
- **Programmation à l'heure près** : la promesse est « la veille en début de
  soirée » ; un time-picker ajoute de la friction sans valeur — le cron
  quotidien suffit.
- **File générique de jobs (queue)** : sur-conception pour un envoi par jour ;
  la table dédiée + cron existant (modèle ADR 0009) couvre le besoin.
- **Fenêtre d'annonce libre (simple conseil)** : comme pour les plafonds de
  coût (ADR 0017), un garde-fou contournable ne protège pas — la fenêtre
  J-1/J-2 est la substance de la stratégie, pas une préférence.

## Conséquences

- m36 : table `scheduled_broadcasts` + index file du cron.
- `lib/broadcast.ts` : `scheduleBroadcast`, `listScheduledBroadcasts`,
  `cancelScheduledBroadcast`, `processDueScheduledBroadcasts`,
  `todayInBrussels`.
- `app/api/admin/broadcast` : POST accepte `sendOn`/`promoOn` (validation
  fenêtre J-1/J-2), GET liste, DELETE annule.
- `app/api/cron/broadcasts` + entrée `vercel.json` (`0 17 * * *`).
- Page Opportunités : cartes datées (bloc Planning, bouton « Programmer
  l'annonce ») ; page Broadcast : champ date + liste des programmées.
- CONTEXT.md : entrée « Promo planifiée ».
