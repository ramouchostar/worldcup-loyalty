# ADR 0061 — Les cadeaux se choisissent avec ses points

**Statut** : Accepté — **en service depuis la bascule du 2026-09-18** (PR 2 fondations,
PR 3 catalogue, PR 4 bascule, PR 5 équipes, PR 6 nettoyage livrées — mise en œuvre terminée).
Décisions du porteur prises le 2026-09-18. Remplace désormais :
l'[ADR 0006](0006-three-layer-reward-system.md) (plus de cadeau par ticket en trois
couches), l'[ADR 0021](0021-personal-points-reserve.md) et
l'[ADR 0060](0060-la-reserve-en-points-courbes.md) (la réserve et « Mettre de côté »
deviennent « Mes points »). Amende l'[ADR 0014](0014-member-created-community-teams.md) (un seul
type de palier d'équipe, cadeau unique par palier), l'[ADR 0028](0028-points-decoupled-from-euros.md)
(points personnels proportionnels, points d'équipe toujours courbés) et
l'[ADR 0059](0059-l-accueil-repond-a-trois-questions.md) (ce que l'accueil promet). Garde
l'[ADR 0011](0011-redemption-coupon-anti-fraud.md) (un cadeau à la fois, prochaine
visite, 10 € minimum, coupon de 10 minutes), l'[ADR 0012](0012-reward-budget-cap-and-incremental-threshold.md)
et l'[ADR 0017](0017-margin-based-reward-sizing.md) (8 %).

## Contexte

Test terrain à Belchicken Houba, le 2026-09-17 :

- des clients ouvraient leur coupon **0 et 2 minutes** après avoir scanné leur ticket
  (corrigé par l'amendement de l'ADR 0011 du 2026-09-18) ;
- « 16 tenders pour un ticket de 55 € » : le prix de revient saisi était faux de moitié
  (corrigé par la migration `20260918-0330-couts-a-la-piece.sql`) ;
- le personnel a montré l'app de fidélité de Quick : **le client voit ce qu'il peut
  gagner avec ses points** (« tel burger = 350 points ») et se fixe un objectif.

Aujourd'hui chaque ticket validé crée un cadeau **imposé** par son montant (palier solo),
et la réserve ne se remplit que si le client **renonce** à ce cadeau (« Mettre de
côté »). On ne choisit rien, et on avance rarement vers les gros cadeaux.

## Décision

### 1. Chaque ticket rapporte des points personnels, proportionnels au montant

- **10 points par euro** du ticket lu par le serveur (ADR 0058), arrondis. Un ticket moyen
  de Kraainem (18,44 €) rapporte 184 points.
- **Proportionnels, pas courbés** (choix du porteur) : la courbe `20 + 4 × montant^0,6`
  favorise les petits tickets (une boisson à 2,50 € coûterait ≈ 60 % de sa dépense en
  cadeau, un ticket de 55 € ≈ 4,5 %). Des points proportionnels tiennent les 8 % **pour
  chaque client**. Le taux n'est affiché nulle part ; les points ne se convertissent
  jamais en euros ni ne paient une commande.
- Les **points d'équipe** (score collectif, ADR 0028) restent courbés : autre usage,
  autre nom.
- Le crédit est posé **par la base**, au passage d'une commande à `validated` — comme le
  score d'équipe (`update_community_score`). Une commande est validée par **cinq**
  chemins (envoi membre, validation admin unitaire et groupée, sauvetage plateforme, bac
  à sable) : un déclencheur n'en oublie aucun. Idempotent : un crédit par commande au
  plus.

### 2. Les points d'un ticket sont disponibles 4 h après

Les points du ticket qu'on vient de scanner sont visibles tout de suite, **« en
attente » 4 h** (même règle que l'ADR 0011 amendé : jamais pendant la même visite). Les
points déjà disponibles s'utilisent immédiatement : le fidèle qui arrive avec son solde
prend son cadeau le jour même, avec une commande d'au moins 10 €.

### 3. Un catalogue avec photos, prix calculé

- Le catalogue = les articles de la carte **actifs, marqués « cadeau possible »** et dont
  le prix de revient est connu (écran Menu). Photo produit quand elle existe
  (`menu_items.image_path`), icône sinon.
- **Prix en points calculé, jamais saisi** :
  `prix = arrondi au 5 supérieur (prix de revient ÷ 8 % × 10)`. Wings (16) à 4,33 € →
  545 points ; Frites Medium à 0,25 € → 35 points. Arrondi vers le haut : le coût ne
  dépasse jamais 8 % des dépenses qui ont produit les points.
- Lecture du catalogue côté membre par le serveur, colonnes explicites : nom, photo,
  prix en points — **jamais le prix de revient** (ADR 0007).

### 4. Plus de cadeau automatique, sauf le cadeau d'accueil

Le cadeau imposé par ticket disparaît. Le **premier ticket validé** d'un membre dans un
établissement reçoit en plus de ses points un **cadeau d'accueil** : le premier cadeau
de la grille solo (le plus petit). C'est ce qui convainc au comptoir (ADR 0048) ; son
coût est un coût d'acquisition. Il suit l'ADR 0011 (ouverture 4 h après le ticket).

### 5. À chaque scan, le client sait ce qu'il a gagné ou ce qui lui manque

Écran de succès, carte de gain du visiteur, accueil : « **+184 points** », puis soit
« **tu peux déjà avoir** » + l'article le plus généreux à sa portée (photo), soit
« **plus que N points pour** » + l'article suivant (photo, barre). Jamais de seuil en
euros.

### 6. Retrait inchangé

Choisir un article débite ses points et crée un cadeau à récupérer : un cadeau personnel
à la fois (ADR 0011, index `idx_one_active_reward_per_member`), commande d'au moins 10 €,
coupon de 10 minutes. Un cadeau du catalogue s'ouvre tout de suite (ses points étaient
déjà disponibles, §2). Le coût entre au budget à l'échange (ADR 0012), comme les gros
cadeaux de la réserve aujourd'hui.

### 7. Équipes : un cadeau par palier franchi, choisi par le restaurateur

Le but des équipes est de mesurer ce que dépense chaque segment et de le récompenser :
une **promotion financée parce que l'argent est déjà rentré**, qui fait **découvrir la
carte**.

- Un seul type de palier d'équipe (seuil en points d'équipe → article choisi par le
  restaurateur). Les paliers « d'avancement » (`team_tiers`) rejoignent ce modèle.
- Quand une équipe **franchit** un palier, chaque membre reçoit **une fois** ce cadeau,
  si la règle de couverture l'autorise (membres × coût ≤ 8 % des dépenses de l'équipe,
  ADR 0017). Un message part à l'équipe (diffusion ciblée).
- Le cadeau d'équipe ne bloque pas le cadeau personnel : l'index un-seul-actif ne porte
  plus que sur les cadeaux personnels.
- Plus de « + cadeau d'équipe sur chaque ticket ».

### 8. Vocabulaire

« **Mes points** » = le solde personnel. « **Points d'équipe** » = le score collectif.
« Ma réserve » et « Mettre de côté » disparaissent.

### 9. Les soldes existants sont conservés

Les soldes de réserve actuels (points courbés) sont convertis une fois, à valeur égale en
« tickets moyens » : `nouveau = ancien × (10 × panier moyen) ÷ points_for_order(panier
moyen)` (≈ × 4,3 à Kraainem), par une écriture `admin_adjust` datée et commentée. Les
cadeaux déjà attribués sont honorés.

## Découpage

| PR | Contenu | Visible pour le client |
|---|---|---|
| 1 | Cet ADR | non |
| 2 | **Fondations** : registre des points par commande (raison dédiée, disponibilité à 4 h, unicité par commande), prix en points et échange de n'importe quel article du catalogue (fonctions verrouillées au rôle serveur), vues pures testées | non |
| 3 | **Le catalogue « Mes points »** : page avec photos et prix, « Choisir » ; l'écran Menu règle le catalogue ; photos de Kraainem reprises pour Houba et De Bue ; conversion des soldes (§9) | oui, alimenté par les soldes convertis |
| 4 | **La bascule** : déclencheur de crédit par ticket ; fin du cadeau imposé (cadeau d'accueil au premier ticket) ; écran de succès, carte de gain, accueil, bandeau ; fin de « Mettre de côté » | oui |
| 5 | **Équipes** (§7) : palier unique, cadeau à chaque membre au franchissement, message, réglage | oui |
| 6 | **Nettoyage** : ancien code de réserve, stratégies membre (relance « ta commande habituelle te donne droit à… »), courriels, glossaire, indicateurs | non |

Les PR 2 et 3 ajoutent sans rien retirer. **La PR 4 est la seule bascule** : l'annuler
ramène l'ancien modèle.

## Alternatives rejetées

- **Garder le cadeau imposé et donner aussi des points** : deux cadeaux financés par les
  mêmes dépenses, soit 16 % au lieu de 8 %.
- **Points courbés avec un ticket minimum** : les 8 % ne sont tenus qu'en moyenne
  (≈ 12 % pour les petits tickets, ≈ 5 % pour les gros).
- **Des points bonus pour les équipes** : ne font rien découvrir (on prend son plat
  habituel) ; le cadeau choisi par le restaurateur sert la carte et la diffusion ciblée.
- **Tout cadeau à la prochaine visite** (au lieu des points en attente 4 h) : le fidèle
  qui arrive avec son solde devrait revenir une autre fois.

## Conséquences

- Le cadeau devient un **objectif** que le client choisit ; le restaurateur garde la main
  sur ce qui est au catalogue (« cadeau possible ») et sur les cadeaux d'équipe.
- Le budget suit les échanges et non plus les tickets : un pic d'échanges un mois donné
  est possible (points gagnés les mois précédents). Le plafond mensuel de l'ADR 0012
  continue de couper les cadeaux d'équipe, jamais les échanges de points déjà gagnés.
- Sécurité : les fonctions de points et de budget ne sont exécutables que par le rôle
  serveur (migration `20260918-0400-verrou-fonctions-points-budget.sql`, constat du
  2026-09-18) ; toute nouvelle fonction du registre suit la même règle.
- Chemins de validation à assainir au passage (PR 4) : la route bac à sable crée une
  commande validée sans cadeau ni revenu programme et double la dépense d'équipe ; la
  validation admin unitaire peut revalider une commande refusée.

## Notes de mise en œuvre (bascule, 2026-09-18)

- **Catalogue épuré** (choix du porteur) : sauces, boissons et pièces à l'unité retirées
  du catalogue des trois établissements (migration `20260918-0530`). Réversible article
  par article dans l'écran Menu.
- **Un cadeau payé en points qui expire rend ses points.** Constaté en préparant la
  bascule : les cadeaux du catalogue n'expiraient jamais (ils auraient bloqué le membre
  indéfiniment), et s'ils avaient expiré le client aurait perdu ses points. Le balayage
  horaire les fait expirer à 48 h et appelle `refund_catalog_reward` (idempotent, coût
  retiré du budget).
- **Relances** : « ta commande habituelle te donne droit à… » devient « chaque ticket te
  rapporte des points vers le cadeau de ton choix » ; la relance « commande un peu plus
  pour un meilleur cadeau » est retirée (plus de palier de montant).
- **Ordre d'application** : le déclencheur de crédit (`20260918-0600`) s'applique juste
  après la fusion de la bascule, sinon les tickets validés entre les deux ne
  rapporteraient ni cadeau ni points.

## Notes de mise en œuvre (équipes, PR 5, 2026-09-18)

- **Attribution** : `lib/team-gifts.ts` (`awardCrossedTeamTiers`) appelé à chaque
  validation de ticket (`createPendingReward`, donc tous les chemins de validation), et
  par le passage quotidien de 18 h en filet de sécurité. La règle pure
  (`lib/team-gift-rules.ts`, testée) : palier franchi, pas encore attribué, couverture
  ADR 0017 satisfaite. S'y ajoutent le double verrou et le budget du mois (ADR 0012).
  Un palier franchi mais pas encore finançable **attend** : il est attribué quand
  l'équipe a assez dépensé, jamais perdu.
- **Une seule fois par équipe** : table `team_tier_awards` (unicité équipe × palier),
  fonction `award_team_tier` qui crée le cadeau de chaque membre et compte le coût au
  budget dans la même transaction (migration `20260918-0700`). Garde-fou : les paliers
  déjà franchis au moment de la migration sont notés sans cadeau (aucun palier d'un
  établissement réel n'était franchi ; seuls des établissements de test l'étaient).
- **Le cadeau d'équipe attend à côté du cadeau personnel** : source `team`, ouvert tout
  de suite, **récupérable 7 jours** (il tombe sans que le membre soit venu), rien à rendre
  à l'expiration. L'index un-seul-actif ne porte plus que sur les cadeaux personnels ; la
  récupération vise un cadeau précis (`rewardId`), jamais « le » cadeau actif.
- **Annonce** : le passage de 18 h envoie « chaque membre reçoit X : le tien t'attend au
  comptoir cette semaine » (push ou WhatsApp, et courriel), une fois par cadeau, dans les
  limites anti-spam.
- **Paliers « d'avancement »** (`team_tiers`, ADR 0014) : plus lus. Le lien de la
  console est retiré ; les paliers d'équipe se règlent dans l'écran Menu. Le code mort
  part avec la PR 6.

## Notes de mise en œuvre (nettoyage, PR 6, 2026-09-18)

- Retirés : « Mettre de côté » (`/api/points/bank`, bouton), l'échange de gros cadeaux
  `saver`, la page et l'API des paliers d'avancement (`team_tiers`), la relance « commande
  un peu plus » (`findTierNudge`), les anciennes résolutions de couches et leurs tests.
  Les fonctions SQL devenues inutiles restent en base, verrouillées au rôle serveur.
- **Remboursement fiabilisé** : un cadeau payé en points que la génération du coupon
  déclare expiré n'était pas remboursé (seul le balayage horaire remboursait, et seulement
  ce qu'il faisait expirer lui-même). Désormais la génération rembourse, et le balayage
  repasse sur tout cadeau payé en points expiré depuis 14 jours (remboursement
  idempotent). Aucun client n'était touché au 2026-09-18.
- **Console** : une commande ne se valide ou ne se rejette plus qu'**en attente**.
  Revalider une commande validée recomptait son chiffre au budget ; la rejeter après
  validation lui laissait ses points.
- **Sandbox** : la commande test comptait deux fois sa dépense dans l'équipe (le
  déclencheur de score tourne aussi à l'insertion depuis m35).
- Glossaire `CONTEXT.md` : « Mes points », « Points d'équipe », « Palier d'équipe »,
  « Cadeau d'équipe », « Cadeau d'accueil », « Catalogue » ; « Réserve », « Palier solo »,
  « Bonus communautaire » marqués historiques.
