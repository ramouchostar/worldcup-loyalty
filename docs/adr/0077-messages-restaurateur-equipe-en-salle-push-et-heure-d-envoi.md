# ADR 0077 — Messages au restaurateur sur l'équipe en salle : e-mail, push, heure d'envoi apprise

**Statut** : Accepté (2026-10-03) — demande du porteur, maquette validée
(https://claude.ai/artifact/FDAs3oiDp3x2VdXmRhW29d, écrans 4 à 6). Prolonge l'**ADR 0063**
(séquences pilotées par la plateforme) côté restaurateur et l'**ADR 0053** (équipe en salle).
Livré en trois PR : séquences e-mail (PR A), push console (PR B), heures d'envoi (PR C).

## Contexte

L'équipe en salle est la première source d'inscriptions constatée (ADR 0053). Deux moments
restaient muets côté restaurateur :

1. **Un établissement mis en ligne qui ne crée aucun QR d'équipe.** Le conseil existe sur
   l'accueil de la console (ADR 0064), mais seulement pour qui l'ouvre.
2. **La fin du mois.** Le gérant n'a aucun bilan de son équipe à montrer, alors que
   c'est le moment où il félicite ou relance.

Le porteur demande aussi le **push** (« ce sont des sujets importants ») et que l'on **apprenne
des clics** à quelle heure écrire aux restaurateurs.

Le moteur de l'ADR 0063 ne sert que les membres ; les séquences restaurateur du catalogue
(« Cap franchi », « Ta semaine », « L'idée de la semaine ») n'ont pas encore de moteur. Il
n'existe pas de push pour la console.

## Décision

### 1. Deux séquences restaurateur

| Séquence (clé) | Pour qui | Quand | Plafond | Réussite |
|---|---|---|---|---|
| Crée les QR de ton équipe (`staff_setup`) | établissement **sans aucun QR actif** | J+7, J+14, J+30 après la **mise en ligne** (`restaurants.activated_at`) | 3 envois puis silence ; s'arrête au premier QR | un QR créé |
| Ton équipe en salle ce mois-ci (`staff_monthly`) | établissement avec **au moins un QR actif** | le **2 du mois**, ou le **3** si le 2 tombe un lundi ou un jeudi | 1 par mois | console ouverte |

- **« Inscription finale »** (mot du porteur) = la mise en ligne par la plateforme, une fois la
  carte et le ticket faits (ADR 0075). C'est la seule date où « tout est réglé ».
- **« Pas créé » = aucun QR actif.** Avec un ou deux QR, le conseil reste dans la console
  (ADR 0064) : on n'écrit pas à quelqu'un qui a commencé.
- **Le 2, pas le 1er** : d'autres messages, prioritaires, sont prévus en début de mois. Le lundi
  et le jeudi sont réservés au récap et à l'idée de la semaine (ADR 0063 §1).
- **Le bilan du mois** porte sur le mois civil précédent (Bruxelles) : scans, inscrits, inscrits
  avec un ticket, écart d'inscrits avec le mois d'avant, podium par inscrits, et les personnes
  **à relancer** (`lib/staff-status.ts`, même règle que la console). Si personne n'a rien scanné,
  l'e-mail devient une relance au lieu d'un podium vide.
- **Destinataires** : le propriétaire (`owner_id`) et les sièges **gérant** et **manager**
  (ADR 0041). Pas le siège « équipe » : il n'a pas la main sur les QR.
- Règles ADR 0063 reprises : **éteint par défaut**, allumé séquence × établissement depuis
  `/platform/messages` ; comptes démo jamais lus ; arrêt en un clic par séquence et par
  personne (`message_optouts`, fail-closed) ; tout envoi journalisé (`message_sends`).
- **Pas de groupe témoin** pour ces deux séquences : quelques destinataires par mois, un témoin
  de 10 % ne mesurerait rien et priverait un gérant d'un message utile.

### 2. Push console (PR B)

- Le même message, en deux lignes, sur le téléphone du gérant ; l'appui ouvre la page utile.
- **Abonnements séparés des membres** (`console_push_subscriptions`) : un gérant qui est aussi
  client de son établissement ne reçoit pas les alertes de la console sur son compte client, ni
  l'inverse. Même service worker, même clé VAPID.
- Activation par une carte de l'accueil de la console, tant que ce téléphone n'est pas abonné.
  Sur iPhone, le push n'existe que pour l'app ajoutée à l'écran d'accueil : la carte le dit.
- Un push part avec l'e-mail de la même étape, s'il y a un appareil abonné. Il est journalisé
  sur sa propre ligne (`channel = 'push'`).

### 3. Chaque clic est gardé

- **E-mail** : déjà en place (ADR 0063 §6) — liens par `/c/<envoi>`, robots écartés.
- **Push** : l'URL de la notification passe par le même `/c/<envoi>` : un appui = un clic sur la
  ligne push. Aucun nouveau traceur.

### 4. Apprendre l'heure d'envoi (PR C)

- **On fait tourner les heures** : pour savoir quelle heure marche, il faut en avoir essayé
  plusieurs. Quatre créneaux, hors coup de feu : **9 h, 11 h, 15 h, 17 h 30** (Bruxelles).
  Chaque destinataire passe de créneau en créneau d'un envoi à l'autre (point de départ tiré par
  hachage stable). Le créneau prévu est conservé sur la ligne (`message_sends.send_slot`), l'heure
  réelle est `created_at`.
- **Le moteur passe toutes les 30 minutes** ; un envoi part au premier passage après son créneau,
  le jour dû.
- **La lecture** (`/platform/messages`, « Meilleures heures ») : par créneau, envois, clics, taux
  de clic, délai médian avant clic ; séparément pour l'e-mail et le push. **Aucune conclusion**
  tant que chaque créneau n'a pas **30 envois** et le meilleur **10 clics** : la page le dit et la
  rotation continue.
- **La décision reste humaine** : la page recommande un créneau quand les seuils sont atteints ;
  le super-admin le fixe d'un clic (`message_timing`). Une fois fixé, **20 %** des envois
  continuent d'explorer les autres créneaux, au cas où les habitudes changent.
- **Un signal plus rapide en attendant** : un compteur des **ouvertures de la console par heure**
  (`console_visits_hourly`, établissement × jour × heure, au plus une par personne et par heure,
  sans identifiant). Il dit quand les gérants sont disponibles bien avant que les clics suffisent.
  Les visites du super-admin en mode plateforme ne comptent pas.
- **Les séquences membres** partent toutes à 18 h : leur lecture par heure de clic est affichée,
  mais on ne fait pas tourner leur heure ici (autre décision, autre ADR si besoin).

## Conséquences

- `lib/pro-sequence-rules.ts` (pur, testé) : étape due, jour du bilan, créneau. Moteur
  `lib/pro-sequence-runner.ts`, cron `/api/cron/pro-sequences` (toutes les 30 min).
- Gabarits `lib/email-templates/pro-staff-setup.ts` et `pro-staff-monthly.ts`, avec leur texte de
  push dans le même module ; fixtures dans `fixtures.ts` (aperçu, e-mail de test, contrôles).
- Statistiques du mois : `getStaffMonthStats` (`lib/staff-codes.ts`).
- Migrations horodatées : `send_slot` (PR A), `console_push_subscriptions` (PR B),
  `console_visits_hourly` et `message_timing` (PR C). Le moteur **ne part pas** tant que la
  colonne `send_slot` manque : sans journal fiable, il renverrait la même étape à chaque passage.
- La page d'arrêt `/e/stop/<envoi>` parle au restaurateur quand l'envoi lui était destiné.

## À surveiller

- **Volume** : avec peu d'établissements réels, ces séquences font quelques envois par mois. Il
  faudra **de nombreux mois** avant 30 envois par créneau ; le compteur d'ouvertures de la console
  est le signal à lire d'ici là. Revoir les seuils s'ils ne sont jamais atteints.
- **Push iPhone** : si la part d'abonnés reste nulle chez les gérants sur iPhone, l'ajout à
  l'écran d'accueil est le frein ; l'expliquer à l'onboarding.

## Alternatives écartées

- **Relancer aussi à 1 ou 2 QR par e-mail** : on écrirait à quelqu'un qui a commencé ; la
  console suffit (ADR 0064).
- **Bilan le 1er du mois** : réservé à des messages prioritaires (porteur).
- **Choisir l'heure automatiquement dès les premiers clics** : avec quelques envois, le hasard
  désignerait un « gagnant ». Seuils, puis décision humaine.
- **Réutiliser `push_subscriptions` avec une colonne d'audience** : l'unicité `(user_id,
  endpoint)` empêche le même téléphone d'être abonné côté membre et côté console.
