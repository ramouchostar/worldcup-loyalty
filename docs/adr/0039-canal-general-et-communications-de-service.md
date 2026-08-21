# ADR 0039 — Canal général, et deux régimes de message

**Statut** : Accepté (2026-08-21). Amende l'**ADR 0014 §broadcast** (ciblage par équipe) et précise l'**ADR 0025 §3** (bases légales). Complète l'**ADR 0034** — même défaut, côté sortant. Ne change rien à l'**ADR 0009** (notifications automatiques) ni à leur enveloppe anti-spam.

## Contexte

Deux constats, le même jour, sur le même établissement.

**1. « Tous » ne voulait pas dire tous.** `sendBroadcast` résolvait la cible en identifiants d'équipe, puis sélectionnait `memberships.team_id IN (…)`. L'option « toutes les équipes » ne touchait donc que les membres qui en avaient une. À Kraainem le 21/08/2026 : **13 membres sur 16 sans équipe**. Un envoi « à tous » partait à 3 personnes avant le filtre de consentement, et à **1** après.

C'est exactement le défaut de l'ADR 0034, retourné : là, une configuration sociale absente coupait l'entrée des tickets ; ici, elle coupe la sortie des messages. Le restaurateur croyait parler à ses clients ; il parlait à une personne.

**2. Le consentement marketing bloquait des messages qui n'en sont pas.** Le filtre `marketing_push` s'appliquait à tout, y compris à « ton ticket du 18 n'est pas passé, c'est réparé ». Or ce message n'est pas une publicité : c'est l'exécution du programme auquel le membre a adhéré. Le lui refuser parce qu'il n'a pas coché une case publicitaire, c'est se taire au mauvais moment — et ce n'est demandé par aucun texte.

La demande initiale était de **faire porter le consentement marketing par l'acceptation de la politique de confidentialité**. Ce chemin est fermé : le RGPD exige un consentement **spécifique, séparé et non groupé** (art. 4.11 et 7.2) ; un consentement empaqueté dans l'acceptation d'un document général est nul, et une politique de confidentialité est un document d'**information** (art. 13), pas un véhicule de consentement. L'APD sanctionne précisément ce montage.

Mais l'intuition derrière la demande est juste : **la plus grande partie de ces messages n'est pas du marketing**. C'est cette distinction-là qu'on formalise, et elle donne le même résultat pratique — presque tout le monde devient joignable — sans montage fragile.

## Décision

### 1. « Tous les membres » = tous les membres de l'établissement

`resolveAudience` sélectionne par `restaurant_id`, sans passer par les équipes. Les ciblages **par équipe** et **par type** restent bornés aux équipes : c'est leur objet (ADR 0014). Seul le canal général change de sens — et il retrouve celui que son libellé annonçait.

### 2. Deux natures de message, deux bases légales

| Nature | Contenu | Base légale | Public |
|---|---|---|---|
| `service` | cadeau prêt, ticket non passé, incident, changement de règle | **exécution du contrat** (art. 6.1.b) | tous les membres visés |
| `promo` | offre commerciale, promotion du jour | **consentement** (art. 6.1.a) | membres ayant accepté les offres |

Le défaut reste `promo` — le plus restrictif des deux, et le comportement historique. Une information de service n'est pas un contournement du consentement : elle ne vend rien, elle exécute. Le jour où un message « de service » vante un plat, il est devenu une promo, et la case redevient exigible.

### 3. Deux enveloppes anti-spam distinctes

`admin_service` et `admin_broadcast` sont deux `trigger_type` séparés dans `notification_log`, chacun plafonné à 2 par semaine et par membre. Une promo ne consomme pas le droit d'informer ; une information n'ouvre pas un second quota de promos. Sans cette séparation, la nature `service` deviendrait mécaniquement une façon de doubler la fréquence publicitaire.

### 4. La politique de confidentialité dit les deux régimes

Elle distingue désormais les informations liées au programme (contrat) des offres commerciales (consentement), et écrit noir sur blanc que **l'accepter ne vaut pas accord pour les offres** — la case reste séparée, décochable à tout moment sans rien perdre du programme. C'est la moitié légitime de la demande initiale : informer dans la politique, oui ; y enfouir un consentement, non.

## Conséquences

- À Kraainem, un message de service passe de **1 destinataire à 16**. Les canaux réels restent inégaux (4 abonnements push, 1 numéro consenti) : les autres le liront **in-app** à leur prochaine ouverture — ce qui reste très supérieur à rien.
- Le restaurateur doit choisir la nature à chaque envoi. C'est délibéré : ce choix est une déclaration, et elle l'engage.
- Le code tolère l'absence de la migration (fail-open) : sans elle, un message de service est journalisé en `admin_broadcast` et une annonce programmée repart en `promo`.
- Reste ouvert : le taux d'ouverture in-app n'est pas mesuré. Tant qu'il ne l'est pas, « envoyé » ne veut pas dire « lu ».

## Alternatives rejetées

**Faire porter le consentement par la politique de confidentialité.** Consentement groupé, donc nul (art. 4.11, 7.2) — et le risque n'est pas théorique : c'est le grief le plus courant dans les décisions de l'APD sur le marketing direct.

**Supprimer le filtre de consentement.** Reviendrait à traiter les promos comme des messages de service. C'est la même faute, sans le paravent du document.

**Un opt-out plutôt qu'un opt-in pour les promos.** Défendable en théorie sur la base du « soft opt-in » client existant, mais fragile pour du push, et incompatible avec l'opt-in déjà recueilli chez les membres actuels — on ne rétrograde pas un consentement obtenu.
