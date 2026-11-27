# ADR 0112 — Les articles publiés automatiquement : le restaurant active une fois, il est prévenu la veille, sans réaction l'article paraît

**Statut** : Accepté (2026-11-26) par le porteur (Omar) : règles et maquettes validées (https://claude.ai/artifact/2zLkvLGgwbVQFAXyrQy8jV) ; **Mehdi pas consulté** ; construit, **jamais exécuté sur une base ni un service réels**. **Complété le 2026-11-27** : les promos sont raccordées aux offres de l'[ADR 0110](0110-les-offres-sur-la-page-de-commande.md) (§11). **Précisé le 2026-11-27** : la météo vient de MET Norway (choix du porteur, prévenu de la mention de source, de l'absence de probabilité de pluie pour la Belgique et de l'acceptation des conditions qui lui revient) ; source **éteinte** tant qu'il ne les a pas acceptées. **Amende l'[ADR 0111](0111-les-articles-de-blog-du-restaurant.md) §3** (« rien ne devient public sans Oui, publier ») et **fait une exception à l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md) §3** (« rien ne part sans Oui ») **pour les articles d'occasion seulement**. Les articles écrits à la main gardent « Oui, publier ».

## Contexte

- Demande d'Omar : un article à chaque promo ; pouvoir en générer un à chaque événement capté (match, concert, brocante, soleil, pluie).
- Un restaurateur qui doit approuver chaque article ne le fera pas à temps : l'occasion passe. Aucun restaurateur n'a encore été interrogé sur ce point.
- Ce qui existe : l'agenda de visit.brussels synchronisé dans `local_events` ; un lecteur de prévisions météo Google, appelé nulle part (**écarté**, §9) ; un lecteur de matchs qui demande la clé `BZZOIRO_API_KEY`. Les offres (ADR 0110) ne sont pas construites.
- Rien de tout cela n'a été vérifié en production.

## Décision

### 1. Éteinte, puis activée une fois

- Un **gérant ou un manager** active, en cochant : « J'accepte que ces articles soient publiés au nom de mon restaurant sans mon accord un par un. J'en réponds. » Qui, quand et la version de la phrase sont gardés. Changer la phrase suspend les activations jusqu'à une nouvelle acceptation.
- Il choisit les types d'occasion. Une source indisponible ne se coche pas, et l'écran le dit.
- Il arrête à tout moment : rien de ce qui attendait ne paraît ; ce qui est en ligne reste.
- Rien ne tourne sans **espace de commande ouvert** (drapeau et forfait) **et** activation.
- Le compte qui a accepté supprimé : la publication s'arrête.

### 2. La veille à 17 h, le jour même à 10 h

- À 17 h (Bruxelles), la tâche prépare les trois prochains jours et **prévient pour demain** : e-mail (clé `article_auto_preavis`, journal `message_sends`) à la personne qui a activé si elle est toujours gérante ou manager, sinon au propriétaire ; notification de la console si elle est activée.
- À 10 h le jour de l'occasion, l'article paraît si personne n'a rien dit.
- Une heure avant ces deux passages, à une minute décalée, la tâche `auto-articles-weather` demande les prévisions et les met en réserve (§9) : les passages de 10 h et 17 h ne font aucune demande à l'extérieur pour la météo.
- Un jour manqué ne se rattrape pas.

### 3. « Prévenu » veut dire délivré

**Seul un message DÉLIVRÉ autorise la publication** (accusé du fournisseur reçu par le webhook), sans rebond ni plainte. « Envoyé » veut seulement dire accepté pour expédition. Conséquence assumée : webhook muet (déjà arrivé du 2026-10-02 au 2026-11-09) = rien ne paraît, avec la raison « L'arrivée de notre message n'a pas été confirmée ». La publication ne suppose pas que le message a été **lu**.

### 4. Dire non

- « Ne pas publier » dans l'e-mail ouvre `/e/ne-pas-publier/<jeton>` : jeton signé, valable jusqu'à l'heure de publication, qui n'autorise **que** ce refus. Sans connexion. La page affiche, **seul le bouton refuse** (les antivirus ouvrent les liens).
- Lire, modifier, publier maintenant, autre version : connexion. Une modification garde l'échéance et repasse par le contrôle. Avec une **photo**, l'article ne part pas tout seul (les droits se confirment en personne, ADR 0111 §5).

### 5. Revérifié avant de publier

Activation et type toujours cochés, espace ouvert, message délivré, occasion toujours vraie chez sa source, limites, carte lisible, contrôle des textes (ADR 0111 §7) et plats toujours en vente. Un échec : pas de publication, raison visible dans « Pas publiés ».

**Les horaires** (ajouté le 2026-11-27, demandé par le porteur) : un article n'invite pas à commander quand la page refuserait la commande. La règle est **celle de la page** (ADR 0109 §3 amendé : fermetures saisies, horaires choisis, fiche Google lue à l'instant, repli). Il faut le restaurant ouvert à un instant au moins du moment dont parle l'article : de 10 h au coup d'envoi (match), pendant le service annoncé (météo), de 10 h à minuit (événement, promo). Vérifié à la préparation (un jour fermé ne prend la place d'aucun autre), au préavis, à la publication et à « Publier maintenant ». Horaires inconnus ou illisibles : pas de publication ; « Publier maintenant » laisse alors l'article en attente. Un horaire corrigé avant le préavis repropose l'occasion.

**Ce que tu proposes** : si une case dont parle un texte non modifié a été décochée depuis le préavis, il ne paraît pas. Une case cochée depuis ne change rien.

### 6. Le texte

Des **phrases préparées à variantes**, remplies avec les seuls faits : la source (nom, date, distance), un plat de la carte, les informations cochées par le restaurant sur « Infos de ma page » (terrasse, sur place, écran ; sans elles, un article ne parle que d'emporter). **Aucune rédaction par une IA** : le contrôle ne verrait pas une invention. Les noms venus de tiers sont nettoyés et limités ; si le contrôle refuse, pas de publication. Le contrôle ne juge pas le contenu d'un nom au-delà de sa liste.

### 7. Peu, et pas deux fois

- **Un article automatique par jour au plus, trois par semaine** (lundi à dimanche). Priorité : promo, événement proche, match, météo. Ce qui est écarté est gardé avec sa raison (trois occasions au plus par type et par jour). La **météo** n'est préparée que pour le **lendemain** : une occasion au plus par jour, servie après toutes les autres.
- Une occasion n'est proposée qu'une fois ; un événement sur plusieurs jours, une fois par mois.
- « Publier maintenant » est la décision d'une personne : les limites ne s'y appliquent pas.

### 8. La fin

L'article se retire tout seul après l'occasion (événement : minuit ; match : trois heures après le coup d'envoi ; météo : fin du service annoncé, 14 h ou 22 h ; promo : sa fin). **La lecture publique cache un article échu sans attendre la tâche.** Républié à la main après sa fin, c'est un article ordinaire, sans fin.

### 9. Les sources, et leurs conditions (lues les 2026-11-26 et 27)

| Source | Règle | État |
|---|---|---|
| Événements (agenda.brussels, visit.brussels) | concerts, festivals, fêtes, brocantes, foires à 1,5 km au plus ; copie relue depuis moins de 4 jours ; mention de la source sous l'article | construit ; **licence non vérifiée** |
| Matchs (Bzzoiro) | Pro League, coupes d'Europe, sélections suivies, 17 h à 22 h, un par jour | construit ; sans clé, aucun match ; **conditions non lues** |
| Météo (MET Norway) | pluie : un service entier (midi d'abord, sinon soir) avec au moins 2 mm, sur au moins 2 heures à 0,2 mm, et au moins 3 °C ; soleil : à 11 h, 12 h et 13 h, au plus 25 % de nuages, aucune pluie et au moins 12 °C | construit, **éteint** tant que `MET_NORWAY_USER_AGENT` est vide ou que la réserve manque |
| Promos (offres) | les offres publiées de la page de commande (ADR 0110), un article par offre (§11) | construit ; sans la migration `20261127-1400`, la case ne se coche pas |

- **Google écarté** : les conditions Maps Platform de l'Espace économique européen interdisent de créer un contenu à partir de ses données (§3.3.2 c, https://cloud.google.com/terms/maps-platform/eea) et ne permettent de les garder que brièvement (§23, https://cloud.google.com/terms/maps-platform/eea/maps-service-terms). Un article écrit à partir d'une prévision puis gardé paraît interdit.
- **MET Norway** (Locationforecast 2.0, format « compact ») : données sous NLOD 2.0 et CC BY 4.0 (https://api.met.no/doc/License). CC BY 4.0 permet l'usage « for any purpose, even commercially » (https://creativecommons.org/licenses/by/4.0/) ; les pages de MET Norway, elles, ne disent rien en toutes lettres de l'usage commercial. Mention exigée : le crédit, un lien vers la licence et l'indication des changements. Elle est écrite sous l'article et dans l'e-mail de la veille : « Texte composé par Boosteats d'après les prévisions de MET Norway, résumées en quelques phrases. Licence CC BY 4.0. »
- **Conditions d'usage** (https://api.met.no/doc/TermsOfService, révision 2026-11-05) : elles doivent être lues et acceptées **par une personne** ; identification par un nom d'application et un contact (`MET_NORWAY_USER_AGENT`, **aucune valeur par défaut**, sans elle aucune demande) ; réponses gardées, pas de nouvelle demande avant « Expires » ni moins de 3 heures après la précédente (hors pays nordiques, https://api.met.no/weatherapi/locationforecast/2.0/documentation) ; « If-Modified-Since » ; 4 décimales au plus (ici 2) ; pas de trafic à l'heure pile (tâche à la minute 23, décalage au hasard) ; depuis le serveur ; suspension après 429 ou 403 ; aucune garantie de service.
- **Ce que la documentation annonce pour la Belgique** (zone « reste du monde », https://api.met.no/doc/locationforecast/datamodel) : température et nuages à chaque instant ; pluie heure par heure sur le **court terme seulement**, puis par tranches de 6 heures ; maximum et minimum sur 6 heures ; **pas de probabilité de pluie**, pas de température ressentie. La durée du court terme pour cette zone n'est pas écrite ; **non vérifié sur une vraie réponse** (aucun appel avant l'acceptation des conditions). La règle ne lit que les heures détaillées, pour le lendemain.
- **Ce qui part vers MET Norway** : la latitude et la longitude du restaurant à environ 1 km et la chaîne d'identification. Rien sur un membre ni un client. La position vient aujourd'hui de la fiche Google (ci-dessous).
- **Fiche Google pour les horaires** : lue seulement pour un établissement qui montre les horaires de Google, quand une occasion est à préparer, annoncer ou publier ; une lecture par établissement et par passage, **un appel « Place Details » de plus** à chaque fois. Rien de la fiche n'est gardé : seulement le motif (« fermé à ce moment-là »). Cet usage s'ajoute au point juridique déjà ouvert sur les usages permis dans l'Espace économique européen (ADR 0109 §3) : **à trancher avant d'activer**.
- **visit.brussels** : le dépôt dit « données ouvertes » ; le texte de la licence et la mention exigée **n'ont pas pu être lus** (le portail https://data.gov.be/en/dataset/19181ead-b37f-44d8-a708-d9bddd347c3b annonçait « Open Data License Brussels » dans un résultat de recherche, la page répondait 404). **À confirmer auprès de visit.brussels avant d'activer un établissement.**
- **Distance** : calculée depuis la position du restaurant gardée en base (`restaurants.lat/lng`), reprise de sa fiche Google (à l'inscription, `lib/partner-signup.ts`, et `scripts/backfill-restaurant-location.mjs`). Les mêmes conditions (§15.4, Places API) ne permettent de la garder que **30 jours consécutifs** ; la base la garde sans limite, **constat antérieur à cet ADR**. La distance arrondie entre dans l'article. **À régler avant d'activer un établissement** : position saisie ou confirmée par le restaurant, ou venue d'une autre source.

### 10. Responsabilité : ce qui change

Avec ces articles, **Boosteats compose le texte et le publie** quand personne ne réagit. Son rôle n'est plus seulement celui d'un hébergeur (ADR 0111 §7) : il se rapproche de celui d'un éditeur. Le restaurant déclare en répondre ; cette déclaration ne règle pas à elle seule le rôle de Boosteats. **À valider par un juriste avant d'activer un établissement** : rôle, clause des conditions restaurateurs, noms de tiers (événements, clubs, compétitions) dans un texte commercial, licences des sources.

### 11. Les promos (ajouté le 2026-11-27, demandé par le porteur : un article à chaque promo)

- Une offre publiée donne **une occasion, une seule**, un jour où elle vaut (jours de semaine compris). Premier jour déjà passé au préavis : un jour suivant encore valable. Sans place dans les trois prochains jours, elle n'est pas écartée tant qu'il lui reste des jours plus tard.
- **Pas d'article** pour une offre d'un seul jour publiée après 17 h la veille, ni pour un titre que le contrôle des textes refuse (un prix, une promesse de santé ou d'allergène). Le contrôle n'est pas assoupli ; l'écartement et sa raison sont dans « Pas publiés ».
- **Revérifié** à la préparation, au préavis, à 10 h et à « Publier maintenant » : offre publiée, valable ce jour, même titre, mêmes dates et jours, même plat, plat commandable. « Publier maintenant » demande en plus qu'elle vaille **aujourd'hui** ; sinon l'article reste en attente.
- **Le texte ne promet pas plus que la page** : il cite le titre, dit les dates et les jours, que la remise se demande au comptoir et que les prix en ligne ne changent pas. Il ne recopie pas les conditions : il dit qu'il y en a. Le plat montré est celui de l'offre, ou aucun.
- **L'article suit l'offre** : arrêtée, il est retiré aussitôt, publié compris ; arrêtée, finie, plat masqué ou offres illisibles, la lecture publique le cache sans attendre. Il ne se republie pas, à la main non plus.
- Un restaurant qui avait activé avant : « Mes promos » devient cochable, **rien ne se coche tout seul** ; la phrase acceptée ne change pas.

## Conséquences

- Migration `20261126-2330-restaurant-posts-auto`, après `20261126-1300` (**à appliquer à la main** ; sans elle, la publication automatique est « pas encore activée » et le blog écrit à la main marche comme avant) : `restaurant_post_auto_settings`, `restaurant_post_occasions`, deux colonnes sur `restaurant_posts` (fin, mention de source), `origin = 'auto'`, nouveaux gestes tracés.
- Tâche `/api/cron/auto-articles`, toutes les heures, qui n'agit qu'à 10 h et 17 h à Bruxelles. Rejouable sans double envoi ni double publication.
- Tâche `/api/cron/auto-articles-weather`, à la minute 23, qui n'agit qu'à 9 h et 16 h. Migration `20261127-0930-weather-forecast-cache` (réserve des prévisions, à passer après les deux autres ; sans elle la météo reste éteinte).
- Une réserve non remplie (tâche manquée, panne) = pas d'article météo et pas de publication, avec la raison « La prévision n'a pas pu être vérifiée ».
- Pendant un passage, des horaires illisibles écartent l'occasion : pas de nouvel essai pour le même jour.
- La copie plateforme des e-mails aux restaurateurs contient aussi le lien de refus.
- Le jeton est dans l'adresse de la page de refus : la mesure d'audience du site la voit. Il ne permet que de dire non, jusqu'à 10 h.
- Tant que l'espace de commande est fermé, rien ne tourne.

## Trace

Par établissement et par type : prévenus, publiés sans réaction, publiés à la main, refusés (par le lien ou la console), retirés après coup, écartés et pourquoi, lectures et appuis sur « Voir la carte ». Requêtes : `docs/mesures/suivi-articles-auto.sql`.

**Seuils proposés, après 8 semaines** : plus d'un article publié sur cinq retiré après coup, ou un refus sur trois (la publication sans accord déplaît : revenir à « Oui, publier ») ; plus d'une occasion sur dix écartée pour des horaires inconnus ou illisibles (les horaires ne sont pas assez renseignés) ; plus d'un préavis sur dix sans message délivré (le canal ne tient pas) ; moins de 30 lectures par article d'occasion (personne ne les lit). Météo : plus d'un préavis sur trois écarté pour « La prévision a changé » (la règle ou l'horizon ne tiennent pas) ; toute ligne en panne dans la réserve.

## Alternatives rejetées

- **Approuver chaque article** : écarté par le porteur, l'occasion passe avant la réponse.
- **Un lien qui refuse au premier chargement** : déclenché par les antivirus des boîtes mail.
- **Publier sur un message « envoyé »** : on publierait chez quelqu'un dont l'adresse est en échec.
- **Texte rédigé par une IA sans relecture** : une invention passerait le contrôle.
- **Contourner les conditions de Google** (garder seulement « pluie ») : le contenu resterait créé à partir de la donnée interdite.
- **Deviner la pluie d'un service à partir d'une tranche de 6 heures** : elle déborde du service, on annoncerait ce que la donnée ne dit pas.
- **Demander la prévision au passage de 10 h et de 17 h** : trafic à l'heure pile, contraire à leurs conditions.

## Restent ouverts

1. Cadre juridique (§10) et licences (§9).
2. Météo : le porteur lit et accepte les conditions de MET Norway, puis choisit l'identification ; première semaine à comparer au temps réellement observé avant de croire les seuils.
3. ~~Raccorder les offres.~~ Fait le 2026-11-27 (§11). À décider : que faire des offres dont le titre cite un prix.
4. Mehdi : pas consulté.
