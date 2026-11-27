# ADR 0110 — Les offres sur la page de commande : écrites par le gérant, montrées, pas appliquées

**Statut** : Accepté (2026-11-26) par le porteur (Omar) : maquette et choix conseillés validés (https://claude.ai/artifact/GJmwiP9NYQtaNdeQQhQ5cN) ; Mehdi pas encore consulté. **Construit le 2026-11-27** (§6, ci-dessous), **jamais exécuté sur une base réelle**. Demande du porteur : « affichage des promos sur le site ». **Précise** l'[ADR 0099](0099-le-site-de-commande-en-option.md) §9 (ce que montre la page du client) et l'[ADR 0108](0108-l-espace-de-commande-du-restaurant-un-compte-des-points-nina.md) §6. **N'amende ni l'ADR 0007, ni 0023, 0028, 0089 ou 0104.**

## Contexte

La page `/commander/<établissement>` montre le logo, le nom, la carte et le panier. Elle ne montre aucune offre : le menu public (`lib/site-orders/menu.ts`) n'en porte pas, et le serveur calcule le prix depuis le catalogue et les options seulement (`lib/site-orders/order.ts`). Elle est fermée sans le drapeau `SITE_ORDER_RESTAURANTS` **et** un forfait Pro.

Trois objets existants ressemblent à une offre. Aucun ne dit « le comptoir l'accorde à qui commande sur le site » :

| Objet | Ce qu'il contient | Pourquoi il ne suffit pas |
|---|---|---|
| Offre d'une pub (ADR 0104, `ad_requests.offer_*`) | texte (140 caractères), mot clé, dates | faite pour un passant venu d'une pub, avec un bon à usage unique scanné en caisse |
| Annonce programmée (ADR 0023, `scheduled_broadcasts`) | message libre, jour d'envoi, jour de promo | ni date de fin ni conditions |
| Suggestions (`lib/insights.ts`, Chloé, Emma) | calculs de marge, textes proposés | une proposition, pas un engagement ; Emma écrit « pour les membres » ; la promo de Chloé est coupée (ADR 0105 §3) |

Le danger principal est une offre affichée que le comptoir refuse. La caisse n'est pas à nous (ADR 0104) : rien ne lui transmet l'offre.

**Ce que cet ADR n'a pas vu** : aucune équipe appliquant une offre à une commande du site, aucun client devant cette page, aucune phrase d'un restaurateur sur les offres qu'il veut montrer.

## Décision

### 1. Montrer, sans toucher au prix

La première version **affiche** l'offre. Aucun prix ne change : ni prix barré, ni nouveau prix, ni « tu économises », ni ligne de remise, ni code. Le calcul du serveur reste identique. La remise se fait **à la main au comptoir**, et la page le dit, dans la fiche de l'offre et sous le total : « Le total ne compte pas l'offre. Dis-le au comptoir. » La remise sur la commande est une étape à part, avec son ADR.

### 2. Le gérant l'écrit

Une offre est **saisie par le gérant ou le manager**. Rien n'est repris tout seul d'une pub, d'une annonce ou d'une suggestion. Il peut recopier une ancienne offre de sa page (« Reprendre »), qui redevient un brouillon.

Contenu : un **titre** (80 caractères au plus), des **conditions** facultatives (280), un **plat** facultatif du catalogue (sa photo sert d'image), un **premier et un dernier jour** obligatoires, des **jours de la semaine** facultatifs. Ni heures, ni public réservé, ni photo à téléverser.

Le serveur refuse les mots « point », « coupon », « cadeau » et « code promo ». Le membre ne voit ni cumul d'euros ni conversion de ses points (ADR 0007, 0028), et **jamais un gain de points à côté d'un prix** (ADR 0108 §5). « Cadeau » et « coupon » appartiennent au programme ; ici, c'est l'**offre** du restaurateur (ADR 0104).

### 3. Rien n'est public sans un « Oui »

ADR 0108 §6 : « rien ne devient public sans un « Oui » » (règle de la brigade, ADR 0089).

- États enregistrés : **brouillon**, **publiée**, **arrêtée**. « À venir », « en cours » et « terminée » se déduisent des dates.
- Avant publication, le gérant voit l'**aperçu exact**, coche « Mon équipe est prévenue : on applique cette offre au comptoir », puis touche « Oui, publier ». Qui et quand sont gardés.
- Publier est réservé au **gérant et au manager** (`requireEstablishmentManager`). **Arrêter** est ouvert à tout siège, y compris équipe : la personne au comptoir doit pouvoir retirer l'affichage tout de suite.
- Une offre publiée **ne se modifie pas** : on l'arrête et on la reprend, avec un nouveau « Oui ». On sait ainsi ce que le client a lu.

### 4. Ce que voit le client

- Seulement les offres **valables aujourd'hui** (jour de Bruxelles, bornes comprises). Une offre à venir ne s'affiche pas : annoncée tôt, elle fait reporter une commande (raisonnement de l'ADR 0023).
- Un bloc entre l'en-tête et la carte. **3 offres en même temps au plus**, celle qui finit le plus tôt d'abord. Aucune offre : aucun bloc.
- Un appui ouvre la fiche : titre, conditions, validité, comment en profiter, « Voir le plat ».
- La confirmation d'envoi rappelle les offres que le **serveur** jugeait valables à l'enregistrement. Le message du secours WhatsApp les cite aussi.
- Une offre liée à un plat **non commandable** (désactivé, sans prix, options impossibles) est masquée, et la console dit pourquoi.

### 5. La fin

Le lendemain du dernier jour, le serveur ne la renvoie plus (aucun cron). La page relit les offres quand le client y revient. La console la classe « Terminée » ; **jamais de reconduction automatique**. Durée maximale : **31 jours**.

Une commande **reçue** pendant l'offre y a droit, même si l'offre est arrêtée ou finit avant le retrait. Dans « Commandes du site », sa carte porte « Offre affichée à la commande : … ». Le comptoir n'a pas à s'en souvenir.

3 offres et 31 jours sont des défauts de produit, à confirmer.

### 6. Construit le 2026-11-27 : ce que la décision ne disait pas

- **Deux colonnes** en plus des deux tables : `site_orders.offer_ids` (les offres jugées valables à l'enregistrement, écrites par le serveur seul) et `restaurant_posts.offer_id` (l'offre qu'un article automatique annonce). Une seule réponse du comptoir par commande et par offre, corrigeable.
- **Publier est refusé** si le dernier jour valable est passé, si le plat n'est pas commandable, ou si une quatrième offre tomberait un même jour. Un brouillon ne se supprime pas.
- **Les mots refusés** le sont dans le titre et les conditions, au pluriel aussi. La règle sur « point » refuse également « cuit à point ».
- **L'état montré** ajoute « masquée » (plat devenu non commandable). Une offre dont le dernier jour coché est passé est « terminée ».
- **Affichée** compte une fois par visite et par offre ; seules les offres en cours se comptent.
- La console des offres est lisible par tout siège ; écrire et publier restent au gérant et au manager (la plateforme aussi, comme les autres réglages de l'espace).
- **L'article d'une offre** (ADR 0112) : arrêter l'offre le retire aussitôt, publié compris. La lecture publique le cache dès que l'offre est arrêtée ou finie, ou son plat masqué, et aussi quand les offres sont illisibles. Un article retiré ainsi ne se republie pas.

## Conséquences

- **Deux tables nouvelles**, service role seul (migration `20261127-1400-site-offers`, **à appliquer à la main** ; absentes, la page reste comme aujourd'hui et la console dit « pas encore activé » ; une lecture en panne masque les offres, jamais la carte, et se dit dans les journaux) :
  - `site_offers` : établissement, titre, conditions, plat facultatif (du même établissement), premier et dernier jour, jours de la semaine, état, créée par et quand, publiée par et quand, arrêtée par, quand et pourquoi, offre recopiée.
  - `site_offer_events` : offre, établissement, type (affichée, ouverte, appliquée, pas appliquée), commande facultative, date. Aucune donnée personnelle.
- Mêmes portes que la commande (drapeau et forfait) : les établissements sans espace de commande n'ont pas d'offres.
- **Points et chiffres gonflés, assumé** : les points d'une commande du site se calculent sur le total figé (`site_orders.total_cents`, migration `20261123-1000`), donc sur le prix **avant** la remise faite au comptoir. Le rapport de Nina compte aussi ce total. L'étape « remise réelle » le corrigera.
- Nina ne propose pas d'offre dans cette version : aucun générateur de Nina n'existe. Plus tard, elle préparera un brouillon, avec sa fiche de jeu (ADR 0105) ; elle ne change jamais un prix et ne publie jamais seule (ADR 0108 §6).

## Échos à suivre

- Page client : `components/commander/OrderApp.tsx` (bloc, fiche, panier, confirmation, relecture).
- Données : `lib/site-orders/menu.ts` et `menu-db.ts`, la réponse de `POST /api/site-orders`, le texte de `lib/site-orders/whatsapp.ts`. Jours et fenêtre : réutiliser `offerWindow` (`lib/ads/vouchers.ts`).
- Console : `SiteOrdersBoard`, l'écran des offres sous « Commandes du site », et une **tuile** dans Marketing (ADR 0104 §1), seulement si l'espace est ouvert.
- Ticket imprimé (ADR 0107) : la mention de l'offre n'y est pas. À ajouter avant qu'une équipe travaille au papier seul.
- Points et rapport (`lib/site-orders/report.ts`) : montants avant remise.
- Annonce aux membres : inchangée et séparée (consentement ADR 0039, J-1 ou J-2 ADR 0023). Une pub garde son bon (ADR 0104).
- `CONTEXT.md` : terme « **Offre de la page de commande** ». _Avoid_ : coupon, cadeau, bon, code promo, remise appliquée. Renvoi dans les ADR 0099 et 0108.

## Trace

Requêtes : `docs/mesures/suivi-offres.sql`.

- Sur la carte d'une commande concernée : « **Offre appliquée** » ou « **Pas appliquée** ». Facultatif, ne bloque jamais « Retirée ». **Seuil** : un seul « pas appliquée » est lu par l'équipe Boosteats et le gérant est appelé. Si plus d'une commande concernée sur deux reste sans réponse, la mesure est aveugle : à revoir.
- Arrêt avant la fin, avec un motif : plus de stock, équipe pas au courant, erreur dans l'offre, autre. Un « équipe pas au courant » montre que la case à cocher ne suffit pas.
- Par offre : affichages, ouvertures, commandes reçues pendant sa durée. On montre les chiffres, jamais « grâce à l'offre » (ADR 0064).
- Établissement ouvert sans aucune offre publiée en 60 jours : la saisie ou le besoin est à revoir.
- Les seuils sont des défauts à recalibrer.

## Alternatives rejetées

- **Appliquer la remise dès maintenant** : prix serveur, points, ticket et caisse à changer d'un coup, sans preuve que le comptoir suit.
- **Afficher un prix barré** : il promettrait un prix que le total ne donne pas.
- **Reprendre d'office l'offre d'une pub** : on retirerait le bon et son usage unique, que le gérant a acceptés.
- **Afficher le message d'une annonce** : sans fin, il resterait affiché après la promo.
- **Publier une suggestion de Chloé ou de Nina sans « Oui »** : contraire à l'ADR 0089.
- **Modifier une offre en ligne** : deux clients liraient deux versions sans trace.
- **Montrer les offres à venir** : voir §4.

## Restent ouverts

1. ~~« Le site ».~~ **Tranché le 2026-11-26** : la page de commande seule.
2. **Choix du 2026-11-26** : le comptoir fait la remise à la main. **À confirmer avec l'équipe du restaurant avant la première offre.**
3. ~~Qui écrit.~~ **Tranché le 2026-11-26** : la saisie par le gérant (ou le manager) seule.
4. ~~Limites.~~ **Tranché le 2026-11-26** : 3 offres à la fois, 31 jours au plus, offres du jour seulement.
5. Les règles belges sur l'annonce d'une réduction (prix de référence, mentions) n'ont pas été vérifiées. À faire confirmer avant la première offre réelle, en particulier si un titre cite un prix ou un pourcentage.
