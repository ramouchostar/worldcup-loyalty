# ADR 0063 — Les messages du programme se pilotent depuis la plateforme

**Statut** : Accepté (2026-09-18) — décisions du porteur prises le même jour, sur la revue
des maquettes rendues par le code des gabarits. **Précise l'[ADR 0039](0039-canal-general-et-communications-de-service.md) §2**
(les relances d'usage du programme sont des messages du programme, pas des promotions),
**complète l'[ADR 0009](0009-proactive-community-notifications.md)** (canal e-mail, séquences
datées, carte in-app durable) et l'**[ADR 0025](0025-gdpr-data-governance.md) §8** (Resend,
sous-traitant d'envoi). Ne change rien aux enveloppes anti-spam des notifications
automatiques ni des broadcasts. Livré en cinq PR ; la première (gabarits) accompagne cet ADR,
la deuxième (journal, onglet Messages) est décrite en fin de document.

## Contexte

Chantier backlog « Pilotage des notifications et in-app message depuis la plateforme ».
État de la production au 2026-09-18, avant toute nouvelle séquence :

- **Aucun e-mail n'est jamais parti.** `email_log` est vide depuis sa création (m50) :
  ni bienvenue, ni rappel de cadeau, ni relance restaurateur. L'expéditeur par défaut
  `onboarding@resend.dev` ne délivre qu'au propriétaire du compte Resend, et aucun domaine
  d'envoi n'est vérifié.
- **Le domaine ne reçoit rien.** `boosteats.tech` (DNS chez IONOS) n'a ni MX, ni SPF, ni
  DMARC : `contact@boosteats.tech`, affiché sur la vitrine restaurateurs, rebondit.
- **Les trois quarts des notifications ne sont vues par personne.** Kraainem : 28
  notifications depuis le lancement, dont 21 « in-app » — un bandeau affiché seulement si
  le membre ouvre l'app dans les 24 h, sans trace de lecture. Houba et De Bue : aucune.
- **Deux défauts dans les gabarits e-mail** : le logo passait le chemin brut du bucket
  (image cassée partout) et les noms n'étaient pas échappés (un nom d'équipe contenant du
  HTML finissait dans l'e-mail de chaque membre).
- **Rien ne mesure l'effet d'un message** : on journalise « envoyé », jamais délivré,
  cliqué, ni suivi de l'action attendue.
- Le passage de 18 h sautait, pour tout établissement sans membre en équipe (Houba, De Bue),
  le rappel de cadeau et les relances restaurateur (`continue` placé trop tôt).

Le porteur a listé les messages voulus : côté membres, choix d'équipe, « scannez vos
tickets », parrainage après un cadeau récupéré, installation de l'app ; côté restaurateurs,
paliers de félicitations, recommandations hebdomadaires, récap complet de la semaine.

## Décision

### 1. Sept séquences, un critère de réussite chacune

| Séquence | Destinataires | Moment | Plafond | Canaux | Réussite (7 j) |
|---|---|---|---|---|---|
| Ton premier ticket | inscrit sans ticket validé | J+2, J+7, J+21 après l'adhésion | 3 envois, puis silence | e-mail, push si installée | 1er ticket validé |
| Rejoins ton équipe | sans équipe, ≥ 1 ticket validé | au plus tôt 7 j après le 1er ticket | 1 par semestre | e-mail, push | équipe rejointe |
| Invite tes amis | vient de récupérer un cadeau | lendemain 18 h | 1 par cadeau, 1 / 14 j | e-mail, push | ami inscrit par son lien |
| Installe l'app | ≥ 1 ticket validé, jamais ouverte installée | J+3 après le 1er ticket, J+30 | 2 envois | e-mail seul | app ouverte installée |
| Cap franchi | établissement (membres, tickets, CA programme) | passage de 18 h | 1 par cap, 1 / jour | e-mail | console ouverte |
| Ta semaine | établissement actif | lundi 8 h | 1 / semaine | e-mail | annonce programmée |
| L'idée de la semaine | établissement dont le moteur (ADR 0022) sort une idée | jeudi 10 h | 1 / semaine, 0 sinon | e-mail | annonce programmée |

Écarts assumés par rapport à la liste d'origine :

- **« Scannez vos tickets » devient « Ton premier ticket »**, et « scanner » disparaît :
  le mot est banni côté client pour le geste ticket (CONTEXT.md, *Photo du ticket*).
- **Trois envois puis silence, pas une relance hebdomadaire sans fin.** Cinquante e-mails
  par an à quelqu'un qui n'est jamais revenu font monter les plaintes ; au-delà de 0,3 %,
  Gmail et Yahoo dégradent **tous** nos envois, rappels de cadeau compris.
- **Le récap intègre le classement de l'équipe en salle** (acquisition par prénom,
  ADR 0053) et place **l'action de la semaine juste après les chiffres** : le restaurateur
  lit debout, l'action doit tomber tant qu'il est là.
- **L'idée du jeudi ne part que si une idée passe les seuils** du moteur : un jeudi sans
  e-mail vaut mieux qu'une idée creuse qui apprend à ignorer les suivantes.

### 2. Règles communes

- **Éteint par défaut.** Une séquence ne part pour un établissement qu'allumée depuis
  `/platform` (interrupteur séquence × établissement). Les comptes démo restent éteints.
  Kraainem seul pendant deux semaines, puis Houba et De Bue.
- **Un e-mail de séquence par membre et par semaine**, toutes séquences confondues ;
  priorité : premier ticket, app, amis, équipe. Les informations de service (cadeau qui
  expire, ticket réparé) passent toujours.
- **Chaque séquence se coupe seule** (« Ne plus recevoir ces rappels ») sans quitter le
  programme ; « Gérer mes e-mails » ouvre la liste complète.
- **Restaurateurs : gérants et managers** (sièges ADR 0041), plus seulement `owner_id`.
- **Vocabulaire du produit** : « prends ton ticket en photo » ; jamais « validé »,
  « automatique » ni « instantané » côté membre (ADR 0008) ; aucun euro côté membre sauf la
  commande minimum de 10 € (ADR 0007 amendé). Vérifié par test sur le rendu de chaque
  gabarit (`lib/email-templates/fixtures.test.ts`).

### 3. Régime : programme, pas promotion (précise ADR 0039 §2)

Les quatre séquences membres parlent des avantages du membre dans le programme qu'il a
rejoint — son cadeau d'accueil, son équipe, ses jetons, l'app qui les porte — et non d'une
offre sur un plat. Elles relèvent de l'**exécution du contrat** (ADR 0039, nature
`service`), sans case à cocher, avec l'arrêt par séquence. Une **promotion par e-mail**
reste soumise à consentement, et la case actuelle (« Notifications push et WhatsApp ») ne
la couvre pas : il faudra une case « offres par e-mail » distincte avant d'en envoyer une.

### 4. Un kit, deux habillages

`lib/email-templates/kit.ts` remplace `layout.ts` pour tous les e-mails, séquences et
transactionnels :

- **Membre** : l'e-mail de SON établissement — logo sur pastille blanche (règle de la
  console, ADR 0054 §4), boutons dans `brand_primary`, bonne nouvelle en **vert fixe**
  (jamais `brand_accent`, rouge chez Belchicken — ADR 0048 §7), tutoiement, zéro euro.
- **Restaurateur** : l'outil Boosteats (bandeau `#0C1509`, étiquettes en mono), euros
  autorisés (ADR 0027 §1).
- Tout texte venu de la base est **échappé** ; chaque e-mail a un texte d'aperçu, une
  version texte, un pied de page qui dit pourquoi on le reçoit ; tableaux et styles en
  ligne (Outlook), aucune police web.
- Chaque séquence membre a sa **version courte** (push, carte in-app) dans le même module
  que l'e-mail : même promesse, un seul endroit à relire.
- Aperçu local : `npx tsx scripts/email-preview.ts`, sur un établissement fictif
  (`fixtures.ts`), réutilisable par la future page plateforme.

### 5. Expédition : Resend, `mail.boosteats.tech`, réponses vers la plateforme

- **Resend**, déjà intégré (`lib/email.ts`) et disponible sur la Vercel Marketplace
  (clé injectée dans le projet), domaine créé en **région UE (Irlande)**, DPA à signer
  (ADR 0025 §8). Webhooks signés pour délivré / rebond / plainte.
- **Sous-domaine d'envoi dédié** `mail.boosteats.tech` : la réputation d'envoi reste
  séparée des boîtes de l'équipe. SPF et DKIM fournis par Resend, DMARC sur
  `boosteats.tech` en `p=none` puis `p=quarantine` après 3 à 4 semaines.
- **Expéditeurs** (`lib/email-sender.ts`, pur et testé) : membre →
  `"<nom de l'établissement>" <bonjour@mail.boosteats.tech>` — c'est le restaurant qu'il
  reconnaît dans sa boîte ; restaurateur → `Boosteats <equipe@mail.boosteats.tech>`.
  Variables : `EMAIL_DOMAIN`, `EMAIL_REPLY_TO` ; sans domaine, repli sur `EMAIL_FROM`.
- **Réponses vers `contact@boosteats.tech`, jamais vers le restaurant** : la réponse d'un
  membre donnerait son adresse au restaurateur (ADR 0025). **Jamais de « no-reply »** : les
  réponses portent les demandes RGPD et les « mon ticket n'est pas passé ». La boîte
  `contact@` doit donc exister avant l'activation.
- Les e-mails d'authentification (confirmation, lien de connexion) passent par le même
  domaine via le SMTP Resend, configuré dans Supabase.

### 6. Mesurer l'effet, sans pixel

- **Journal unique des envois** (séquence ou campagne, canal, destinataire, statut),
  délivrabilité par webhook Resend, **clic** par une courte redirection de notre domaine,
  **carte in-app** vue et touchée, **réussite** lue dans nos tables sur 7 jours.
- **Pas de pixel d'ouverture** : Apple Mail le déclenche seul pour une large part des
  iPhone (taux faux), et un pixel est un traceur qui demande un consentement. **Pas de
  suivi de clics chez Resend** : liens réécrits sur un domaine tiers, donnée qui sort.
- **Groupe témoin de 10 %** par séquence membre, tiré au sort parmi les éligibles, qui ne
  reçoit rien. L'effet d'une séquence est l'écart de réussite avec lui — sans lui, une
  relance « efficace » peut ne toucher que ceux qui revenaient de toute façon.

Même principe que l'entonnoir des tickets (ADR 0037, 0051) : on compte ce que le serveur
constate, pas ce qu'un traceur devine.

## Conséquences

### Découpage

| PR | Contenu |
|---|---|
| 1 | **Cet ADR + les gabarits** : kit v2, 7 séquences, messages courts, aperçu, migration des 10 e-mails existants, logo réparé, expéditeur par établissement et adresse de réponse, rappel de cadeau nommé, passage de 18 h réparé pour les établissements sans équipe |
| 2 | Journal des envois, interrupteurs séquence × établissement, onglet plateforme « Messages » en lecture, webhook Resend, redirection de clics |
| 3 | Moteur des séquences (passage quotidien) : éligibilité, plafonds, priorité, témoin ; membres puis restaurateurs (lundi, jeudi) |
| 4 | Carte in-app durable sur l'accueil (fin du bandeau de 24 h) ; compositeur plateforme avec segments cumulables et décompte avant envoi |
| 5 | Préférences e-mail (`/compte`, réglages restaurateur), arrêt en un clic (`List-Unsubscribe`), politique de confidentialité |

### Hors code (porteur)

Installer Resend depuis la Vercel Marketplace, ajouter `mail.boosteats.tech` (région UE),
publier les enregistrements DNS chez IONOS, créer la boîte `contact@boosteats.tech`,
brancher le SMTP Resend dans Supabase, renseigner `EMAIL_DOMAIN` et `EMAIL_REPLY_TO`.

### À surveiller

- **Images des plats** : les illustrations Fluent sont en WebP, qu'Outlook sur Windows
  n'affiche pas (le texte alternatif prend le relais). Si la part d'Outlook le justifie,
  servir un PNG depuis notre domaine.
- **Détection d'installation non rétroactive** (ADR 0038, 2026-08-22) : un membre installé
  avant cette date peut recevoir « Installe l'app » — d'où le lien « C'est déjà fait ».

## Alternatives rejetées

- **Relance « premier ticket » chaque semaine** (demande d'origine) : voir §1 — le coût de
  réputation tombe sur tous les autres e-mails.
- **Promos par e-mail sous la case existante** : elle dit « push et WhatsApp » ; un
  consentement ne s'étend pas en silence à un autre canal.
- **Réponses vers l'adresse du restaurant** : fuite de l'adresse du membre (ADR 0025).
- **Brevo** : français et solide pour des newsletters mises en page à la main, mais nos
  gabarits vivent dans le code — réécriture sans gain. **Amazon SES** : moins cher à
  grande échelle, configuration lourde pour nos volumes. **Postmark** : refuse ce qui
  ressemble à du marketing sur son flux transactionnel.
- **Un seul e-mail restaurateur par semaine** : le porteur garde l'idée du jeudi, utile pour
  une promo de week-end annoncée à J-1/J-2 (ADR 0023), à condition qu'elle tienne.
- **Pixel d'ouverture** et **suivi de clics du prestataire** : voir §6.

## Notes de mise en œuvre — PR 2 (2026-09-21) : le journal et l'onglet Messages

- **Le domaine vérifié chez Resend est `boosteats.tech` lui-même**, pas `mail.boosteats.tech`
  (DKIM `resend._domainkey`, SPF sur `send.boosteats.tech`, région `eu-west-1`, DMARC
  `p=none` chez IONOS). `EMAIL_DOMAIN=boosteats.tech` : expéditeurs
  `bonjour@boosteats.tech` (membres) et `equipe@boosteats.tech` (restaurateurs). La
  réputation d'envoi est partagée avec les boîtes IONOS du domaine — c'est le réglage fait
  par le porteur, on le garde ; passer sur un sous-domaine reste possible sans code.
- **Constat du jour** : le projet Vercel de production n'avait ni `RESEND_API_KEY`, ni
  `EMAIL_DOMAIN`, ni `EMAIL_REPLY_TO` — et 8 inscriptions depuis le 19/09 sans aucun e-mail
  de bienvenue, sans aucune trace. D'où la règle : **toute tentative d'envoi est journalisée,
  réussie ou non** (`message_sends`, statut `failed` et la raison), et la configuration se lit
  en tête de `/platform/messages`, avec un bouton « M'envoyer un e-mail de test ».
- **Journal** (`docs/migrations/20260921-1615-journal-des-messages.sql`) : `message_sends`
  (une ligne par tentative, sans adresse) et `message_settings` (interrupteur séquence ×
  établissement, aucune ligne = éteint). Service role uniquement ; export et effacement RGPD
  couverts (`lib/gdpr.ts`).
- **Tout e-mail passe par `dispatch`** (`lib/email.ts`), tout push transactionnel par
  `sendTransactionalPush` (`lib/notifications.ts`) : c'est ce qui les journalise. Un push sans
  appareil abonné est noté « non joignable » au lieu de se taire.
- **Clics** : les liens d'un e-mail vers notre domaine passent par `/c/<envoi>?to=<chemin>`
  (`lib/message-links.ts`) — chemin relatif obligatoire (jamais une redirection ouverte),
  robots de messagerie ignorés, un compteur et jamais une décision.
- **Délivrance** : `/api/webhooks/resend`, signature Svix vérifiée sans dépendance
  (`lib/resend-webhook.ts`, `RESEND_WEBHOOK_SECRET`) ; délivré, rebond et plainte mettent le
  journal à jour, rien d'autre (ni ouverture, ni clic chez Resend).
- **Onglet Messages** (`/platform/messages`) : configuration d'envoi, e-mail de test, chiffres
  sur 30 jours, interrupteurs des sept séquences par établissement réel, transactionnels,
  notifications du réseau réel, journal des 40 derniers envois. Les interrupteurs existent
  avant le moteur (PR 3) : une séquence allumée ne part pas encore, la page le dit.
- Politique de confidentialité et registre des traitements : le journal (sans pixel) et Resend
  y sont ajoutés.
