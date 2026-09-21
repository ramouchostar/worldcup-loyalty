# ADR 0064 — La console répond à trois questions : une vue simple par étape, la vue pro intacte

**Statut** : Accepté et en service (2026-09-21, PR #220) — demande du porteur du même jour ; §6 amendé le même jour (le QR de l'équipe en salle devient la première tâche « À faire », voir en fin de document). La PR qui porte cet ADR
livre la vue simple (§1 à §8) ; les questions au restaurateur (§9) et le message du soir (§10)
sont décidés dans leur principe et feront chacun leur PR. Transpose côté restaurateur l'[ADR
0059](0059-l-accueil-repond-a-trois-questions.md) (l'accueil membre répond à trois questions) ;
la navigation en quatre sections de l'[ADR 0030](0030-navigation-coherence-and-role-journeys.md)
§9 devient celle de la **vue pro**, inchangée ; ajoute deux primitives à la liste fermée de l'[ADR
0054](0054-console-restaurateur-un-seul-jeu-de-primitives.md) (`ProgressBar`, `ProgressRing`).
S'appuie sur l'[ADR 0053](0053-acquisition-par-le-personnel-en-salle.md) (QR de l'équipe en salle),
l'[ADR 0022](0022-field-strategy-advisor-engine.md) (moteur Opportunités) et l'[ADR
0063](0063-sequences-de-messages-pilotees-par-la-plateforme.md) (séquences restaurateur). Aucune
migration pour cette PR.

## Contexte

Trois établissements réels au 2026-09-21 :

| | Tickets validés | Rythme (7 j) | Sièges console |
|---|---|---|---|
| Kraainem | 66 | ≈ 4 par jour | 1 (le gérant) |
| Houba | 9 | — | **0** |
| De Bue | 0 | — | **0** |

Quatre tickets par jour dans un restaurant qui sert bien plus d'une centaine de clients : le
programme ne manque pas de fonctions, il manque de **volume**. Sans volume, pas de données ;
sans données, les pages qui font la valeur payante (Prévisions, Opportunités, Repères secteur —
ADR 0029) affichent « pas assez de données » à ceux-là mêmes qui auraient besoin d'être guidés.
Et deux établissements sur trois n'ont personne dans la console.

La console, elle, était la même pour tous :

- **aucun signal du jour** — tous les chiffres du tableau de bord sont mensuels ou cumulés : un
  restaurateur qui jette un œil entre deux services ne peut pas savoir si ses clients ont
  photographié leurs tickets aujourd'hui ;
- **vingt entrées** en quatre sections ; sur téléphone, dix-huit derrière un bouton unique, sans
  navigation persistante ;
- **rien ne dépend de l'avancement** — un établissement à zéro ticket voit un encart « Ce que le
  programme t'a rapporté » vide et un lien vers des opportunités vides, et pas un mot sur ce qui
  compte au lancement (afficher le QR, équiper l'équipe en salle) ;
- **le vocabulaire de l'outil** — « Broadcasts », « Seuils CA », « Baromètre », « Repères
  secteur », « bonus communautaire » ;
- **le retour sur investissement enterré** — la marge nette après cadeaux tenait dans une note de
  11,5 px en blanc à 50 % sur fond sombre.

Demande du porteur : une vue simple, façon Uber Eats Manager, qui ne montre que l'essentiel et
les actions à la main du restaurateur ; la vue actuelle gardée comme vue pro ; des vues
téléphone et ordinateur pensées chacune pour leur usage ; un accompagnement qui suit
l'avancement (d'abord des objectifs de tickets et l'éducation, les opportunités ensuite, une fois
les hypothèses validées par le restaurateur lui-même) ; le rôle de la plateforme rappelé ; des
mécaniques de jeu qui donnent envie de revenir, dans l'esprit du tableau de bord Shopify.

## Décision

### 1. Deux vues, les mêmes pages

La **vue simple** est l'accueil par défaut. La **vue pro** est la console d'avant, à
l'identique : ses quatre sections, son tableau de bord détaillé. On passe de l'une à l'autre
d'un tap (« Vue pro » / « Vue simple »), la préférence est gardée par un cookie `console_vue`,
par appareil — on peut vouloir la vue simple sur le téléphone et la vue pro sur l'ordinateur du
bureau.

Une préférence d'**affichage**, jamais un droit : les deux vues ouvrent les mêmes pages avec les
mêmes gardes (ADR 0041 §6 inchangé), et rien n'est retiré de la vue simple — ce qui n'est pas un
onglet est dans « Plus » (ADR 0030 §4 : on ne cache jamais une fonctionnalité).

### 2. Quatre onglets : Accueil · Tickets · Annonces · Plus

En bas de l'écran sur téléphone, au pouce, toujours visibles ; en colonne sur ordinateur, les
mêmes. Une page qui n'est pas un onglet (Menu, QR code, Clients…) allume « Plus » : on sait
toujours où l'on est. **Un seul badge** : les tickets qui attendent une décision.

« Plus » liste toutes les pages de la vue pro, chacune dite en mots de restaurateur (« ce que tu
vends, plat par plat et ta marge » plutôt que « Ventes »), plus les liens que l'en-tête ne peut
pas porter sur un téléphone (plateforme, établissements, espace membre) et la bascule de vue.
« Broadcasts » devient « Annonces », dans les deux vues.

### 3. L'accueil répond à trois questions

Dans cet ordre, sans défiler pour les deux premières sur un téléphone de 390 × 844 :

1. **Est-ce que ça tourne aujourd'hui ?** — l'objectif du jour (§5) ; au lancement, la liste de
   mise en place (§6).
2. **Qu'est-ce que je dois faire ?** — ce qui attend une décision (tickets à vérifier, articles à
   rattacher au menu, actions client), puis **une seule** prochaine étape, propre à l'étape du
   parcours (§4).
3. **Est-ce que ça vaut le coup ?** — le mois (§7).

Puis, en compact : l'équipe en salle, le prochain cap, le parcours. Le téléphone montre les 7
derniers jours en pastilles ; l'ordinateur, qui a la place, 14 jours en barres avec la ligne de
l'objectif et le parcours détaillé dans une colonne de côté.

### 4. Trois étapes, déduites des données

| Étape | Jusqu'à | Ce que l'accueil pousse |
|---|---|---|
| **Lancer** | 10 tickets validés au total | la liste de lancement |
| **Prendre le rythme** | 100 tickets validés sur 90 jours | l'objectif du jour, puis le geste de comptoir du jour et l'avancée vers l'étape suivante (« environ 9 jours à ton rythme actuel ») |
| **Faire grandir** | — | les idées de la page Opportunités |

Aucun état stocké : l'étape se recalcule à chaque affichage, depuis `orders`. Les 90 jours sont
exactement la fenêtre de la page Opportunités (`PERIOD_DAYS`) : quand l'étape s'ouvre, les idées
ont vraiment de quoi se calculer — cent tickets donnent une quinzaine d'observations par jour de
la semaine, le minimum pour parler d'un « jour calme ». Un établissement dont le rythme
s'effondre repasse en « rythme » au bout de 90 jours : c'est vrai, et ce n'est pas une punition,
c'est le signal que ses idées vieillissent.

### 5. L'objectif du jour, en tickets

**Pourquoi des tickets.** C'est le geste que le comptoir contrôle (« photographiez votre
ticket »), c'est la matière de toutes les idées, et c'est ce qui fait tomber les points et les
cadeaux. Les inscriptions seules sont une métrique de vanité (ADR 0033 : « membre actif » ≠
inscrit) ; le chiffre d'affaires ne se pilote pas à la journée. On compte les tickets **reçus**
(validés ou en attente) : l'objectif mesure ce que le comptoir a déclenché, pas la vitesse de la
file de vérification.

**La règle, dite en une phrase au restaurateur** : ton objectif est le premier palier (3, 4, 5,
6, 8, 10, 12, 15, 20…) que tu n'as pas encore tenu 5 jours sur les 7 derniers ; tiens-le 5 jours
sur 7 et tu passes au suivant. Il monte tout seul, ne s'invente jamais un chiffre hors de
portée, et redescend après une mauvaise semaine plutôt que de rester un reproche. Paliers serrés
en bas : entre 3 et 6 tickets par jour, un saut de 5 à 10 serait hors de portée des semaines.
Kraainem au 21/09 : objectif 4, tenu 4 jours sur 5 — un jour de plus et il passe à 5.

### 6. La liste de lancement : quatre gestes, cochés par les données

Logo · menu et coûts · QR affiché · 10 premiers tickets (le QR de l'équipe en salle, d'abord
cinquième geste, est devenu une tâche « À faire » — amendement en fin de document). Chaque
case se coche **toute seule**, sur une trace réelle : un logo en base, 5 articles avec un prix de
revient, 5 arrivées **anonymes** sur la vitrine en 14 jours (`qr_landings` — un inconnu qui
arrive prouve que le QR est au mur, un membre qui revient ne prouve rien), 10 tickets validés. Pas de case à cocher à la main : elle dirait ce que le restaurateur croit
avoir fait, pas ce qui marche. Un siège équipe ne reçoit pas la tâche du logo, qu'il ne peut
pas faire (ADR 0041 §6).

### 7. Le mois, et la mission écrite là où le coût s'affiche

« Commandes de tes clients du programme » face à « cadeaux offerts », et le rapport des deux
(« 1 € de cadeau pour 29 € de commandes »). **Jamais « grâce à nous »** : c'est le chiffre des
clients qui participent, pas un chiffre additionnel prouvé (cadrage de `lib/program-value.ts`).
Juste dessous, le rôle de la plateforme : faire grandir le chiffre d'affaires et les commandes
directes ; les cadeaux sont un investissement plafonné au taux de l'établissement (8 %, 4 % à
Kraainem — `getRestaurantBudgetPct`) de ce que ses clients dépensent, et tout est mesuré.

### 8. Le jeu porte sur la progression réelle, pas sur des badges

Retenu : les **étapes** avec leur condition d'ouverture visible ; le **passage de palier** de
l'objectif ; les **caps** (mêmes seuils que l'e-mail « Cap franchi », ADR 0063), fêtés une
semaine sur l'accueil ; le **classement de l'équipe en salle** par prénom (ADR 0053) — le seul
classement entre personnes, interne à la maison ; le **délai estimé** jusqu'à l'étape suivante.

Écarté : la **série de jours d'affilée** (façon Duolingo) — un objectif qui monte casse
forcément la série de qui garde son rythme, la récompense serait punie ; les **points et
badges** pour le restaurateur — un patron de restaurant est motivé par son chiffre et par la
reconnaissance, un badge sans enjeu commercial est du bruit ; le **classement entre
restaurants** — seuls des agrégats anonymisés franchissent la frontière entre établissements, en
plan Pro (ADR 0015 §7, ADR 0029 §7).

### 9. Les questions au restaurateur (PR suivante)

Avant de proposer une idée, on vérifie l'hypothèse qui la fonde auprès de celui qui connaît le
terrain. « D'après tes tickets, ton jour le plus calme est le mardi. C'est vrai ? » — Oui / Non,
c'est plutôt… Principes :

- **une question à la fois, un tap**, sur l'accueil, jamais un formulaire ;
- **au moment où l'hypothèse va servir** (le jour calme juste avant l'idée « promo du jour
  calme »), pas dans un questionnaire d'inscription ;
- **chaque réponse change quelque chose de visible** : une hypothèse réfutée retire l'idée
  qu'elle fondait ; « combien de clients servez-vous un jour normal ? » cale l'objectif sur une
  part de la clientèle ; les jours de fermeture ne comptent plus dans les 5 jours sur 7 ;
- trois familles : le **profil** (clients par jour, jours de fermeture, rush midi/soir, part des
  plateformes de livraison, objectif prioritaire), les **hypothèses** tirées des données (jour
  calme, heures creuses, plat phare, creux de fin de mois — les fonctions de `lib/insights.ts`),
  le **retour** sur une action menée (« la promo du mardi a-t-elle marché selon toi ? », à côté
  du chiffre mesuré).

Table `restaurant_answers` (migration horodatée, service-role, fail-open), réponses en données
restaurateur — jamais un membre.

### 10. Le message du soir (PR suivante)

Le restaurateur ne vient pas de lui-même : deux établissements sur trois n'ont ouvert aucune
console. La vue simple doit être **tirée** jusqu'à lui. Une séquence restaurateur « Ta journée »
entre dans le moteur de l'ADR 0063 (éteinte par défaut, allumée par établissement depuis
`/platform`) : à la fermeture, push d'abord, **un par jour au plus et seulement s'il y a quelque
chose à dire** — objectif atteint, palier franchi, cap, ou un encouragement concret avec le geste
de comptoir du lendemain ; jamais un reproche. À mesurer avant d'industrialiser : envoyer ce
message à la main à Kraainem pendant deux semaines et regarder si la console s'ouvre.

## Conséquences

- `lib/console-journey.ts` : étapes, objectif, liste de lancement, caps, mois, geste du jour —
  **fonctions pures, date injectée, testées** (`console-journey.test.ts`). `lib/console-journey-data.ts`
  : la lecture, service-role, fail-open, chaque compteur venant d'une colonne écrite par un geste
  réel (`orders.submitted_at`, `memberships.joined_at`, `qr_landings`) — la leçon de l'ADR 0050.
- `lib/admin-nav.ts` : une seule définition de la navigation pour les deux vues et « Plus ».
- `components/admin/simple/` (accueil, onglets), `app/admin/[restaurantId]/plus`,
  `app/admin/[restaurantId]/vue` (bascule, redirection bornée à la console de l'établissement).
  Le tableau de bord pro reste dans `page.tsx`, qui délègue à l'accueil simple selon le cookie.
- `components/admin/ui/` gagne `ProgressBar` et `ProgressRing` — une barre posée à la main
  devient une régression au même titre qu'un titre recopié (ADR 0054).
- Couleurs Boosteats, comme toute la console depuis l'amendement du même jour de l'ADR 0054
  (le logo et le nom de l'établissement en tête, rien d'autre de sa charte) : la bonne nouvelle
  est verte (`good`), la progression neutre (`ink`).
- La console n'est pas instrumentée (hors GA4). Le compteur d'ouvertures de l'accueil — par jour
  et par établissement, sans identifiant, sur le modèle de l'ADR 0051 — accompagnera le message du
  soir (§10), qui est la question qu'il sert à trancher.

### À surveiller

- **Un objectif qui compte des tickets en attente** peut compter un ticket rejeté ensuite. Rare
  depuis la validation automatique (ADR 0008 amendé) ; à revoir si la file grossit.
- **Un membre du personnel qui envoie ses propres tickets** pour tenir l'objectif : les limites de
  l'ADR 0008 (2 tickets par client et par jour, 6 sur 7 jours en file) tiennent le cas.
- **Le premier restaurateur habitué** (Kraainem) trouvera un autre accueil sans l'avoir demandé :
  la bascule « Vue pro » est dans l'en-tête sur ordinateur et dans « Plus » sur téléphone.

## Alternatives rejetées

- **Réécrire chaque page en version simplifiée** : double maintenance pour chaque écran. La
  première version change l'accueil et la navigation ; une page ne se simplifie que si le
  terrain le demande.
- **Une URL à part (`/admin/[id]/simple`)** : deux adresses pour le même accueil, et les liens
  des e-mails restaurateur (ADR 0063) mèneraient à la mauvaise.
- **Stocker l'étape et la faire avancer à la main depuis la plateforme** : dérive dès le
  deuxième établissement, et invérifiable. Déduite des données, elle se teste.
- **Cacher les pages pro dans la vue simple** : contraire à l'ADR 0030 §4 ; tout reste dans
  « Plus ».
- **Un objectif en inscriptions ou en chiffre d'affaires** : voir §5.

## Amendement 2026-09-21 — le QR de l'équipe en salle, première tâche « À faire »

**Demande du porteur**, à la mise en service : insister, dans les tâches à faire, sur la
création des QR du personnel, avec un bouton qui mène directement à cette création.

- **Une tâche « À faire », à toutes les étapes**, en tête de liste, avec un vrai bouton dans la
  ligne (« Créer les QR de mon équipe », puis « Ajouter un QR ») qui ouvre la page QR sur le
  formulaire, curseur dans le champ prénom (`/qr?creer=1#equipe`). C'est la première source
  d'inscriptions constatée (ADR 0053) : elle passe avant les tickets à vérifier.
- **Tant que l'équipe a moins de 3 QR actifs** (`STAFF_CODES_TARGET`). On ne connaît pas
  l'effectif réel ; une équipe de salle compte rarement moins de trois personnes (caisse, salle,
  service du soir), et la tâche disparaît d'elle-même au-delà. Avec un ou deux QR, elle nomme
  ceux qui existent et demande d'ajouter ceux qui manquent.
- **Une action, un seul endroit** (ADR 0054 §5) : le QR de l'équipe quitte la liste de lancement
  (qui passe à quatre gestes) et la carte « prochaine étape » de l'étape « Prendre le rythme ».
- Migration des codes salle absente : aucune tâche — on ne réclame pas un outil qui n'existe pas.
