# ADR 0070 — Plans Croissance et Pro : commande en ligne à la marque du resto et référencement Google

**Statut** : Accepté (2026-09-26). Amende l'[ADR 0029](0029-monetization-freemium-data-driven.md)
(montants fixés, contenu des plans Croissance et Pro redéfini, plafond Gratuit à 500 tickets)
et précise l'[ADR 0015](0015-multi-restaurant-platform-pivot.md) (pas d'app client
multi-restos). N'amende **ni l'ADR 0007 ni l'ADR 0028** : le membre ne voit toujours aucun
euro, ne paie jamais, et son expérience ne dépend pas du plan du resto. Décidé par le porteur
le 2026-09-25/26 à l'issue d'une revue « avis investisseur » (conversation de session,
reprise ici). Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Trois idées ont été examinées puis écartées ou recadrées :

1. **Des apps natives** (une app client « Foodcourt » multi-restos, une app gérant
   « Boosteats »). Écartées pour l'instant : une marketplace sans densité de restos est une app
   vide (un seul établissement réel depuis m56), une app native ajoute une étape
   (store, installation) au parcours QR → app web qui fonctionne sans installation, et la
   règle 4.2.6 d'Apple refuse de toute façon une app par établissement publiée par nous.
   Les commissions d'Apple ne sont **pas** le frein : un repas est un bien physique, Apple
   impose un paiement hors de son système et ne prend rien (règles 3.1.3(e) / 3.1.5).
2. **Une marketplace qui met notre marque entre le resto et son client.** Écartée : c'est
   exactement ce que les restaurateurs reprochent aux plateformes de livraison. Le client
   partagé par le resto ne doit jamais voir un concurrent.
3. **Le SEO comme promesse vague.** Recadré : il se vend avec une preuve mensuelle
   (position sur Google Maps, clics, commandes venues de Google), sinon le restaurateur
   résilie au bout de trois mois sans rien avoir vu.

Ce qui reste — et ce qu'aucune plateforme de livraison ne peut offrir à un restaurateur qui
fait de la publicité : **un site de commande à son nom, qui dit d'où vient chaque commande.**

## Décision

### 1. Trois plans, prix hors TVA, par établissement

| | Gratuit | Croissance | Pro |
|---|---|---|---|
| Prix | 0 € | **299 €/mois** | **500 €/mois** |
| Commission | — (pas de commande en ligne) | **5 %** des commandes passées sur le site de commande Boosteats | **0 %** |
| Tickets lus / mois | jusqu'à **500** | illimités | illimités |
| Engagement | aucun | aucun | **3 mois minimum**, puis mensuel |

La commission ne porte **que** sur les commandes payées sur le site de commande Boosteats,
jamais sur les ventes au comptoir ni sur les tickets photographiés. Elle est prélevée à la
source par Stripe Connect (`application_fee_amount`) et facturée avec la TVA belge.

### 2. Contenu des plans

**Gratuit** (inchangé sur le fond, ADR 0029 §3) : programme de fidélité complet (points,
catalogue, cadeaux, équipes, parrainage WhatsApp, QR, coupon), annonces envoyées à la main,
baromètre de base, jusqu'à 500 tickets lus par mois.

**Croissance** = Gratuit, plus :
- **Site de commande à emporter à la marque du resto** (nom, logo, couleurs — charte détectée,
  `lib/design-detect.ts`) sur un sous-domaine Boosteats ; paiement sur le **compte Stripe du
  resto** (Connect **Standard** : l'argent arrive chez lui, il porte les frais de paiement,
  les remboursements et les contestations) ; points crédités automatiquement à la commande,
  sans photo de ticket ;
- **Origine de chaque commande** (Instagram/Facebook, Google, QR code, lien direct, WhatsApp)
  et envoi des achats aux régies (API de conversion Meta, conversions Google Ads) avec le vrai
  montant — c'est ce qui permet de savoir ce que rapporte chaque euro de publicité ;
- l'analytique établissement de l'ADR 0029 : prévisions, ventes par plat, opportunités,
  annonces programmées, baromètre avancé ;
- WhatsApp facturé au coût réel.

**Pro** = Croissance, **sans commission**, plus :
- le site de commande **sur le domaine du resto** (qui lui appartient) ;
- **référencement Google** automatisé : données structurées `Restaurant`/`Menu`, une page par
  plat phare (uniquement là où il y a une vraie donnée — jamais de pages par commune au texte
  identique, sanctionnées par Google), plan du site, vitesse ;
- **fiche Google gérée** (API Google Business Profile, accès à demander à Google) : lien
  « Commander », posts, réponses aux avis préparées ; demandes d'avis après commande ;
- **suivi de position** Google Maps sur une grille autour du resto (DataForSEO, déjà branché
  pour l'audit ADR 0069) et **rapport mensuel** : place sur Google, clics, commandes et
  chiffre d'affaires par origine ;
- repères secteur anonymisés (ADR 0029 §7) et vue consolidée multi-établissements ;
- 500 messages WhatsApp inclus par mois, puis au coût ; installation complète et un point
  mensuel.

### 3. Au-delà de 500 tickets par mois

Le client n'est **jamais** bloqué (ADR 0029 §6) : son ticket passe toujours. Le resto est
prévenu (80 % puis dépassement, message positif). Le passage en Croissance est demandé après
**deux mois consécutifs** au-dessus de 500 — un mois exceptionnel ne compte pas.
`SCAN_CAP_GRATUIT` passe de 400 à 500 (`lib/scan-meter.ts`).

### 4. Croissance → Pro : le point d'équilibre est affiché, pas caché

299 € + 5 % × C = 500 € ⇒ **C ≈ 4 020 € de commandes en ligne par mois**. Au-delà, Pro coûte
moins cher. La console l'affichera (« ce mois-ci, tu aurais économisé X € en Pro ») : la
commission est un marchepied vers Pro, pas une rente.

### 5. Garde-fous

- **Jamais de points contre un avis Google** : les avis récompensés sont interdits par Google
  et exposent la fiche du resto à une sanction. Une demande d'avis ne crédite rien.
- **Sur la page de commande d'un resto, aucun autre resto n'est proposé.**
- **Les points restent par établissement** (ADR 0061) : pas de monnaie commune entre restos.
- **Pas d'app native** tant que (a) une même ville ne compte pas assez d'établissements actifs
  pour qu'une découverte ait un sens et (b) le taux d'installation de l'app web n'est pas
  mesuré. La carte Wallet (Apple/Google) est la première marche de rétention, sans store.
- Le rapport mensuel dit « commandes venues de Google », jamais « grâce à nous » (ADR 0064) :
  on mesure une origine, pas un chiffre d'affaires additionnel.

### 6. Coût de revient estimé (pour mémoire, à remesurer sur le pilote)

Technique variable ≈ 12 €/mois/resto (lecture des tickets ≈ 0,01 €/ticket, suivi de
position ≈ 1 €, e-mails, stockage) ; frais fixes plateforme ≈ 110–140 €/mois à répartir ;
temps humain ≈ 70 €/mois/resto ; WhatsApp marketing jusqu'à ≈ 0,10 €/message.
Marge brute estimée ≈ 80 % en Croissance, ≈ 70 % en Pro. Le coût DataForSEO réel se lit dans
le champ `cost` déjà enregistré par l'audit.

## Conséquences

- **Landing restaurateurs** (`components/restaurateurs/`) : plans, FAQ et accroches réécrits
  en langage de restaurateur (« référencement », pas « SEO » ; « savoir d'où viennent tes
  commandes », pas « attribution ») ; « 0 % de commission » ne s'écrit plus sans préciser
  « en Pro » ; les fonctions pas encore livrées (site de commande, référencement) sont
  présentées comme **ouverture en places pilotes**, jamais comme disponibles.
- **À faire** (backlog plateforme, migration `20260926-1200-backlog-plans-commande-referencement.sql`) :
  Stripe Connect Standard ; site de commande pilote Kraainem ; origine des commandes + API de
  conversion ; demande d'accès API Google Business Profile ; suivi de position mensuel ;
  CGU (commission, seuil 500, engagement Pro 3 mois) ; entitlements des nouveaux plans ;
  allergènes affichés avant achat (règlement INCO 1169/2011) ; vérification du nom de domaine
  des restos ; carte Wallet.
- `lib/entitlements.ts` ne connaît pas encore le site de commande ni le référencement : les
  entitlements viendront avec le premier code de commande, pas avant.
- `docs/legal/conditions-abonnement-restaurateur.md` reste un brouillon à faire valider par un
  juriste : la commission et l'engagement de 3 mois s'y ajoutent avant tout encaissement.

## Alternatives écartées

- **App client multi-restos (« Foodcourt »)** : voir Contexte §1–2. Réexaminable avec de la
  densité réelle.
- **5 % sur toutes les commandes quel que soit le plan** : rend le plan Pro sans objet et
  contredit l'argument « zéro commission » face aux plateformes.
- **Commission modulée selon l'origine du client** (0 % sur les clients apportés par le resto,
  5 % sur ceux trouvés par nous) : plus juste, mais exige une attribution incontestable dès le
  premier jour. Écartée au profit d'une règle simple ; à rouvrir si la commission fait perdre
  des ventes.
