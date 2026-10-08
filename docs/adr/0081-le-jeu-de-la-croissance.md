# ADR 0081 — Le jeu de la croissance : d'abord la machine, ensuite le chiffre

**Statut** : Accepté (2026-10-08) — décidé par le porteur en session, sur la maquette validée le
2026-10-07 (« V4 — le tableau de bord rêvé »,
https://claude.ai/artifact/VTogc8MVMSSk7AwGwULUMf). Amende l'[ADR 0064](0064-la-console-repond-a-trois-questions.md)
§4 (les trois étapes deviennent deux) et §8 (le niveau est un palier de chiffre d'affaires),
et l'[ADR 0054](0054-console-restaurateur-un-seul-jeu-de-primitives.md) (couleurs de la charte
Boosteats et bandeau par forfait). S'appuie sur l'[ADR 0078](0078-ca-du-jour-saisi-a-la-main.md)
(le CA du jour est la matière des paliers). La publicité lancée depuis l'app et le service vidéo
feront l'objet d'un ADR à part (frais, commission et paiement encore ouverts).

## Contexte

L'accueil simple de l'ADR 0064 répond à trois questions, mais il parle en **tickets** jusqu'au bout.
Le porteur, après l'avoir montré, en tire trois constats :

- **Le restaurateur pense en chiffre d'affaires.** « Tu fais 350 € par jour, on vise 450 € » se
  comprend en une seconde ; « objectif : 6 tickets » se comprend, mais ne donne pas envie.
- **Viser le chiffre trop tôt n'a pas de sens.** Tant que le programme n'a pas de tickets ni de
  contacts, aucune action marketing n'a de quoi agir, et le CA bouge pour d'autres raisons.
- **Le public n'est pas technophile.** Un écran = un chiffre géant, une seule action, un bouton.
  Le jeu doit donner envie de se dépasser sans badges vides (l'ADR 0064 §8 reste juste sur ce
  point : on récompense une progression réelle).

Le CA de la caisse existe désormais dans `restaurant_sales`, alimenté par la saisie du CA du jour
(ADR 0078) ou l'import CSV (ADR 0027). C'est ce qui rend les paliers calculables.

## Décision

### 1. Deux étapes, déduites des données

| Étape | Condition | Ce que l'accueil montre en grand |
|---|---|---|
| **1 · Lancer la machine** | jusqu'à **100 tickets validés ET 200 nouveaux contacts** sur les 90 derniers jours | deux anneaux (tickets, contacts) et le CA **verrouillé**, avec sa date estimée |
| **2 · Faire grandir le chiffre** | les deux seuils atteints | le palier de CA par jour, avec une bascule « Chiffre d'affaires · Tickets & contacts » |

- **Contacts** = adhésions à l'établissement (`memberships.joined_at`) sur 90 jours ; **tickets** =
  commandes validées (`orders.order_date`) sur la même fenêtre que la page Opportunités.
- Comme dans l'ADR 0064, **aucun état stocké** : l'étape se recalcule à chaque affichage.
- La liste de lancement, l'objectif du jour en tickets et « À faire » restent dans l'étape 1 :
  ce sont les gestes qui remplissent les deux anneaux.

### 2. Les paliers de chiffre d'affaires

- **Le départ** = la moyenne par jour ouvert des **28 premiers jours notés** (un jour fermé n'a pas
  de ligne de vente, ADR 0078 §4). Stable : il ne bouge plus une fois calculé.
- **Paliers** = départ × (1 + 5 % × n), arrondis à 10 € ; **le cap** = cinquième palier (≈ +25 %).
  Un palier de +5 % se gagne ; un saut de +28 % décourage.
- **Monter d'un niveau** = la moyenne par jour tient le palier suivant **3 semaines sur les 4
  dernières**. Une semaine compte si elle a au moins 3 jours notés.
- **On ne perd jamais un niveau** : la progression se rejoue sur tout l'historique, dans l'ordre,
  et un niveau gagné l'est pour de bon. Une mauvaise semaine retarde le suivant, c'est tout.
- **Pas assez de jours notés** (moins de 28) : la carte dit « N jours notés sur 28 » et pousse la
  saisie. La saisie est demandée **dès l'étape 1**, sans objectif chiffré, pour qu'un départ existe
  au moment du déblocage.
- Logique **pure et testée** (`lib/growth-game.ts`), date injectée, même contrat que
  `lib/console-journey.ts`.

### 3. Les couleurs et polices de la charte Boosteats

La console prend les couleurs **fixes** de Boosteats (`design-system/boosteats/MASTER.md`),
jamais la charte de l'établissement (ADR 0054 inchangé sur ce point) : olive `#6B7C3F` (actions,
progression gagnée), olive clair `#A9BB6E` (mise en avant sur fond sombre), nuit `#0C1509` (fonds
sombres), crème `#EFF1E4` (fonds clairs mis en avant). Titres en Manrope, texte en Inter. Ce sont
de nouveaux jetons Tailwind `boost-*`, distincts de `brand-*` (piloté par établissement). Les
statuts `good` / `warn` / `danger` restent pour ce qui est un état, pas une marque.

### 4. Le forfait se lit dans le bandeau du haut, et nulle part ailleurs

Gratuit : bandeau blanc. Croissance : bandeau olive. Pro : bandeau nuit. Le reste de la console
est identique pour tous. Une fonction d'un forfait supérieur reste **visible** avec un verrou et
un vrai chiffre de l'établissement (« 38 clients décrochent »), jamais une page vide.

### 5. Le menu complet reste à un geste

Les quatre onglets de la vue simple ne changent pas. Sur ordinateur, la colonne de navigation
devient une barre latérale rangée par sections nommées (Piloter, Mes clients, Agir, Mon programme,
Mon compte) ; sur téléphone, « Plus » liste tout. Une page n'est jamais retirée (ADR 0064 §1).

## Conséquences

- PR 1 (celle-ci) : l'ADR, les jetons `boost-*`, `lib/growth-game.ts` et ses tests, la lecture des
  ventes par jour et l'accueil simple aux deux étapes. PR suivantes : bandeau par forfait et barre
  latérale (§4, §5), saisie du CA par canal (ADR 0078 complété), coffres, puis l'ADR pub et vidéo.
- `lib/console-journey.ts` garde l'objectif du jour et la liste de lancement ; le nouveau module ne
  remplace que la notion d'étape et le grand chiffre de l'accueil.
- **Trace** : la carte de l'étape 2 affiche toujours le nombre de jours notés et la règle de calcul
  (« moyenne des 28 premiers jours notés ») ; un départ suspect se vérifie à la main depuis
  `restaurant_sales`. Mesure de la décision : part des établissements en étape 2 qui ont 28 jours
  notés, et ouvertures de l'accueil (compteur prévu par l'ADR 0064 §10).
- **ADR 0007 inchangé** : tout ici est console restaurateur ; aucun euro ni palier ne remonte vers
  un membre.

## Alternatives rejetées

- **Un objectif fixe de +28 % (350 → 450 €)** : hors de portée pendant des mois, il punit au lieu
  de motiver. Le cap reste visible comme horizon, le jeu se joue palier par palier.
- **Stocker le niveau** : dérive dès le deuxième établissement et invérifiable ; rejoué depuis les
  ventes, il se teste.
- **Le départ glissant (moyenne des 4 dernières semaines)** : il monte avec le restaurant, et la
  progression devient invisible.
- **Une couleur par forfait sur toute l'interface** : trois apps à maintenir et une console qui
  change de visage ; le bandeau suffit à dire où l'on est.
