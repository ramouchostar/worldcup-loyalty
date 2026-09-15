# ADR 0059 — L'accueil membre répond à trois questions

**Statut** : Accepté (2026-09-14) — remplace l'ordre du dashboard de
l'[ADR 0010](0010-dashboard-gamification-design.md) et de
l'[ADR 0030](0030-navigation-coherence-and-role-journeys.md) §4 ; déplace la carte
d'installation de l'[ADR 0038](0038-install-app-second-chance.md) ; ajoute le choix
« Mettre de côté » de l'[ADR 0021](0021-personal-points-reserve.md) sur l'accueil. Ne
change rien au calcul des cadeaux (**ADR 0006**, **0011**, **0017**) ni à la règle
« zéro euro » (**ADR 0007**, **0028**). **Amendé le 2026-09-15** (§4) : le réglage
« équipes masquées » ne masque plus que la compétition.

## Contexte

Audit de l'écran d'accueil membre, 2026-09-14, du point de vue du client au comptoir :
une main, quelques secondes, trois questions dans l'ordre — **qu'est-ce que j'ai ?
qu'est-ce que je peux viser ? qu'est-ce que je fais ?**

L'écran empilait neuf blocs et une dizaine d'actions : carte d'installation, cadeau à
récupérer, gros compteur « Tes points », projection « Sur ta prochaine commande », échelle
des jetons, carte photo, parrainage, bloc équipe, quatre tuiles, historique. Constats :

- **On demandait avant de donner** : l'installation passait avant le cadeau qui attend.
- **Le gros chiffre ne servait à rien** : « Tes points » (somme des points courbés) ne
  s'échange contre rien. Ce qui s'échange — la réserve — était caché dans une tuile, et le
  choix « Mettre de côté » n'existait que dans « Mes cadeaux ».
- **La progression affichée était fausse** : le cadeau de base dépend du montant de
  **chaque** ticket (ADR 0006), il ne se cumule pas. La barre comparait le panier moyen au
  palier suivant.
- **Un piège invisible** : tant qu'un cadeau attend, les tickets suivants n'en créent pas de
  nouveau (ADR 0011). Rien ne le disait.
- **Le réglage « équipes masquées »** (kraainem) était ignoré : bloc équipe, tuiles
  Récompenses et Classement, bonus d'équipe s'affichaient quand même.
- Du vocabulaire interne (« palier », « bonus communautaire », « cadeau de base ») et des
  détails techniques (numéro de commande, « score mis à jour toutes les 30 secondes »).

## Décision

### 1. Visible sans défiler

1. **Un cadeau attend** → le cadeau en grand (plat illustré), son délai, et **deux
   choix** : « Récupérer au comptoir » et « Mettre de côté (+N) ». Une phrase dit la règle
   du cadeau unique : tant qu'il attend, les prochains tickets n'en créent pas.
2. **Aucun cadeau** → « Ton prochain ticket peut te rapporter » + deux ou trois plats de la
   grille solo, du plus accessible au plus généreux, **jamais de seuil**.
3. **Le grand bouton « Prendre mon ticket en photo »**.

### 2. Ensuite, en compact

4. **Ma réserve** : le solde, le gros cadeau atteignable (« Échanger »), le suivant avec sa
   barre. C'est le seul solde affiché : le compteur de points courbés quitte l'accueil (les
   points restent visibles ticket par ticket dans l'historique).
5. **Les jetons en une ligne** (X/4 et l'action du moment), le détail et le parrainage
   vivent dans l'onglet Actions.
6. **L'installation de l'app** (ADR 0038), après ce que le membre est venu chercher.
7. **L'équipe**, uniquement si l'établissement l'utilise.
8. **Les tuiles** : Cadeaux d'équipe et Classement si les équipes sont actives, Mon resto
   toujours. La tuile Réserve devient la carte du point 4.
9. **Mes tickets** : points et statut, sans le numéro de commande.

La logique d'affichage (cadeaux promis, vue de la réserve) est pure et testée dans
`lib/home-view.ts`.

### 3. Le bandeau : des pastilles qui mènent quelque part *(complément du 2026-09-14)*

Le bandeau en haut de chaque écran membre affichait le total des points courbés (il ne
s'échange contre rien) et les jetons, sans lien ni l'un ni l'autre. Il affiche désormais
deux pastilles **cliquables** :

- **une pastille d'état** : « 🎁 Cadeau prêt » quand un cadeau attend (→ Mes cadeaux) ;
  sinon le solde de la réserve, **seulement là où un gros cadeau est actif**
  (→ Ma réserve) ; sinon rien ;
- **les jetons** X/4 (→ Actions).

Le total des points courbés quitte le bandeau ; les points restent visibles ticket par
ticket dans l'historique. Règle pure et testée : `headerStatus` dans `lib/home-view.ts`.

Choix du porteur : « Mettre de côté » reste proposé même là où aucun gros cadeau n'est
actif (Kraainem au 2026-09-14). La pastille réserve, elle, n'apparaît qu'avec quelque
chose à échanger.

### 4. « Équipes masquées » masque la compétition, pas les équipes *(amendement du 2026-09-15)*

Le §2 (points 7 et 8) cachait tout ce qui touche aux équipes là où le réglage
`restaurants.teams_hidden` est actif (Kraainem). C'était une lecture trop large :

- le réglage est né du retour restaurateur du 2026-08-10 sur le **Top 5 des équipes** de la
  vitrine, puis a coupé la question de reconnaissance (ADR 0031, 2026-09-02) ;
- or les équipes de Kraainem sont actives (6 équipes, 15 membres sur 86 au 2026-09-15) et
  servent au restaurateur à **cibler ses diffusions** par équipe ou par type (ADR 0014,
  0039). Cette segmentation vaut exactement la part de clients qui déclarent leur
  communauté ;
- sans bloc équipe ni question, il ne restait que l'onglet « Équipe » : 18 % des membres
  inscrits avant le 2 septembre ont une équipe, 16 % après.

**Décision (choix du porteur).** Le réglage masque seulement la **compétition** :

- restent cachés : le Top 5 de la vitrine, la tuile Classement et la comparaison au
  classement dans le bloc équipe ;
- redeviennent visibles : le bloc équipe de l'accueil (à sa place, après la réserve), la
  tuile « Cadeaux d'équipe », et la question « Te reconnais-tu dans une de ces équipes ? »
  sur l'écran de succès du ticket ;
- inchangés : l'onglet « Équipe », la page de l'équipe et la page du classement (jamais
  masquées par ce réglage).

## Alternatives rejetées

- **Garder le gros compteur de points** : un nombre qui ne s'échange contre rien détourne
  l'attention du solde qui, lui, s'échange.
- **Projeter le cadeau du panier habituel** : une estimation qui peut ne pas se réaliser, et
  rien à montrer à un nouveau membre.
- **L'échelle complète des jetons sur l'accueil** : elle doublait l'onglet Actions et
  poussait la photo sous la ligne de flottaison.

## Conséquences

- `ActionsLadder`, `ReferralCTA` et `lib/hero-copy.ts` n'avaient que l'accueil comme
  appelant : supprimés.
- Mesure : l'entonnoir compte déjà `home_viewed` ; à comparer avec les photos prises et les
  cadeaux mis de côté (`reward_banked`) avant / après.

### À surveiller

- **La réserve crédite le montant du ticket** (1 point par euro, ADR 0021) — **réglé** par
  l'[ADR 0060](0060-la-reserve-en-points-courbes.md) : crédit et seuils en points courbés.
- **Deux sortes de « points »** coexistent encore (points courbés dans l'historique, solde de
  réserve) : l'accueil n'affiche plus que la réserve, mais la question du vocabulaire reste
  ouverte.
