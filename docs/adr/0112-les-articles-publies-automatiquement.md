# ADR 0112 — Les articles publiés automatiquement : le restaurant active une fois, il est prévenu la veille, sans réaction l'article paraît

**Statut** : Accepté (2026-11-26) par le porteur (Omar) : règles et maquettes validées (https://claude.ai/artifact/2zLkvLGgwbVQFAXyrQy8jV) ; **Mehdi pas consulté** ; construit, **jamais exécuté sur une base ni un service réels**. **Amende l'[ADR 0111](0111-les-articles-de-blog-du-restaurant.md) §3** (« rien ne devient public sans Oui, publier ») et **fait une exception à l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md) §3** (« rien ne part sans Oui ») **pour les articles d'occasion seulement**. Les articles écrits à la main gardent « Oui, publier ».

## Contexte

- Demande d'Omar : un article à chaque promo ; pouvoir en générer un à chaque événement capté (match, concert, brocante, soleil, pluie).
- Un restaurateur qui doit approuver chaque article ne le fera pas à temps : l'occasion passe. Aucun restaurateur n'a encore été interrogé sur ce point.
- Ce qui existe : l'agenda de visit.brussels synchronisé dans `local_events` ; un lecteur de prévisions météo Google, appelé nulle part ; un lecteur de matchs qui demande la clé `BZZOIRO_API_KEY`. Les offres (ADR 0110) ne sont pas construites.
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
- Un jour manqué ne se rattrape pas.

### 3. « Prévenu » veut dire délivré

**Seul un message DÉLIVRÉ autorise la publication** (accusé du fournisseur reçu par le webhook), sans rebond ni plainte. « Envoyé » veut seulement dire accepté pour expédition. Conséquence assumée : webhook muet (déjà arrivé du 2026-10-02 au 2026-11-09) = rien ne paraît, avec la raison « L'arrivée de notre message n'a pas été confirmée ». La publication ne suppose pas que le message a été **lu**.

### 4. Dire non

- « Ne pas publier » dans l'e-mail ouvre `/e/ne-pas-publier/<jeton>` : jeton signé, valable jusqu'à l'heure de publication, qui n'autorise **que** ce refus. Sans connexion. La page affiche, **seul le bouton refuse** (les antivirus ouvrent les liens).
- Lire, modifier, publier maintenant, autre version : connexion. Une modification garde l'échéance et repasse par le contrôle. Avec une **photo**, l'article ne part pas tout seul (les droits se confirment en personne, ADR 0111 §5).

### 5. Revérifié avant de publier

Activation et type toujours cochés, espace ouvert, message délivré, occasion toujours vraie chez sa source, limites, carte lisible, contrôle des textes (ADR 0111 §7) et plats toujours en vente. Un échec : pas de publication, raison visible dans « Pas publiés ».

### 6. Le texte

Des **phrases préparées à variantes**, remplies avec les seuls faits : la source (nom, date, distance), un plat de la carte, les informations cochées par le restaurant (terrasse, sur place, écran ; **pas encore raccordées** : un article ne parle que d'emporter). **Aucune rédaction par une IA** : le contrôle ne verrait pas une invention. Les noms venus de tiers sont nettoyés et limités ; si le contrôle refuse, pas de publication. Le contrôle ne juge pas le contenu d'un nom au-delà de sa liste.

### 7. Peu, et pas deux fois

- **Un article automatique par jour au plus, trois par semaine** (lundi à dimanche). Priorité : promo, événement proche, match, météo. Ce qui est écarté est gardé avec sa raison (trois occasions au plus par type et par jour).
- Une occasion n'est proposée qu'une fois ; un événement sur plusieurs jours, une fois par mois.
- « Publier maintenant » est la décision d'une personne : les limites ne s'y appliquent pas.

### 8. La fin

L'article se retire tout seul après l'occasion (événement : minuit ; match : trois heures après le coup d'envoi ; promo : sa fin). **La lecture publique cache un article échu sans attendre la tâche.** Républié à la main après sa fin, c'est un article ordinaire, sans fin.

### 9. Les sources, et leurs conditions (lues le 2026-11-26)

| Source | Règle | État |
|---|---|---|
| Événements (agenda.brussels, visit.brussels) | concerts, festivals, fêtes, brocantes, foires à 1,5 km au plus ; copie relue depuis moins de 4 jours ; mention de la source sous l'article | construit ; **licence non vérifiée** |
| Matchs (Bzzoiro) | Pro League, coupes d'Europe, sélections suivies, 17 h à 22 h, un par jour | construit ; sans clé, aucun match ; **conditions non lues** |
| Météo (Google) | soleil : 11 h à 14 h entièrement connu, ciel dégagé, aucune pluie, probabilité ≤ 20 %, ressenti ≥ 10 °C ; pluie : un service complet avec le drapeau pluie | règle écrite, **source éteinte** |
| Promos (offres) | contrat posé | **vide** tant que l'ADR 0110 n'est pas construit |

- **Météo Google** : les conditions Maps Platform de l'Espace économique européen interdisent de créer un contenu à partir de ses données (§3.3.2 c, https://cloud.google.com/terms/maps-platform/eea) et limitent la conservation à quelques heures ou jours (§23, https://cloud.google.com/terms/maps-platform/eea/maps-service-terms, qui permet par ailleurs d'intégrer la météo à une application apportant une valeur propre). Un article écrit à partir d'une prévision puis gardé paraît interdit : **aucun appel, rien de gardé**. Rouvrir demande un avis juridique, un accord écrit ou une autre source. Mention exigée en cas d'usage : « Source: Includes weather data from Google. » (https://developers.google.com/maps/documentation/weather/policies).
- **visit.brussels** : le dépôt dit « données ouvertes » ; le texte de la licence et la mention exigée **n'ont pas pu être lus** (le portail https://data.gov.be/en/dataset/19181ead-b37f-44d8-a708-d9bddd347c3b annonçait « Open Data License Brussels » dans un résultat de recherche, la page répondait 404). **À confirmer auprès de visit.brussels avant d'activer un établissement.**
- **Distance** : calculée depuis la position du restaurant gardée en base, qui vient de sa fiche Google. Seule la distance arrondie entre dans l'article. Les conditions Google sur la conservation de cette position et son usage ici sont **à faire trancher** avec le reste (ADR 0071).

### 10. Responsabilité : ce qui change

Avec ces articles, **Boosteats compose le texte et le publie** quand personne ne réagit. Son rôle n'est plus seulement celui d'un hébergeur (ADR 0111 §7) : il se rapproche de celui d'un éditeur. Le restaurant déclare en répondre ; cette déclaration ne règle pas à elle seule le rôle de Boosteats. **À valider par un juriste avant d'activer un établissement** : rôle, clause des conditions restaurateurs, noms de tiers (événements, clubs, compétitions) dans un texte commercial, licences des sources.

## Conséquences

- Migration `20261126-2330-restaurant-posts-auto`, après `20261126-1300` (**à appliquer à la main** ; sans elle, la publication automatique est « pas encore activée » et le blog écrit à la main marche comme avant) : `restaurant_post_auto_settings`, `restaurant_post_occasions`, deux colonnes sur `restaurant_posts` (fin, mention de source), `origin = 'auto'`, nouveaux gestes tracés.
- Tâche `/api/cron/auto-articles`, toutes les heures, qui n'agit qu'à 10 h et 17 h à Bruxelles. Rejouable sans double envoi ni double publication.
- La copie plateforme des e-mails aux restaurateurs contient aussi le lien de refus.
- Le jeton est dans l'adresse de la page de refus : la mesure d'audience du site la voit. Il ne permet que de dire non, jusqu'à 10 h.
- Tant que l'espace de commande est fermé, rien ne tourne.

## Trace

Par établissement et par type : prévenus, publiés sans réaction, publiés à la main, refusés (par le lien ou la console), retirés après coup, écartés et pourquoi, lectures et appuis sur « Voir la carte ». Requêtes : `docs/mesures/suivi-articles-auto.sql`.

**Seuils proposés, après 8 semaines** : plus d'un article publié sur cinq retiré après coup, ou un refus sur trois (la publication sans accord déplaît : revenir à « Oui, publier ») ; plus d'un préavis sur dix sans message délivré (le canal ne tient pas) ; moins de 30 lectures par article d'occasion (personne ne les lit).

## Alternatives rejetées

- **Approuver chaque article** : écarté par le porteur, l'occasion passe avant la réponse.
- **Un lien qui refuse au premier chargement** : déclenché par les antivirus des boîtes mail.
- **Publier sur un message « envoyé »** : on publierait chez quelqu'un dont l'adresse est en échec.
- **Texte rédigé par une IA sans relecture** : une invention passerait le contrôle.
- **Contourner les conditions météo** (garder seulement « pluie ») : le contenu resterait créé à partir de la donnée interdite.

## Restent ouverts

1. Cadre juridique (§10) et licences (§9).
2. Une source météo utilisable, ou un accord avec Google.
3. Raccorder « Ce que tu proposes » (`lib/restaurant-posts/auto/offerings.ts`) et les offres (`sources/promos.ts`).
4. Mehdi : pas consulté.
