# ADR 0105 — La barre de la brigade : une idée montrée doit rapporter

**Statut** : Accepté (2026-11-15, Mehdi, en session). Diagnostic et plan :
https://claude.ai/artifact/SvVa2ZCQEJCrFfsduDaAhi. **Amende l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md)**
§4 (ce qui se montre) et §7 (les mesures). Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Lecture de la base de production le 2026-11-15 (Houba, De Bue, Kraainem) :

1. **64 idées depuis le 6 novembre, 100 % de Chloé, un seul « Oui »** (un rappel de noter le CA).
   Deux types tournent : « note ton CA » (une tâche) et « mets ce plat en avant » (21 fois écartée en
   doublon).
2. **Le canal « membres » ne touche presque personne** : 14 membres sur 343 ont accepté les offres,
   15 ont activé les notifications. Hugo exige 10 joignables : Kraainem en a 1 sur 112 clients partis,
   Houba 0 sur 16, De Bue 1 sur 27.
3. **Le programme ne voit que 1,2 % de la caisse** (90 tickets sur 7 376 en 30 jours). Chloé jugeait le
   restaurant sur ces tickets : elle a dit à Kraainem « le jeudi est ton jour le plus calme » ; la caisse
   dit lundi (2 760 € de moyenne, contre 3 361 € le jeudi).
4. **Max et Louis lisent l'audit du 25 septembre** (51 jours ; leurs limites sont 30 et 7 jours). De Bue
   n'a jamais été analysé. Emma n'attend que le jour creux de Chloé.

Mehdi : « il faut que tout le monde propose des idées intéressantes dans son domaine […] évaluer des
idées dont on est sûr au moins à 80 % qui seraient bénéfiques à nos clients et ont une chance de leur
augmenter leur chiffre d'affaires ».

## Décision

### 1. La barre : cinq conditions, vérifiées avant de montrer

Toute idée d'un **générateur** (`origin = 'systeme'`) passe `checkBar` (`lib/agents/playbook.ts`,
pur et testé) avant les règles de l'ADR 0089 (forfait, doublon, refus appris, plafond de 3). La
première condition ratée l'écarte : `status = 'ecartee'`, `discard_reason = 'sous_la_barre'`, et
`content.barre = { condition, detail }`. Rien ne disparaît en silence.

1. **Fiche de jeu** : le type a une fiche active dans `PLAYS` (mécanisme, source, mesure). Sans fiche,
   ou fiche retirée, pas d'idée. Un nouveau type d'idée s'ajoute avec sa fiche, ou il ne se montre pas.
2. **Caisse** : une fiche `needsTill` exige `evidence.source = "caisse"` (Belpeople, CA du jour). Un
   constat sur le restaurant ne se tire jamais des seuls tickets du programme.
3. **Audience** : un message aux membres touche au moins **50 clients joignables**
   (`MIN_MEMBER_AUDIENCE`). Le seuil de 10 de Hugo reste celui de la mesure (témoin lisible) ; 50 est
   celui de l'effet sur le chiffre.
4. **Rentable** : une fiche `costsMoney` exige `evidence.gainLowEur ≥ evidence.costEur` (gain bas de
   la fourchette, calculé avec la marge de la carte, contre la remise ou la pub). Sans les deux
   chiffres, pas de passage.
5. **Mesure** : chaque idée exécutée recevra son résultat dans `result.outcome` (`reussi` / `rate`),
   écrit par la mesure de son type. Un type qui réussit **moins de 8 fois sur 10** sur le réseau, une
   fois **10 résultats** atteints, est mis en pause pour tous. Avant 10 résultats, il est « à l'essai ».
   Les 80 % deviennent un chiffre mesuré.

La barre est **fermée par défaut** : une idée qui ne dit pas d'où vient son constat, à qui elle parle
ou combien elle rapporte ne passe pas. Elle ne juge pas les idées écrites par l'équipe
(`/platform/idees`), jugées par l'équipe.

### 2. Les tâches quittent « Idées »

« CA à noter » (Chloé), « tickets à vérifier » et « cadeau à ajouter » (Léa) sont des **tâches** : elles
ne prennent plus de place dans les trois idées du jour. Les deux premières sont déjà dans « À faire »
de l'accueil (commandes en attente, `caTodos`). « Cadeau à ajouter » n'y a pas d'équivalent : il reste
à faire depuis la page Menu ; à revoir si un établissement démarre avec moins de 3 cadeaux.

### 3. Ce qui change au premier passage

- **Retirée** : « mets ce plat en avant » (jugée sur le programme, annoncée à une dizaine de membres).
- **Coupées tant qu'elles ne sont pas refaites** : le jour creux de Chloé (condition 2) et la pub
  d'Emma qui en dépend (conditions 2 et 4), l'annonce de promo de Hugo (condition 3).
- **Inchangées** : la relance de Hugo (désormais 50 joignables), la fiche de Max, les avis de Louis.

Conséquence assumée : pendant quelques jours, « Idées » sera souvent vide. Un jour sans bonne idée vaut
mieux qu'une idée de remplissage (ADR 0089).

### 4. Décisions de Mehdi qui ouvrent la suite (2026-11-15)

- **La case « offres par e-mail » se construit** (ADR 0063 : une promo par e-mail exige un consentement
  distinct). C'est ce qui rendra Hugo utile : les 343 membres ont une adresse e-mail.
- **Les franchisés et Boosteats peuvent modifier les fiches Google** : les idées de Max (horaires des
  fêtes, fiche complète) sont un geste du gérant ou de l'équipe, sans passer par le siège.
- **Un franchisé peut faire une remise sur un plat** : Chloé peut proposer une promo, pas seulement une
  pub avec bon.

### 5. Ordre de la suite (une PR chacune)

1. Cette PR : la barre.
2. Max : horaires des fêtes, lus par l'API Places (avant le 9 décembre, pour arriver 15 jours avant le 24).
   Cette idée va **dès Croissance**, pas seulement en Pro comme le reste de Max (Mehdi, 2026-11-15) :
   seule exception, par type d'idée (`IDEA_TYPE_PLAN`), à la règle « un assistant, un forfait » de l'ADR 0089.
3. Chloé sur la caisse : jour calme refait (`source: "caisse"`, gain bas chiffré), plateforme de
   livraison qui se tait.
4. Emma : prolonger une pub qui rapporte, pub du jour calme avec bon (ADR 0104).
5. Léa (part du programme dans la caisse) et Louis (plus d'avis, avis lus chaque semaine).
6. Hugo : la case « offres par e-mail », puis la deuxième visite.

Chaque nouveau type arrive avec sa fiche de jeu et la mesure qui écrit `result.outcome`.

## Conséquences

- `DiscardReason` gagne `sous_la_barre` ; migration `20261115-1500-agent-proposals-barre` (contrainte).
  Sans elle, les idées sous la barre ne s'enregistrent pas et sont dites dans les journaux ; les autres
  passent.
- `/platform/brigade` détaille les écartées sous la barre par condition ; le rapport « Faire passer la
  brigade maintenant » aussi (`sous la barre <condition>`).
- Suivi : `docs/mesures/suivi-barre-brigade.sql`. Seuils de révision : un assistant actif sans idée
  montrée en 14 jours chez un établissement ; une condition qui coupe plus de 90 % d'un type pendant
  30 jours ; la part de « Oui » comparée à avant (1 sur 64).
