# ADR 0109 — La commande planifiée : choisir son heure de retrait, même quand le restaurant est fermé

**Statut** : Accepté (2026-11-26) par le porteur (Omar) : maquette et choix conseillés validés (https://claude.ai/artifact/GJmwiP9NYQtaNdeQQhQ5cN) ; Mehdi pas encore consulté ; rien n'est construit. La validation ne tranche ni les points 5 à 8 de « Restent ouverts » ni le juridique. **Amende** : l'[ADR 0108](0108-l-espace-de-commande-du-restaurant-un-compte-des-points-nina.md) §2 (téléphone facultatif), §4 (fermé = pas de commande), §5 (fenêtre « même repas »), §6 (alertes, rapport) et §7 (numéro, purge) ; l'[ADR 0099](0099-le-site-de-commande-en-option.md) §2 (imprimante hors ligne), §7 (numéro, purge), §9 (aucune heure annoncée) et §10 (carillon) ; l'[ADR 0107](0107-les-tickets-de-cuisine-sortent-sur-l-imprimante-du-restaurant.md) §3, §8 et §10.

## Contexte

Demande du porteur : « possibilité de planifier une commande même si le resto est fermé ». Défaut retenu avec lui (corrigeable) : le client commande pour un retrait plus tard, y compris restaurant fermé. Retrait et paiement au comptoir ne changent pas (ni livraison, ni paiement en ligne).

Ce que le code fait aujourd'hui :

- **Aucun contrôle des horaires.** `POST /api/site-orders` accepte une commande à toute heure ; le motif `ferme` est déclaré (`lib/site-orders/order.ts`) mais la commande ne l'émet pas. L'ADR 0108 §4 (« fermé : la page le dit ») n'est pas construit.
- **Une commande n'a qu'une heure : son envoi.** `site_orders` n'a pas d'heure de retrait. En dépendent : le numéro du jour, les alertes de Nina, le rapport de la semaine, les points, la purge et la liste de la console.
- **Une commande déjà là à l'ouverture de la console ne sonne pas** (`alert.ts`). Une commande prise la nuit ne sonnerait donc jamais, et rien d'autre ne prévient le restaurant.
- **Horaires** : le code sait lire les horaires ordinaires de la fiche (`placeOpeningPeriods`) et les **dates** exceptionnelles des 7 prochains jours (`placeSpecialDays`), pas leurs heures. La base ne garde que les heures de fermeture (`restaurants.closing_times`, pour un rappel).
- La page de commande ne montre ni horaires ni téléphone du restaurant.

Aucun restaurateur ni client n'a utilisé la commande du site : tout ce qui suit est une décision de principe.

## Décision

### 1. Deux choix de retrait

- **« Dès que possible »** : seulement quand le restaurant est ouvert. Coché d'office.
- **« Choisir une heure »** : toujours proposé. Restaurant fermé, c'est le seul choix, et la page le dit.

L'heure est une **heure demandée**. La page ne dit pas que le restaurant l'a lue ni acceptée (il n'y a toujours pas d'étape d'acceptation). La consigne « sans nouvelles au bout de dix minutes, appelle » ne vaut plus que pour « dès que possible ».

### 2. Les créneaux

Un créneau tous les quarts d'heure. Premier : maintenant ou l'ouverture, **plus le délai de préparation** (réglé par le restaurant). Dernier : 15 minutes avant la fermeture. Horizon court. Valeurs : Restent ouverts 1 et 5.

### 3. Les horaires : la fiche, corrigée par le gérant

- La fiche Google reste la source (ADR 0108 §4), lue et **gardée côté serveur** : horaires ordinaires et exceptionnels.
- Le gérant peut **fermer un jour** et **couper la planification** dans la console. Son réglage l'emporte.
- Jour férié légal (`belgianPublicHolidays`, `lib/forecast.ts`), 24 et 31 décembre : aucun créneau tant que l'ouverture n'est pas confirmée (Restent ouverts 3).
- **Horaires inconnus** (jamais lus, ou lus il y a plus de 7 jours) : aucune commande, la page dit d'appeler. Motif tracé `horaires_inconnus`.
- Le serveur revérifie l'heure à l'envoi (motifs `heure_indisponible`, `ferme`) : le panier reste, la page propose d'autres heures. Même contrôle au retour de la connexion.

### 4. Les garde-fous

Un compte, comme aujourd'hui. **Téléphone obligatoire** pour une heure choisie (le restaurant doit pouvoir joindre le client s'il annule), et **deux commandes planifiées en cours au plus** par compte et par restaurant. Prix et choix sont **figés à l'envoi** ; un plat retiré ensuite se règle par téléphone. Le client change ou annule en appelant : la confirmation et la page montrent le numéro du restaurant.

### 5. En base

- `site_orders.pickup_at` : l'heure demandée (vide = dès que possible).
- `site_orders.kitchen_at` : l'heure de **lancement en cuisine** (retrait moins le délai), figée à l'envoi. Dès que possible = heure d'envoi.
- **Pas de nouvel état** : « planifiée » = reçue dont le lancement est à venir.
- `order_day` devient le **jour de retrait** : le numéro est unique parmi les commandes servies le même jour. Les numéros ne suivent plus l'ordre d'arrivée.
- **Sans la migration, la planification n'existe pas** (ni proposée, ni acceptée). On n'enregistre jamais une commande planifiée comme immédiate.

### 6. Ce qui se compte désormais depuis le retrait ou le lancement

| Sujet | Aujourd'hui | Commande planifiée |
|---|---|---|
| Console | tri par envoi ; terminées gardées 24 h après l'envoi | section « Planifiées » par jour et heure ; passe dans « À préparer » au lancement ; terminées gardées 24 h après la remise ou l'annulation ; aucune commande à venir coupée par la limite de 200 lignes |
| Carillon | à l'arrivée | à l'arrivée : un bandeau et un seul son ; au lancement : le carillon répété, **même si la commande était là à l'ouverture** |
| Prévenir le restaurant | rien | **un e-mail à l'envoi** de chaque commande planifiée, par `dispatch`, journalisé (ADR 0063) |
| Ticket de cuisine (pas encore branché) | à l'enregistrement | **au lancement** : le travail attend en file jusqu'à `kitchen_at` ; jour et heure de retrait **en grand** ; annulée avant = rien ne sort |
| Imprimante hors ligne (à venir) | bloque l'envoi | ne bloque pas l'envoi d'une commande planifiée ; le bandeau rouge part 2 minutes après le lancement sans impression |
| Alerte « attend 10 minutes » | depuis l'envoi | depuis le lancement |
| Alerte « prête depuis 2 heures » | depuis « prête » | depuis la plus tardive : « prête » ou l'heure de retrait |
| Nouvelle alerte | aucune | commande planifiée sur un jour devenu fermé : « appelle le client » |
| Rapport de la semaine | tout depuis l'envoi | une commande compte le **jour de son retrait** ; heures de pointe à l'heure de retrait ; délai « reçue → prête » pour « dès que possible » seul ; en plus, part des planifiées prêtes à l'heure ; nouveaux membres toujours comptés à l'envoi |
| Double compte des points | de 6 h avant l'envoi à 6 h après la remise | de 6 h avant le retrait (heure demandée ou remise, la plus tôt) à 6 h après la remise ; même règle pour le drapeau du ticket (`hasRecentSiteOrder`) |
| Purge du prénom et du téléphone | depuis l'envoi | depuis l'heure de retrait, et la page l'écrit ainsi |
| Secours WhatsApp | message sans heure | le message porte le jour et l'heure demandés ; la page prévient que le restaurant, fermé, ne le lira peut-être qu'à l'ouverture ; rien n'est enregistré |

Sans correction des points, une commande passée deux jours à l'avance serait mise à 0 point par n'importe quel ticket validé entre-temps, pour un autre repas.

## Conséquences

- La planification **ne s'ouvre qu'avec** tout le §6 déjà branché (hors impression) : une commande planifiée avec les règles actuelles donne de fausses alertes, un rapport faux et des points perdus.
- Ordre de construction : horaires et contrôle serveur ; heures, numéro, console, carillon, e-mail ; alertes, rapport, points, purge, WhatsApp. L'impression suit l'ADR 0107.
- Migrations nouvelles (colonnes, réglages, fonction de crédit), idempotentes ; ne jamais rejouer `20260918-0420`.
- Le risque de **commande jamais retirée** augmente : rien n'est payé d'avance.
- La lecture des horaires ajoute des appels à Google Places (coût à mesurer).
- Les préalables d'ouverture ne changent pas : caisse certifiée, conditions sur les données, imprimante ou écran surveillé accepté par écrit.

## Échos à suivre

- Code : `lib/site-orders/` (`order`, `service`, `db`, `cart` pour le panier gardé, `menu`, `alert`, `nina-alerts`, `report`, `report-db`, `points`, `points-db`, `purge`, `purge-db`, `whatsapp`) ; `components/commander/OrderApp.tsx` ; `components/admin/site-orders/` ; `lib/menu-options/tickets.ts` et `lib/printing/paper.ts` (l'heure de retrait est aujourd'hui une petite ligne) ; `lib/audit/places.ts` ; `lib/message-catalog.ts`.
- Base : le déclencheur de la migration `20261123-1000` ; requêtes 11, 12, 16 et 17 de `docs/mesures/suivi-options-menu.sql`.
- Textes : confirmation, aide du téléphone (« facultatif », durée de conservation), conditions.
- Documents : statuts des ADR 0099, 0107, 0108 ; `CONTEXT.md` (« Commande du site », nouveaux termes **Commande planifiée** et **Heure de retrait**, _Avoid_ : précommande, réservation, livraison programmée) ; `CLAUDE.md`.

## Trace (ADR 0065)

- Part des commandes envoyées **restaurant fermé** : sous une sur vingt après un mois, la fonction ne sert pas.
- Planifiées **jamais retirées** : au-delà d'une sur dix, raccourcir l'horizon ou rappeler le client.
- Planifiées encore « reçues » **à l'heure de retrait** : au-delà d'une sur vingt, le restaurant n'est pas prévenu à temps.
- Prêtes à l'heure : sous quatre sur cinq, revoir le délai ou limiter les commandes par créneau.
- Annulées par le restaurant, par raison (horaires faux).
- Refus `heure_indisponible`, `horaires_inconnus`, `ferme`.

Les seuils sont des défauts à recalibrer. Les requêtes partent avec le code.

## Alternatives rejetées

- **Accepter sans heure quand c'est fermé** (« préparée à l'ouverture ») : le client ne sait pas quand venir, la cuisine reçoit tout d'un coup.
- **Garder toutes les règles sur l'heure d'envoi** et seulement afficher l'heure : fausses alertes, plats préparés trop tôt, points perdus.
- **Imprimer à l'envoi** : un ticket sorti des jours avant se perd.
- **Un état « planifiée » avec une tâche qui le fait avancer** : une panne de la tâche cacherait des commandes ; le calcul à la lecture suffit.
- **Numéro du jour d'envoi** : deux « N° 0001 » possibles le même jour de service.
- **Paiement d'avance contre les absents** : exclu (ADR 0099 §2).

## Restent ouverts

1. ~~Jusqu'à quand ?~~ **Tranché le 2026-11-26** : aujourd'hui et les deux jours suivants.
2. ~~Téléphone et absents.~~ **Tranché le 2026-11-26** : téléphone obligatoire pour une heure choisie, deux commandes planifiées en cours au plus.
3. ~~Jours fériés.~~ **Tranché le 2026-11-26** : fermés tant que le gérant (ou les horaires exceptionnels de la fiche) ne confirme pas l'ouverture.
4. ~~Prévenir le restaurant.~~ **Tranché le 2026-11-26** : e-mail à chaque commande planifiée, puis carillon au lancement. Reste vrai : personne n'est prévenu si l'e-mail n'est pas lu et la console fermée.
5. **Créneaux.** Recommandé : délai de préparation de 20 minutes par défaut, quarts d'heure, dernier retrait 15 minutes avant la fermeture ; à demander à chaque pilote.
6. **Trop de commandes au même créneau.** Recommandé : pas de limite au départ, mesurer.
7. **Annulation par le client.** Recommandé : par téléphone au début, bouton plus tard.
8. **Caisse certifiée et conditions** : une commande prise à l'avance change-t-elle la réponse ? À poser au comptable et au juriste avec les questions des ADR 0099 et 0108.
