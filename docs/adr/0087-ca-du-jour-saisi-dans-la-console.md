# ADR 0087 — Le CA du jour se saisit dans la console, rappelé jusqu'à la saisie

**Statut** : Accepté (2026-10-24) — décidé par le porteur en session, sur la maquette validée le
même jour (https://claude.ai/artifact/CC5iqMyYWdtWgLHfmo4o7o). Fait la suite prévue par
l'[ADR 0078](0078-ca-du-jour-saisi-a-la-main.md) §5 (le rappel s'automatise) et complète l'[ADR
0081](0081-le-jeu-de-la-croissance.md) (« saisie du CA par canal », graphique, prévision). Amende
l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md) sur un seul point : un
restaurateur peut **demander** qu'on connecte sa caisse (§6). Reprend la PR #279 (push au gérant, ADR
0077 encore en PR, non fusionné). Appliqué avec le bouclier de l'[ADR
0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le test de l'ADR 0078 a donné sa réponse sur le terrain, à Houba et De Bue (lecture de
`daily_revenue_entries` en production le 2026-10-24) :

- **Le chiffre vient tout seul quand on le demande** : 18 jours sur 26 envoyés « de lui-même », le
  plus souvent à la fermeture de la caisse, vers 0 h 45 ; le nombre de commandes est donné 8 fois
  sur 11 à Houba.
- **Le geste s'arrête sans rappel** : plus rien n'est noté depuis le 18/10, quand l'associé a cessé
  de relancer à la main.
- **Les canaux existent déjà dans la tête du gérant** : Houba écrit « Uber : 266 » dans la note.
- La réponse comparée (même jour des semaines passées, semaine en cours) **marche** : c'est elle
  que le porteur renvoyait par WhatsApp, et c'est elle qui fait revenir le chiffre le lendemain.

Le restaurateur ne pouvait pas saisir lui-même : seul un super-admin écrivait dans
`/platform/ca`. Un lien d'e-mail vers la console perdait sa destination au passage par la
connexion (aucun paramètre de retour).

## Décision

### 1. Une page de saisie, atteinte par les rappels et par l'accueil

`/admin/[restaurantId]/ca/[jour]` — **hors du menu** : on y arrive par une notification, un
e-mail ou la tâche « À faire » de l'accueil. Admin d'établissement (même garde que la console).
Un lien vers cette page **survit à la connexion** : le middleware garde la destination
(`/login?next=…`, chemin interne seulement), la page de connexion y renvoie.

### 2. Deux façons de saisir, montrées à égalité

- **Par canal** : Uber Eats, Deliveroo, Takeaway, À emporter, Sur place. On remplit ceux qu'on
  connaît ; le total se calcule.
- **Le total directement**, dans le même format, juste en dessous.
- Remplir l'un vide l'autre : **un seul chiffre fait foi** (le total, qui est la vente de caisse
  de l'ADR 0078 §4). Les canaux sont un détail du total, jamais une seconde source.
- **Nombre de commandes facultatif.** « Le restaurant était fermé ce jour-là » note un jour
  fermé : jamais une vente à 0 € (ADR 0078 §4).
- TVA comprise, toute la journée. On peut saisir ou corriger **les 14 derniers jours**, jamais le
  jour qui n'est pas encore fini avant l'heure de fermeture.

### 3. Ce que ça donne, tout de suite après la validation

L'écran de retour reprend le message que le porteur envoyait par WhatsApp (`replyMessage`) et
ajoute la fidélité :

- le jour face aux mêmes jours des semaines passées (jusqu'à 4) ;
- la semaine en cours face à la même période de la semaine d'avant (si elle est notée en entier) ;
- **le programme ce jour-là** : tickets validés, CA venu du programme, **taux de pénétration**
  (CA des tickets validés ÷ CA du jour) et part des commandes (tickets du programme ÷ commandes,
  si le nombre est donné) ;
- **une remarque seulement si c'est inhabituel** : jour à **±25 %** de la moyenne des mêmes jours,
  ou semaine à **±15 %** de la précédente. La remarque cherche une raison dans les signaux
  (météo, match, événement local, vacances scolaires, grève) et dit ce qu'elle a trouvé ; sans
  raison trouvée, elle constate l'écart sans l'inventer.
  *Précisé le 2026-10-24 (PR 5)* : on dit des **faits** (« Soir : pluie, 2,6 mm », « Match Anderlecht – Club
  Brugge à 20 h 45 »), jamais une cause supposée. Google Weather ne sert que 24 h d'historique : la météo est
  **photographiée chaque soir après 23 h** pour chaque établissement en ligne (`restaurant_day_weather`, résumée
  par service midi / soir). Les grèves ne se lisent qu'en direct : pas de fait « grève » pour un jour passé. Une
  source muette est **dite** (« pas d'information sur : matchs »), jamais lue comme « rien ce jour-là ».

### 4. Les rappels : quatre au plus par jour, arrêtés dès la saisie

| Moment | Condition |
|---|---|
| **Le soir**, 30 min après la fermeture | heure de fermeture du jour lue sur la fiche Google (`google_place_id`), **23 h 30** si la fiche n'en a pas ; un passage après minuit vaut pour le jour des ventes |
| **Le lendemain** à 10 h, 15 h, 18 h | seulement si le jour n'est toujours pas noté |
| **Le dimanche à 15 h** | s'il manque des jours de la semaine (lundi → samedi) : la liste, un bouton par jour |

- Chaque rappel part **en notification** (push console, PR #279) **et par e-mail** au(x) admin(s)
  de l'établissement. Dès qu'un jour est noté (console, plateforme ou « de lui-même »), plus aucun
  rappel pour ce jour.
- Les textes disent pourquoi le chiffre compte (comparaison, prévision), sans « automatique ».
- Rappels **éteints par défaut**, allumés par établissement depuis `/platform/messages` comme les
  autres messages (ADR 0063). Chaque envoi est journalisé (`message_sends`), réussi ou non.
- Une tâche planifiée toutes les heures décide qui reçoit quoi ; les règles sont pures et testées
  (date et heure injectées, fuseau Europe/Brussels).

### 5. L'accueil : seuls les jours manquants, puis le graphique et la prévision

- « À faire » montre **un jour non noté = une ligne + un bouton « Saisir »** (7 derniers jours,
  jours fermés exclus). C'est la seule entrée permanente vers la saisie.
- **Après 14 jours notés** : le graphique de la performance (jours notés, fermés, manquants).
- **Après 28 jours notés** : la prévision des 7 prochains jours (ADR 0027, `computeForecast`),
  qui se nourrit des mêmes ventes.
- *Précisé le 2026-10-24 (PR 6)* : la carte « Ta performance » lit chaque semaine passée en **CA moyen par
  jour noté** (une semaine trouée ne passe pas pour un effondrement ; au moins 3 jours notés, comme les paliers
  de l'ADR 0081), huit semaines au plus, chacune comparée à la précédente si elle la suit. Avant les seuils,
  elle dit combien de jours manquent. La prévision de l'accueil sort du **même chargement** que la page
  Prévisions (`lib/forecast-data.ts`) : les deux ne peuvent pas annoncer deux chiffres différents.

### 6. « Connecter ma caisse » : une demande, pas une connexion

Sous la saisie, un bouton enregistre une **demande de service** (`service_requests`, comme l'ADR
0081 §6) et prévient la plateforme ; on rappelle le restaurant pour voir, au cas par cas, si et
comment sa caisse peut envoyer le chiffre. L'ADR 0074 reste vrai pour le produit : **aucune
connexion automatique, aucun identifiant de portail stocké** ; une connexion éventuelle fera
l'objet d'un ADR par caisse.

## Conséquences

- Migration : colonnes de canaux (`uber`, `deliveroo`, `takeaway`, `emporter`, `sur_place`) et
  `source` (`console`, `plateforme`) sur `daily_revenue_entries`, nouvelle issue `saisi`
  (le restaurateur a saisi dans la console), journal des rappels envoyés par jour ; RPC
  `save_daily_revenue` étendue. Le code reste tolérant à leur absence (fail-open, la saisie du total
  marche sans les colonnes de canaux).
- **Livraison en PR successives** : (1) cet ADR ; (2) push console (#279 remise sur master) ;
  (3) la saisie, le retour, « À faire », le retour après connexion, « Connecter ma caisse » ;
  (4) les rappels ; (5) les remarques « inhabituel » et la météo ; (6) le graphique et la
  prévision à l'accueil.
- `/platform/ca` reste : il sert aux réponses par WhatsApp et aux corrections.
- **Trace** : par établissement, jours notés ÷ jours ouverts, part notée sans rappel, après chaque
  rappel (soir, 10 h, 15 h, 18 h, dimanche), part par canal ou par total, demandes « Connecter ma
  caisse ». Si moins de la moitié des jours sont notés après deux semaines de rappels, on revoit le
  geste avant d'aller plus loin (même seuil que l'ADR 0078 §2).
- **ADR 0007 inchangé** : le CA, les canaux et le taux de pénétration restent dans la console ;
  rien ne remonte vers un membre.

## Alternatives rejetées

- **Une saisie dans le menu de la console** : un écran de plus qu'on oublie ; le rappel et la
  tâche « À faire » amènent au bon jour au bon moment.
- **Les canaux obligatoires** : beaucoup de caisses ne donnent que le total ; exiger le détail
  ferait perdre le chiffre.
- **Rappeler jusqu'à la saisie, sans limite** : au-delà de quatre messages, on apprend au gérant à
  ignorer les notifications de Boosteats.
- **Une heure de rappel fixe pour tous** : les fermetures vont de 22 h à 1 h ; un rappel avant la
  fin de la caisse arrive trop tôt pour être utile.
