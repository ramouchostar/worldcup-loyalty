# Product Marketing Context — Boosteats

**Document version:** v1
**Last updated:** 2026-11-01

> Fiche de base lue par tous les skills marketing (texte, offre, prospection, landing).
> Elle résume et **ne remplace pas** les décisions : [ADR 0074](../docs/adr/0074-boosteats-outil-marketing-pas-outil-d-exploitation.md)
> (positionnement), [ADR 0081](../docs/adr/0081-le-jeu-de-la-croissance.md) (jeu de la croissance, frais Pub),
> [ADR 0086](../docs/adr/0086-pub-le-process-deux-validations-le-reste-automatique.md) (Pub),
> [docs/strategie/](../docs/strategie/) (positionnement, prospection Bruxelles). En cas de désaccord, l'ADR gagne.
>
> **Dépôt public** : jamais de nom de gérant, de coordonnée, de chiffre d'un client ou de condition
> négociée ici. Les preuves chiffrées se citent depuis la base, avec l'accord du restaurant.

## Product Overview

**One-liner :** Boosteats fait revenir vos clients et en fait venir de nouveaux. Rien à brancher : le ticket de caisse suffit. Et chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez.

**What it does :** Le client prend son ticket en photo avec son téléphone et gagne des points ; il choisit son cadeau au catalogue. Le restaurateur récupère ainsi une liste de clients joignables, leur envoie des messages, lance une pub dans son quartier sur Facebook et Instagram, et suit son chiffre d'affaires du jour et ce que lui coûte chaque plat.

**Product category :** fidélité et marketing local pour restaurants (le restaurateur cherche « carte de fidélité », « programme de fidélité », « pub Facebook restaurant », « faire revenir mes clients »).

**Product type :** application web (pas d'app à installer, ni pour le client ni pour le restaurateur) + services gérés (pub de quartier, prestataires vidéo/photo).

**Business model :** abonnement mensuel par établissement, **en commençant par le plan Gratuit** ; frais de service sur le budget pub, dégressifs selon le plan.

| Plan | Prix (HTVA, par établissement) | Pour qui | Frais sur la pub |
|---|---|---|---|
| **Gratuit** | 0 €, pour toujours, sans carte bancaire | Celui qui veut commencer à inscrire ses clients | 20 % du budget |
| **Croissance** | 150 €/mois, sans engagement | Celui qui veut suivre ses chiffres et relancer lui-même | 15 % du budget |
| **Pro** | 500 €/mois, 3 mois minimum puis au mois | Celui qui veut qu'on s'en occupe | 5 % du budget |

Contenu réellement livré par plan : voir « Ce que contient chaque plan » plus bas. **Croissance à
150 €/mois** (décision du porteur, 2026-11-01), aligné sur la landing (`PlansSection.tsx` : « 150 €, c'est
environ 16 tickets de plus dans le mois ») et dans `docs/strategie/positionnement.md`.

### Ce que contient chaque plan (livré au 2026-11-01)

**Gratuit — « Inscrivez vos clients »**
- QR code et affiches prêts à imprimer, QR personnel pour chaque employé en salle
- Photo du ticket de caisse lue toute seule, rien à brancher (jusqu'à 500 tickets/mois ; au-delà le client n'est jamais bloqué)
- Points (10 par euro) et catalogue de cadeaux **calculé sur le prix de revient** des plats, au taux choisi par le restaurateur (4 à 12 %)
- Cadeau de bienvenue au premier ticket, parrainage par lien WhatsApp
- La liste des clients inscrits, qui reste au restaurant
- Annonces envoyées aux clients (à la main)
- Menu & coûts (prix de vente et prix de revient ligne par ligne), CA du jour noté en un écran
- Pub de quartier sur demande (frais 20 %)

**Croissance — « Suivez vos chiffres »** = Gratuit, plus :
- Tickets illimités
- Suivi du chiffre d'affaires : jour par jour, comparé aux mêmes jours, **part du CA venue des clients du programme**
- Ventes par plat, prévisions de fréquentation, opportunités, annonces programmées, baromètre avancé
- Pub de quartier à 15 % de frais

**Pro — « On s'en occupe »** = Croissance, plus :
- Repères anonymes face aux restaurants du secteur
- Pub de quartier à 5 % de frais
- Accompagnement humain : fiche Google tenue à jour (sur invitation), rapport et point mensuels — **livré en partie à la main**, à dire tel quel

**Pas encore livré — ne jamais présenter comme disponible** (ADR 0070 §Conséquences) : copilote du
lundi, centre des avis Google avec réponses proposées, relance automatique au rythme de chaque client,
site de commande partenaire, référencement. Si on en parle : « en préparation », jamais au présent.

## Target Audience

**Target companies :** restaurants **indépendants de Bruxelles**, 1 à 5 établissements, restauration rapide, à emporter et petits restaurants de quartier (burger, poulet, pizza, snack, kebab, bowl, boulangerie-snack). Ticket moyen ≈ 10–25 €, clientèle qui peut revenir chaque semaine.

**Decision-makers :** le **propriétaire-gérant**, présent en salle, qui décide seul et paie de sa poche. Pas d'équipe marketing, pas de service informatique.

**Primary use case :** remplir les jours creux en faisant revenir les clients qui sont déjà venus, et faire connaître le restaurant aux gens du quartier.

**Jobs to be done :**
- « Faire revenir les gens qui sont déjà passés une fois » (faire revenir)
- « Que le quartier sache qu'on existe et qu'on a une promo » (faire venir)
- « Savoir où j'en suis : combien j'ai fait aujourd'hui, ce que me coûte chaque plat » (garder la main)

**Use cases :**
- Un mardi soir creux → message aux clients inscrits avec une offre valable le soir même
- Nouveau plat ou promo → pub dans un rayon de 3 km pendant deux semaines, avec un mot clé à dire au comptoir
- Ouverture récente → constituer une base de clients dès le premier mois
- Le gérant veut arrêter une carte à tampons qui coûte sans qu'il sache combien

## Personas

| Persona | Cares about | Challenge | Value we promise |
|---|---|---|---|
| **Le propriétaire-gérant** (décideur et payeur) | Son CA du jour, ses marges, ne pas perdre de temps | Ne sait pas qui revient, subit les jours creux, se méfie des « solutions » qui coûtent sans rapporter | Plus de clients qui reviennent, une pub de quartier faite pour lui, des cadeaux dont il connaît le coût exact |
| **L'équipe en salle** (utilisateurs, pas acheteurs) | Ne pas ralentir le service | Une étape de plus au comptoir | Une phrase à dire et un QR à montrer ; rien à saisir dans la caisse |
| **Le comptable / associé** (influence) | Ce que ça coûte vraiment | Abonnements empilés | Gratuit pour commencer ; coût des cadeaux plafonné par un taux choisi |

## Problems & Pain Points

**Core problem :** les clients repartent et le restaurateur ne sait pas s'ils reviendront ; il ne peut ni les recontacter ni attirer les gens du quartier sans y passer ses soirées.

**Why alternatives fall short :**
- **Carte à tampons papier** : pas de contact client, aucune idée de ce qu'elle coûte, facile à tricher.
- **Fidélité branchée sur la caisse** (Joyn, Zerosix, Leat, Piggy) : dépend du logiciel de caisse, installation, abonnement, et des cadeaux fixés sans lien avec le prix de revient.
- **Plateformes de livraison** : elles amènent des commandes mais gardent le client et prennent une commission.
- **Pub Facebook faite soi-même** : compliqué, argent dépensé sans savoir ce que ça a donné.
- **Agence marketing** : chère, pensée pour les grosses enseignes.

**What it costs them :** des jours creux qui ne se remplissent pas, des cadeaux qui mangent la marge, du budget pub dépensé à l'aveugle, des commissions de plateformes.

**Emotional tension :** « je bosse tout le temps et je ne sais pas si ça avance » ; méfiance envers les commerciaux qui promettent de « faire exploser les ventes ».

## Competitive Landscape

**Direct :** Joyn (leader belge de la carte de fidélité digitale) — branché caisse/terminal, centré sur la carte, pas sur la relance ni la pub. Zerosix (49 €/mois + mise en service) — dépend de l'intégration caisse.
**Secondary :** Malou, Partoo (avis et réseaux sociaux) — pas de base clients, pas de fidélité. Agences et freelances pub — pas de suivi au comptoir.
**Indirect :** carte à tampons papier, Uber Eats / Deliveroo / Takeaway, ne rien faire (« le bouche-à-oreille suffit »).

Prix et chiffres concurrents à **revérifier avant de les citer** à un prospect (relevés fin septembre 2026, `docs/strategie/positionnement.md`).

## Differentiation

**Key differentiators :**
- **Rien à brancher : le ticket de caisse suffit.** Le client prend son ticket en photo, il est lu tout seul. Votre caisse ne change pas, on démarre en un jour.
- **Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez** (4 à 12 %). À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats. Le coût total est en plus plafonné chaque mois.
- **Faire revenir + faire venir au même endroit** : la liste des clients sert aux messages, et la pub de quartier est montée pour vous (estimation avant de payer, repère 10–15 €/jour, offre et mot clé à dire au comptoir).
- **Vos chiffres** : CA du jour noté en un écran, coût de chaque plat, part du CA qui vient des clients du programme.

**How we do it differently :** on part du ticket (qui existe déjà dans tous les restaurants) au lieu de la caisse, et du prix de revient au lieu d'un cadeau fixé au hasard.

**Why that's better :** pas d'installation, pas de dépendance au fournisseur de caisse, et une fidélité dont le coût est connu d'avance.

**Why customers choose us :** à confirmer par entretiens (voir Learnings) — hypothèse : « gratuit pour commencer », « je sais ce que ça me coûte », « vous faites la pub pour moi ».

## Objections

| Objection | Response |
|---|---|
| « J'ai déjà une carte à tampons / Joyn » | « Gardez-la si vous voulez. La différence : vous récupérez le contact de vos clients et vous pouvez les relancer. » |
| « Pas le temps » | « Rien à installer, ça marche avec votre caisse. On pose l'affiche et le QR, votre équipe dit une phrase. » |
| « Ça va me coûter combien en cadeaux ? » | « Ce que vous décidez : vous choisissez un taux entre 4 et 12 %, chaque cadeau est calculé sur son prix de revient, et le total est plafonné chaque mois. » |
| « Ça coûte combien ? » | « Rien pour commencer. Vous passez à un plan payant seulement si vous voulez suivre vos chiffres ou qu'on s'occupe de la pub. » |
| « Mes clients ne vont pas s'inscrire » | « On le mesure : au bout d'un mois vous voyez combien se sont inscrits et combien sont revenus. » |
| « La pub Facebook, j'ai déjà essayé, ça marche pas » | « On vous montre une estimation avant de payer, on met une offre et un mot clé à dire au comptoir : vous voyez qui vient grâce à la pub. » |
| « Uber Eats m'apporte mes clients » | « Il vous les loue. Ceux qui reviennent au comptoir, c'est 0 % de commission. » |

**Anti-persona :** grandes chaînes (exigent l'intégration caisse et un service achat), restaurants gastronomiques (la réservation est leur outil), établissements sans ticket imprimé, gérant absent qui délègue tout à une équipe qui tourne.

## Switching Dynamics

**Push :** jours creux, carte à tampons qui ne dit rien, pub dépensée à l'aveugle, commissions des plateformes.
**Pull :** gratuit pour commencer, rien à installer, cadeaux au coût maîtrisé, pub de quartier faite pour lui.
**Habit :** « le bouche-à-oreille suffit », la carte papier que les habitués connaissent, pas envie d'une appli de plus.
**Anxiety :** que l'équipe ne suive pas, que les cadeaux coûtent trop, être lié par un contrat, perdre du temps au comptoir.

## Customer Language

**How they describe the problem :** *à collecter mot pour mot pendant les visites (voir Learnings).* Pistes déjà entendues :
- « Une fidélité efficace, il faut que ce soit branché sur la caisse » (entrepreneur du secteur, ADR 0074)
- « Tu fais 350 € par jour, on vise 450 € » — le restaurateur pense en CA du jour (ADR 0081)

**How they describe us :** *à collecter.*

**Words to use :** clients, revenir, quartier, ticket, caisse, cadeau, CA du jour, prix de revient, marge, pub, Facebook et Instagram, gratuit, sans engagement, « en un écran ».
**Words to avoid :** « SEO » (dire « référencement »), « attribution » (dire « savoir d'où viennent vos clients »), « CRM », « segments », « automatique / instantané » côté client, « scanner » le ticket (dire « prendre en photo »), « grâce à nous », tout pourcentage de hausse promis, « faire exploser vos ventes », « réseau de clients » (faux aujourd'hui, et on ne met jamais de concurrent devant son client).

**Glossary :**
| Term | Meaning |
|---|---|
| Points | 10 par euro dépensé, crédités au client ; jamais convertibles en euros |
| Taux cadeaux | Part du CA du programme rendue en cadeaux, choisie par le restaurateur (4–12 %) |
| Cadeau de bienvenue | Offert au premier ticket du client |
| Pub de quartier | Campagne Facebook/Instagram dans un rayon autour du restaurant, gérée par Boosteats |
| CA du jour | Chiffre d'affaires noté chaque jour par le gérant (caisse + plateformes) |
| Taux de capture | Tickets du programme ÷ tickets de caisse |

## Brand Voice

Prospection, landing et e-mails restaurateurs : **vouvoiement**. Console du restaurateur : tutoiement (déjà en place).

| Attribute | Means | Doesn't mean | Example line |
|---|---|---|---|
| **Terre à terre** | Les mots du comptoir, des exemples en euros et en plats | Familier ou approximatif | « Rien à brancher : le ticket de caisse suffit. » |
| **Précis** | Un chiffre vérifiable plutôt qu'un superlatif | Noyer sous les chiffres | « À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats. » |
| **Honnête** | Dire ce qui est livré et ce qui ne l'est pas ; mesurer avant de promettre | Prudent au point d'être flou | « Au bout d'un mois vous voyez combien se sont inscrits et combien sont revenus. » |
| **Court** | Une idée par phrase, une action par message | Sec ou télégraphique | « Inscrire les clients et les faire revenir. » (landing) |

**Tone by context :**
- Sales (visite, WhatsApp) : un constat vrai sur SON restaurant, puis une proposition simple (audit gratuit, démarrer gratuitement)
- Launch : ce qui change pour lui, en une phrase, avec l'écran
- Errors : ce qui s'est passé et quoi faire, sans jargon
- Support : réponse directe, par le même canal
- Social : preuves du terrain (photos de salle, chiffres avec accord)

**Terms we own :** « faire revenir, faire venir », « rien à brancher : le ticket de caisse suffit », « chaque cadeau est calculé sur ce qu'il vous coûte ».
**Never use (and why) :** « grâce à nous » (on mesure une origine, pas un CA additionnel — ADR 0064) ; « automatique / instantané » pour la validation des tickets côté client (ADR 0008) ; « 0 % de commission » sans contexte (ADR 0070) ; une fonction non livrée au présent.

## Proof Points

**Metrics :** *à construire* — étude de cas d'un établissement réel (inscrits, taux de capture, clients revenus, effet d'une pub de quartier), en lecture seule sur la base, publiée avec l'accord du restaurant.
**Customers :** trois établissements Belchicken à Bruxelles (Kraainem, Houba, Uccle) ; noms cités seulement avec leur accord.
**Testimonials :** *aucun recueilli à ce jour.*

**Value themes :**
| Theme | Proof |
|---|---|
| Faire revenir | À mesurer : clients revenus après une annonce vs groupe témoin (ADR 0063) |
| Faire venir | À mesurer : portée et coût réels des pubs de quartier (`/platform/pub`) |
| Coût maîtrisé | Règle vérifiable dans le produit : prix des cadeaux = prix de revient ÷ taux choisi |
| Rien à brancher : le ticket suffit | Tickets lus en production depuis juin 2026 |

## Goals

**Business goal :** signer des indépendants bruxellois et les faire passer du Gratuit au payant (Croissance, Pro, pub).
**Conversion action :** prospection → **audit gratuit présenté sur place** (20 min, 14 h–17 h) → démarrage en plan Gratuit avec le kit en salle → plan payant ou pub.
**Current metrics :** hypothèses de départ (`docs/strategie/prospection-bruxelles.md`) : 52 contacts/semaine → 25 % RDV → 80 % audit présenté → 50 % signés ≈ 5 signés/semaine. À remplacer par les taux mesurés dans l'onglet Outbound de `/platform`.

## Paid Ads (optional)

Pub de quartier gérée **pour les restaurants clients** (pas d'acquisition Boosteats payante à ce jour) : process ADR 0085/0086, repère 10–15 €/jour, frais selon le plan. L'agent peut lire, comparer, signaler, rédiger, recommander ; il ne lance, ne met en pause ni ne modifie aucun budget sans validation.

## Learnings

*Décisions et leçons testées. Les plus récentes en haut. Environ 20 lignes actives maximum.*

| Date | Learning | Evidence | Applies to | Status |
|---|---|---|---|---|
| 2026-11-01 | Croissance à 150 €/mois (au lieu de 99 € sur la landing) | Décision du porteur | Landing, one-pager, script | active |
| 2026-11-01 | Ne pas mettre en avant « les clients restent à vous » | Décision du porteur | Tout texte commercial | active |
| 2026-11-01 | Le message d'ouverture est « faire revenir + faire venir » ; la fidélité au coût maîtrisé est ce qui nous distingue, la pub de quartier ce qui fait payer | Décision du porteur | Tout texte commercial | active |
| 2026-11-01 | Cible du premier mois : indépendants de Bruxelles (pas le réseau Belchicken) | Décision du porteur | Prospection, landing | active |
| 2026-11-01 | Le prix se présente en commençant par le Gratuit, puis chaque plan payant avec ce qu'il apporte | Décision du porteur | Landing, one-pager, script | active |
| 2026-11-01 | Ne pas parler de « réseau de clients » | Faux aujourd'hui ; contraire à l'ADR 0070 | Tout texte | active |
| 2026-10-29 | La pub vendue avec une estimation avant paiement et un repère de budget rassure | Démo Pub Uccle | Pub, script | watch |

## Changelog

*Les plus récentes en haut. Une ligne par révision : quoi et pourquoi.*
- v1 (2026-11-01) — Contexte initial, rédigé depuis le code, les ADR 0070/0074/0081/0086 et docs/strategie, après les décisions du porteur (message, cible, prix Gratuit d'abord, Croissance à 150 €, tournures « rien à brancher » et « calculé sur ce qu'il vous coûte »).
