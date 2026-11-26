# ADR 0108 — L'espace de commande du restaurant : un compte pour commander, des points à la remise, Nina aux commandes

**Statut** : Accepté (2026-11-20) — décidé par Omar en session, **maquette des treize écrans validée par Omar le 2026-11-20** (https://claude.ai/artifact/NhFHLJYDuZoxsxrvKwmmDu), **validé par Mehdi lors d'une réunion avec Omar le 2026-11-20, tel que rapporté par Omar** : sa validation ne tranche pas les points de « Restent ouverts », qui restent à décider (cet ADR change la nature de données que l'[ADR 0099](0099-le-site-de-commande-en-option.md), accepté avec lui, avait voulues anonymes et jetables). **Remplace** l'[ADR 0088](0088-site-referencement-pro.md) pour tout ce qui concerne le **site** (sous-domaine, pages générées, bouton « Commander » vers l'extérieur) : le site vitrine est abandonné. **Amende l'ADR 0099** : §9 (la page publique « sans compte » devient l'espace de commande, avec un compte), §8 (Nina pilote l'espace de bout en bout) et Conséquences (« jamais de croisement avec les membres sans consentement » : la commande du site **est** désormais rattachée au membre, pour la fidélité). **Précise** l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md) (ce que fait Nina), l'[ADR 0070](0070-plans-croissance-pro-commande-en-ligne-et-referencement.md) (le site de ce plan n'est plus une vitrine) et l'[ADR 0107](0107-les-tickets-de-cuisine-sortent-sur-l-imprimante-du-restaurant.md) §10 (le secours WhatsApp n'enregistre rien, donc ne crédite rien). **N'amende ni l'ADR 0007 ni l'ADR 0028** : le membre ne voit toujours aucun euro, et ses points ne se convertissent toujours pas (§5). S'appuie sur l'[ADR 0015](0015-multi-restaurant-platform-pivot.md) (un compte, plusieurs établissements), l'[ADR 0025](0025-gdpr-data-governance.md) (RGPD), l'[ADR 0082](0082-fiche-google-geree-sur-invitation.md) (la fiche Google) et l'[ADR 0100](0100-les-options-se-reglent-par-groupes-de-plats.md) (les options).

> **Amendé par l'[ADR 0109](0109-la-commande-planifiee.md) (2026-11-26)** : §2 (téléphone obligatoire pour une heure choisie), §4 (restaurant fermé : on commande pour plus tard), §5, §6 et §7. **Précisé par les [ADR 0110](0110-les-offres-sur-la-page-de-commande.md)** (offres, §6) **et [ADR 0111](0111-les-articles-de-blog-du-restaurant.md)** (articles, §4 et §6). Rien n'est construit : le code suit encore cet ADR.

## Contexte

Jusqu'ici, deux chantiers coexistaient sur le papier sans se toucher :

- **Un site vitrine** par restaurant (ADR 0088), sur `<établissement>.boosteats.be`, pour être trouvé sur Google, avec un bouton « Commander » qui **sortait** du site. **Rien n'en a été construit** : aucun routage de sous-domaine (`middleware.ts`), aucune page générée.
- **Une page de commande** (ADR 0099 §9, `/commander/<établissement>`), publique, anonyme (un prénom et un téléphone), sans l'identité du restaurant, non indexée, fermée par `SITE_ORDER_RESTAURANTS` **et** un forfait Pro, et **jamais essayée sur une vraie base**.

Omar a tranché le 2026-11-20 : **on laisse tomber le site vitrine** et on concentre l'effort sur **l'espace de commande**, parce que c'est lui qui apporte ce qu'un restaurateur demande (un canal direct, sans commission) **et** qui rapporte à Boosteats ce que la vitrine ne rapportait pas : un lien avec les clients du programme de fidélité. Un client qui suit le restaurant dans l'app Boosteats y trouve l'espace de commande ; un client qui arrive depuis un navigateur s'authentifie ; la commande compte pour sa fidélité ; et tout cela est **piloté par Nina**.

Ce que le code dit aujourd'hui, et que cet ADR doit défaire ou respecter :

- `lib/site-orders/` ne connaît **aucun compte** : `site_orders` garde `first_name` (obligatoire) et `phone` (facultatif), **sans lien avec un membre**. Le glossaire le dit : une commande du site « ne s'écrit jamais dans `orders` ; un point pourra être crédité plus tard, sans photo de ticket » (`CONTEXT.md`). Ce « plus tard » est cet ADR.
- Un membre n'a de points que par une ligne de `orders` (la photo d'un ticket, lue, validée automatiquement ou à la main : `app/api/orders/route.ts`). Un **membre actif** (ADR 0033) est un membre qui a au moins une **commande directe validée**.
- La connexion par Google **existe déjà** (`signInWithOAuth` dans l'inscription, la connexion et l'envoi d'un ticket) : l'exigence « un compte, même Google » ne demande aucune nouvelle brique d'authentification.
- La fiche Google d'un restaurant est déjà lue par Boosteats (Places, DataForSEO) et **gérée sur invitation** (ADR 0082) ; l'ADR 0106 (PR #474) y ajoute la lecture des avis.

**Ce que cet ADR n'a pas vu.** Aucun restaurateur ni aucun client n'a utilisé l'espace de commande : tout ce qui suit sur le parcours est une décision de principe, pas une observation. L'apparence a été montrée et **validée par Omar le 2026-11-20** sur une maquette de treize écrans : neuf côté client, dont sept sur téléphone (accueil et carte, **fiche d'un plat avec ses options** (ADR 0100), panier, connexion à l'envoi, commande envoyée, restaurant fermé selon sa fiche, entrée depuis l'app) et deux sur ordinateur (accueil avec le panier toujours visible à droite, fiche du plat en fenêtre sur deux colonnes), et quatre côté gérant, la **console de Nina** (idée « ton espace est presque prêt » avec l'ouverture bloquée par un écart avec la fiche Google, page « Commandes du site » avec alertes et propositions, rapport de la semaine, e-mail d'alerte), avec des `[crochets]` là où les données manquent. Cette maquette valide l'**apparence**, pas l'usage : elle ne dit pas si un client ira au bout de la connexion (voir la Trace). Elle ne montre ni la connexion sur ordinateur (probablement une fenêtre, comme la fiche du plat) ni l'accueil « Aujourd'hui » du gérant avec sa section « À faire » (où l'ADR place aussi les alertes) : ces écrans restent à montrer avant leur code (charte anti-slop, ADR 0090 ; bouclier, ADR 0065).

## Décision

### 1. Le site vitrine est abandonné ; l'espace de commande le remplace

Plus de `<établissement>.boosteats.be`, plus de pages de plats générées pour Google, plus de bouton « Commander » qui renvoie vers un site tiers. **L'ADR 0088 est remplacé** pour le site. Ce qui n'est **pas** tranché ici et reste à décider séparément (Restent ouverts 3) : la **fiche Google gérée** et le **rapport mensuel avec grille Google Maps**, que l'ADR 0088 faisait entrer dans le « référencement » du Pro.

L'espace de commande vit à l'adresse déjà en place, **`/commander/<établissement>`**, une seule page pour l'app et pour le navigateur.

### 2. Un compte pour tout le monde, la connexion Google suffit

Pour **envoyer** une commande, il faut un **compte Boosteats** : e-mail et mot de passe, ou **Google** (la brique existe). **Pas de commande anonyme**, pas de « continuer en invité ».

- **On peut regarder sans compte.** La carte, les prix, les options et le panier sont visibles et se remplissent sans connexion ; la **connexion est demandée au moment d'envoyer**. Un mur dès l'arrivée ferait fuir le client avant qu'il ait vu un plat. *(Proposition à valider sur maquette, voir la Trace.)*
- **Le panier survit à la connexion.** Sur iPhone, la redirection vers Google et le retour dans l'app ne partagent pas le stockage du navigateur (la feuille « app puis notifications » de `CONTEXT.md` l'a déjà appris à ses dépens). La commande en cours se garde côté serveur ou dans un stockage que la redirection ne vide pas ; un panier perdu après la connexion est un échec de cet ADR.
- **L'identité vient du compte.** Le prénom de la commande est celui du compte ; le **téléphone n'est plus exigé** (un compte Google n'en donne pas). Il reste **facultatif**, pour que le restaurateur puisse appeler. *(À valider, Restent ouverts 4.)*
- **Commander = rejoindre le restaurant** (ADR 0015 §3 : l'adhésion est libre). La première commande crée l'appartenance si elle n'existe pas, avec une phrase claire sur l'écran. **Aucun consentement marketing n'est présumé** : les envois (ADR 0014, ADR 0025) gardent leur propre accord.

### 3. Deux portes d'entrée, une seule page

- **Depuis l'app Boosteats** : un membre qui **suit** le restaurant (`/r/<établissement>`) y voit l'entrée « Commander », **seulement si l'espace est ouvert** pour ce restaurant. Il est déjà connecté.
- **Depuis un navigateur** : le lien de l'espace ouvre la page ; la connexion est demandée à l'envoi (§2).

L'espace n'existe pour personne tant que les deux portes de l'ADR 0099 §8 ne sont pas ouvertes (drapeau `SITE_ORDER_RESTAURANTS` et forfait ; Restent ouverts 1) : **404 partout**, y compris pour la fiche du restaurant dans l'app.

### 4. L'espace est à l'image du restaurant, et la fiche Google travaille en coulisse

**La page d'accueil de l'espace** montre ce qui rassure un client avant de commander : le **nom, le logo, les couleurs et la police** du restaurant (déjà en base ; polices dans le dépôt, ADR 0101), l'**adresse**, les **horaires**, le **téléphone**, la **note publique**. Une seule source pour chaque information : jamais saisie deux fois.

**La fiche Google n'est pas un lien visible, c'est une source de légitimité en coulisse** (précision d'Omar, 2026-11-20). Ce que la fiche apporte à l'espace, côté serveur : l'**existence vérifiable** du restaurant (nom, adresse, coordonnées concordants), ses **horaires d'ouverture** pour décider si on peut commander **maintenant**, sa **note** et ses **photos**. Conséquences voulues : (a) un espace ne s'ouvre pas pour un établissement dont l'identité **ne concorde pas** avec sa fiche ; (b) si le restaurant est fermé selon sa fiche, la page le dit au lieu d'accepter une commande que personne ne verra ; (c) un écart entre la carte de l'espace et la fiche (horaires, téléphone, adresse) remonte à Nina (§6). *(Lecture du porteur de l'ADR ; Restent ouverts 2 si Omar voulait aussi un lien visible.)*

### 5. La commande du site compte dans la fidélité, à la remise

C'est tout l'intérêt (Omar, 2026-11-20) : une commande du site **donne des points**, comme un ticket.

- **Quand** : au passage à **« retirée »**, jamais à l'envoi. « Retirée » est le geste du restaurateur quand le client est venu **et a payé au comptoir** : c'est la seule preuve qu'une vraie commande a eu lieu, sans photo de ticket. Créditer à l'envoi offrirait des points à qui enverrait de fausses commandes. Une commande annulée ou jamais retirée **ne crédite rien**. Une commande par le **secours WhatsApp** (ADR 0107 §10) n'est **pas enregistrée** : elle ne crédite rien non plus, et la page ne le promet pas.
- **Comment** : par le **même barème** que les tickets (points non convertibles en euros, ADR 0028 ; budget cadeaux par établissement, ADR 0012), calculé **côté serveur** à partir du total figé de la commande. Une commande retirée compte comme **commande directe validée** pour devenir **membre actif** (ADR 0033).
- **Où** : toujours **pas dans `orders`** (ADR 0099 §6 : les tickets restent des tickets). Un chemin de crédit **séparé** s'ajoute, qui produit le même effet côté membre. *(Le « comment » technique est à écrire dans la PR de code ; voir les Échos.)*
- **Ce que le membre voit** : ses points, comme partout. **Jamais le gain d'une commande à côté de son prix** : « 12,50 € → +N points » lui rendrait le taux de conversion que l'ADR 0028 lui cache. **Jamais un cumul d'euros dépensés**. Le prix du menu et le total de **la commande en cours** restent visibles (la page de commande les montre depuis l'ADR 0099) ; l'historique n'affiche pas de total d'euros.
- **Le risque de double compte** : un client qui commande sur le site, paie au comptoir, puis **photographie son ticket de caisse** pour le même repas gagnerait des points deux fois. Réponse retenue : à la remise, la page dit « pas besoin de photographier ton ticket » ; un ticket envoyé **peu après** une commande retirée par ce membre dans le même restaurant reçoit un **drapeau de revue** (le mécanisme `flagReasons` de `app/api/orders/route.ts` existe) au lieu d'être validé automatiquement. *(Seuil de la fenêtre à mesurer ; Restent ouverts 5.)*
- **Mise en œuvre de la tranche 2 (2026-11-23)** : les points se créditent **dans la base** (déclencheur sur `site_orders`, comme `on_order_validated_points` pour les tickets) : un crédit par commande, jamais à l'envoi, et **un échec de crédit ne bloque jamais la remise** (il se dit dans les journaux, la requête 16 des mesures le retrouve). Le double compte est gardé **dans les deux sens** : un ticket à moins de **six heures** d'une commande du site du même compte dans le même restaurant va en revue (« Commande du site récente ») ; une commande du site retirée à moins de six heures d'un ticket **déjà validé** du même compte est enregistrée à **0 point** (une ligne à zéro, définitive, pour que la mesure la voie ; jamais montrée au membre). **Fuite connue** : si le restaurateur valide quand même le ticket signalé, le client gagne deux fois ; la requête 16 bis des mesures la compte (la fonction des tickets n'est pas modifiée). Commander **rejoint** le restaurant (l'appartenance seule : ni parrainage, ni attribution à un serveur, ni équipe). **Pas encore** : le chiffre d'affaires du programme (budget des cadeaux, ADR 0012), le score d'équipe et le statut de « membre actif » (ADR 0033) ne comptent pas encore les commandes du site, qui ne rapportent donc que leurs points. Une commande du site ne fait pas entrer d'euros dans le budget : les cadeaux échangés avec ces points restent bornés par le budget existant.

### 6. Nina s'occupe de tout l'espace, de la création aux rapports

Nina (ADR 0089, Pro) **possède** l'espace de commande, dans les limites de la brigade : **elle propose, le gérant valide, rien ne devient public sans un « Oui »** (ADR 0089 §2).

| Elle s'occupe de… | Concrètement | Le gérant… |
|---|---|---|
| **La création** | Prépare l'espace depuis ce qui existe : catalogue (ADR 0083), options (ADR 0100), identité, horaires et coordonnées de la fiche (§4). Une idée « ton espace est prêt à recevoir des commandes » (`recordIdeas`, comme les autres assistants). | valide l'ouverture |
| **La personnalisation** | Propose l'ordre des rubriques, le plat mis en avant, les textes d'accueil, les photos manquantes. | valide chaque proposition |
| **Les alertes** | Surveille le bon fonctionnement et **prévient le jour même** (voir ci-dessous). | est prévenu |
| **Les rapports d'activité** | Résumé de l'activité de l'espace (voir ci-dessous). | lit |

**Les alertes ne sont pas des idées** (ADR 0105 : les tâches quittent « Idées » ; même logique que les avis graves de l'ADR 0106) : elles arrivent dans « À faire » et par e-mail le jour même, avec ce qu'il y a à faire. Ce qui déclenche une alerte, **fondé sur ce que le code enregistre déjà** : commandes **refusées** par motif (`site_order_refusals`) au-dessus d'un seuil ; secours WhatsApp **proposé** (`secours_propose`, requête 14 de `docs/mesures/suivi-options-menu.sql`) ; commande **reçue jamais vue** ; commandes **jamais retirées** ; plats cachés parce que impossibles à commander (ADR 0099 §9) ; imprimante hors ligne (quand elle existera, ADR 0107) ; écart carte/fiche (§4).

**Le rapport d'activité** (le gérant le voit en euros : l'ADR 0007 ne protège que le client) : commandes reçues, retirées, annulées ; plats les plus commandés ; heures de pointe ; **nouveaux membres venus par l'espace** et points crédités ; délai moyen entre « reçue » et « prête » ; problèmes de la période et ce qu'il en est advenu. Cadence **hebdomadaire dans Stats** et **mensuelle par e-mail** (à valider, Restent ouverts 6).

**Ce que Nina ne fait jamais seule** : changer un prix, un allergène ou une option, ouvrir ou fermer l'espace, répondre à un client, publier quoi que ce soit.

**Mise en œuvre des alertes (tranche 3, 2026-11-23)** : cinq alertes, calculées à chaque lecture de la page « Commandes du site » (`lib/site-orders/nina-alerts.ts`, pur et testé) à partir de ce que la base enregistre déjà, sans table nouvelle : une commande « reçue » qui attend depuis **10 minutes** (le serveur ne sait pas qui l'a *vue*, il sait qu'elle n'est pas « prête »), une commande « prête » depuis **2 heures** jamais retirée ni annulée (les points du client en dépendent), des envois qui ont ouvert le secours WhatsApp (rien n'est enregistré dans ce cas), des refus de panne et des refus de carte (**3 ou plus sur 12 heures**). Rien à signaler = liste vide, jamais un « tout va bien ». Un « J'ai vu » se range sur l'appareil et ne vaut que pour la *signature* de l'alerte : si elle s'aggrave, elle revient. Les seuils sont des défauts de produit à recalibrer. **Pas encore** : l'e-mail le jour même (il demande de retenir ce qui a déjà été envoyé), l'alerte « plats cachés », l'alerte « écart carte / fiche Google » et l'imprimante hors ligne. **Pas de trace** de ce que le gérant fait d'une alerte (le « J'ai vu » n'est pas envoyé au serveur) : le seuil « plus d'un tiers jugées inutiles » reste à mesurer avec l'e-mail.

**Mise en œuvre du rapport (tranche 4, 2026-11-26)** : le rapport de la semaine suit la maquette validée (page « Rapport de la semaine » sous « Commandes du site », et non dans Stats). Il couvre les **sept derniers jours belges, aujourd'hui compris** (défaut de produit : jamais vide un lundi matin), calculés à chaque lecture (`lib/site-orders/report.ts`, pur et testé) sans table nouvelle. Les chiffres portent sur les commandes **reçues** dans la fenêtre, avec leur état du moment ; les annulées ne comptent ni dans les plats ni dans les heures de pointe. Un **nouveau membre venu par l'espace** est un compte dont l'adhésion au restaurant a été créée dans les **cinq minutes qui suivent** une de ses commandes (la route l'écrit juste après la commande) : quelqu'un entré par le QR avant de commander n'est pas compté. Un problème n'est dit **« Réglé »** que si la base le prouve (une panne suivie d'une commande passée) ; un refus de carte ou un secours WhatsApp reste **« À vérifier »**, un état que la maquette n'avait pas ; une commande restée en route est **« À régler »** (mêmes seuils que les alertes). **Pas encore** : le rapport mensuel par e-mail (la page ne l'annonce pas), les points crédités, et aucune trace de la lecture du rapport.

**Mise en œuvre de l'accueil (2026-11-26)** : en-tête (nom, logo, couleurs, police, adresse et téléphone **lus en base**), ouvert ou fermé et note Google, bloc « Commander à emporter » sur l'accueil membre (sous le bouton photo, pour qu'il reste visible : ADR 0059), version ordinateur, panier gardé à chaque changement. Restaurant fermé ou horaires inconnus : la page le dit, l'envoi est fermé, et le serveur refuse (409 `ferme` ou `horaires_inconnus`, sans secours WhatsApp). **Écart avec l'ADR 0109 §3 (« gardée côté serveur ») : la fiche n'est gardée nulle part.** Les conditions lues le 2026-11-26 l'interdisent : « Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms » (§3.2.3(b), https://cloud.google.com/terms/maps-platform/eea) et, pour Places, seules la latitude et la longitude peuvent l'être, 30 jours (§15.4, https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), l'identifiant de fiche étant libre. La fiche est donc lue à chaque visite et à chaque envoi (un appel « Place Details Enterprise » chacun) ; « lus il y a plus de 7 jours » n'a plus d'objet, et une panne de Google ferme la commande. Le texte « Google Maps » accompagne les horaires et la note. **À trancher avant d'ouvrir** : les usages permis à un client de l'Espace économique européen (https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses) citent « display information about Customer's physical stores, offices, or official service points » ; rien ne dit que les établissements de **nos** clients en font partie. **Pas encore** : la règle des jours fériés (elle vise les créneaux planifiés ; ici les horaires de la semaine de la fiche font foi, exceptions comprises), le réglage « fermer un jour » du gérant, et l'écart carte / fiche. Mesures : `docs/mesures/suivi-accueil-commande.sql`.

### 7. Ce qui ne change pas

Retrait au comptoir, **paiement au comptoir** (ni paiement en ligne ni livraison : chacun son ADR), impression sur l'imprimante du restaurant ou, à défaut, alerte sonore dans la console (ADR 0099 §10, ADR 0107). Le serveur recalcule toujours les prix : le navigateur n'en envoie jamais. Le numéro de commande, la « photo figée » des lignes, la purge du téléphone et du prénom : inchangés.

## Conséquences

- **Données personnelles** (ADR 0025). Une commande est désormais rattachée à un **compte** (nouvelle colonne, nullable pour les commandes déjà là), et sert à créditer des points. Le **prénom et le téléphone** restent purgés au bout de `SITE_ORDER_PURGE_DAYS` ; ce qui reste, c'est le **lien avec le compte** et le total figé, comme un ticket (la commande reste, la photo s'efface : ADR 0036). Les **conditions** doivent dire : qui est responsable (le restaurant ou Boosteats, à trancher avec le juriste, comme l'ADR 0025 l'exige), pour quoi (commander **et** créditer des points), combien de temps. **À valider par un juriste avant la première commande réelle.** Les **mineurs** exigent un consentement parental (ADR 0025) : le mur du compte les concerne aussi.
- **Fermer le chemin anonyme** : la route publique `POST /api/site-orders` exigera une session. Le test d'équivalence panier navigateur / panier serveur (ADR 0099 §9) reste.
- **Textes qui promettaient un site vitrine** (à corriger le jour où l'espace s'ouvre, jamais avant, car ils sont vrais aujourd'hui de la même façon qu'au §8 de l'ADR 0099) : `SiteSection`, l'article « site internet restaurant », `zenchef-ou-boosteats`, `.claude/product-marketing.md`, `lib/marketing-pages.test.ts`, la FAQ de la landing, l'ADR 0088 (statut), `CLAUDE.md`.
- **Le pilote Houba** a donné son accord (2026-11-03) pour **une vitrine** avec un bouton « Commander » qui renvoie vers un itinéraire. Il faut **lui dire que le projet a changé** avant toute ouverture.
- **Aucune migration dans cette PR.** La PR de code ajoutera la colonne « compte » de `site_orders` et le chemin de crédit, idempotents et fail-open (règles de migration du dépôt).

## Échos à suivre avant d'écrire le code

Ce qui croyait l'ancienne règle (« une commande du site n'a pas de membre, ne compte pas ») :

- **Les lectures qui supposent que `orders` est tout ce qu'un membre a acheté** : `lib/member-stats.ts`, `lib/avg-basket.ts`, `lib/health-metrics.ts`, `lib/jetons-gift.ts`, `lib/growth-game-data.ts`, `lib/agents/hugo.ts` et `chloe.ts`, `lib/marketing-space-data.ts`. Une commande retirée qui crédite des points mais n'apparaît pas dans ces lectures donnerait un panier moyen, un « membre actif » ou un score faux.
- **Les chemins qui produisent le même effet** (ADR 0065) : les validations de ticket (auto, manuelle, à la main, rattrapage), le budget cadeaux (ADR 0012, qui lit le chiffre d'affaires de l'établissement : une commande payée au comptoir est **déjà** dans la caisse, il ne faut pas la compter deux fois), la barre de progression d'un membre.
- **L'authentification** : le retour de Google dans l'app (`app/auth/callback/route.ts`) doit **ramener à la commande en cours** ; un retour sur l'accueil la ferait perdre.
- **`site_orders` et la purge** (`lib/site-orders/purge.ts`) : le lien avec le compte ne doit pas être effacé avec le prénom.
- **`CONTEXT.md`** : « Commande du site » (la phrase « jamais dans `orders` ; un point pourra être crédité plus tard » devient « crédite des points à la remise »), nouveau terme « Espace de commande », et `CLAUDE.md`.
- **Autres périodes** : le mois suivant (rapport mensuel), un **nouvel établissement** (espace prêt sans catalogue, sans options, sans fiche gérée : que montre-t-il ?).

## La trace (ADR 0065)

Le chiffre qui contredira l'ADR s'il est faux :

- **Entonnoir de la connexion** : paniers ouverts → connexion demandée → connexion réussie → commande envoyée. **Si plus de la moitié des clients à qui la connexion est demandée abandonnent**, le mur du compte est trop haut (retour au §2 : invité avec téléphone, ou connexion plus tôt/plus tard). Seuil à recalibrer avec les premières commandes réelles.
- **Part des commandes retirées** sur les reçues, par établissement : si elle est basse, les points à la remise ne seront presque jamais crédités (le restaurateur oublie « retirée », ou le client ne vient pas).
- **Doubles comptes détectés** : tickets à drapeau « commande du site récente » et ce que la revue en fait. Si la revue les valide presque tous, le drapeau est mal réglé ; si elle en refuse beaucoup, le double compte est réel.
- **Alertes de Nina** : envoyées, jugées « pas grave » par le gérant (au-dessus d'un tiers, la liste des déclencheurs est trop large, même seuil que l'ADR 0106).
- **Nouveaux membres par l'espace** : le chiffre qui dira si le lien avec le programme de fidélité apporte ce qu'on lui demande.

## Alternatives rejetées

- **Garder le site vitrine à côté** : deux chantiers pour une équipe de deux, et la vitrine ne rapporte rien tant qu'on ne mesure pas son effet sur Google. Rien n'était construit.
- **Commande en invité (prénom et téléphone)** : le plus simple pour le client, mais ni points, ni lien avec le programme, ni retour du client. C'est précisément ce que cet ADR vient chercher.
- **Créditer les points à l'envoi** : trop facile à tromper (fausses commandes pour des points). La remise est la seule preuve sans photo.
- **Faire passer la commande du site par `orders`** : mêle des commandes sans photo de ticket aux tickets, casse le raisonnement des cinq validations et les stats qui lisent `orders`. Un chemin séparé reste plus sûr à auditer.
- **Un lien « Commander » visible sur la fiche Google** comme point central : non retenu **par cet ADR** (Omar parle de légitimité en coulisse) ; reste possible comme ajout, sans toucher au reste.

## Restent ouverts

1. **Le forfait.** L'ADR 0099 §8 limite la commande à **Pro seulement** (Nina). Omar rapporte que Mehdi veut **ouvrir le site à tous les forfaits** (ADR 0107). Si c'est confirmé, deux choses à trancher : Nina pilote-t-elle l'espace **partout** ou seulement en Pro (et que devient l'espace sans elle) ? Le code (`lib/site-orders/access.ts`) exige toujours le forfait Pro.
2. **Un lien visible vers la fiche Google ?** Cet ADR lit « légitimité en backend » (§4). À confirmer avec Omar.
3. **Le reste de l'ADR 0088** : fiche Google gérée (ADR 0082, en cours avec l'ADR 0106) et rapport mensuel avec grille Google Maps (DataForSEO) : gardés, déplacés, supprimés ? Dépend de la décision sur le Pro.
4. **Le téléphone** : facultatif (proposé) ou exigé pour chaque commande ? Le restaurateur en a-t-il besoin pour joindre un client absent ?
5. **Le double compte** (§5) : taille de la fenêtre du drapeau, et qui tranche en revue (le restaurateur ou la plateforme).
6. **La cadence du rapport** (§6) : hebdomadaire dans Stats et mensuel par e-mail, ou autre.
7. **Le cadre juridique** : responsable de traitement, conditions, mineurs (ADR 0025, à valider par un juriste), et la **caisse certifiée** (ADR 0099, toujours à faire confirmer par le comptable ou le SPF Finances avant la première commande réelle).
8. ~~L'écran de connexion à maquetter~~ Fait et validé par Omar le 2026-11-20 (treize écrans : client sur téléphone et sur ordinateur, fiche du plat, panier et console de Nina). **Restent à maquetter** : la connexion sur ordinateur, et l'accueil « Aujourd'hui » du gérant avec sa section « À faire ».
