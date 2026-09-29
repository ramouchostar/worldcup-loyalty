# Positionnement Boosteats — outil marketing pour restaurateurs

> Document de travail (2026-09-29), compagnon de l'[ADR 0074](../adr/0074-boosteats-outil-marketing-pas-outil-d-exploitation.md).
> Chiffres concurrents relevés sur leurs sites et comparateurs publics fin septembre 2026 :
> à revérifier avant de les citer à un prospect.

## 1. En une phrase

**Boosteats remplit ta salle : on inscrit tes clients, on les fait revenir, et tu vois ce
que chaque action t'a rapporté.**

## 2. Pour qui

- **Cible de départ** : restauration rapide et à emporter en Belgique, 1 à 5 établissements,
  propriétaire présent en salle, pas d'équipe marketing. Point d'entrée : le réseau
  **Belchicken** (même caisse, même ticket déjà maîtrisé, décision au siège puis
  déploiement).
- **Pas pour l'instant** : grandes chaînes (elles exigent l'intégration caisse),
  restaurants gastronomiques (la réservation est leur outil central).

## 3. Le problème qu'on résout

Le restaurateur :
1. ne connaît pas ses clients (il ne sait pas qui revient, qui a décroché) ;
2. n'a ni le temps ni le savoir-faire pour les relancer ;
3. subit ses avis Google sans les piloter ;
4. ne sait pas ce que lui rapportent ses actions marketing.

## 4. La promesse, bloc par bloc

| Bloc | Ce que voit le restaurateur | Ce que ça lui rapporte |
|---|---|---|
| **Capter** | « 312 clients inscrits, 41 cette semaine » | Une base clients à lui, sans installation ni caisse à changer |
| **Connaître** | « 58 clients ne sont pas revenus depuis 30 jours » | Il sait qui relancer |
| **Agir en un clic** | « Relancer ces 58 clients » → message prêt, envoyé | Des visites en plus, sans rien écrire |
| **Réputation** | « 3 nouveaux avis, 1 à traiter — réponse proposée » | Une note qui monte, du temps gagné |
| **Résultats** | « 14 clients revenus après la relance (vs 3 dans le groupe témoin) » | La preuve, chaque mois |

## 5. Pitch (30 secondes, au comptoir)

> « Aujourd'hui, vos clients repartent et vous ne savez pas s'ils reviendront. Avec
> Boosteats, ils prennent leur ticket en photo, gagnent des points, et vous récupérez leur
> contact. Ensuite, en un clic, vous relancez ceux qui ne reviennent plus, vous fêtez leur
> anniversaire, vous demandez un avis Google. Et chaque mois, vous voyez combien sont
> revenus. Rien à installer, ça marche avec votre caisse actuelle, et on démarre gratuitement. »

## 6. Paysage concurrentiel

| Acteur | Ce qu'il vend | Prix public | Caisse | Ce qu'on en retient |
|---|---|---|---|---|
| **Joyn** (BE) | Carte de fidélité digitale, 7 500 commerçants, app consommateur | ≈ 60–80 €/mois | Intégrations | Leader belge : ne pas l'attaquer sur la fidélité, mais sur le résultat marketing |
| **Zerosix** (FR) | Fidélité + campagnes SMS/e-mail, 70+ intégrations | 49 €/mois + 190 € de mise en service | Oui | Modèles de messages + IA, messages automatiques (anniversaire, relance) |
| **Leat** (NL) | Fidélité, cartes cadeaux, bons, automatisation ; 40+ intégrations | Sur devis, jetons d'usage | Oui | « Mastodonte » intégré — pas notre terrain |
| **Piggy** (NL) | Fidélité à niveaux, CRM, automatisation multicanal ; 100+ intégrations | Sur devis | Oui | Déclencheurs + segments sans effort |
| **Malou** (FR) | Avis, réseaux sociaux, SEO local, 50+ plateformes | 169 €/mois (Essential), 549–599 € (Copilot) | Non | Réponses IA aux avis, posts Google : le bloc Réputation |
| **Partoo** (FR) | Présence locale, avis, messagerie | Sur devis | Non | Jusqu'à 3 réponses IA proposées par avis |
| **Owner.com** (US) | Site + commande en ligne + app + marketing automatisé | 249 $/mois + 5 % ou 499 $/mois | Non | Séquences de bienvenue et de relance — **mais** métier de commande : on ne suit pas |
| **SevenRooms** (US) | CRM + réservations + marketing | Sur devis (haut de gamme) | Oui | 13 e-mails automatiques prêts, résultats par campagne |
| **Bloom Intelligence** (US) | CDP, Wi-Fi invité, segments, réputation | Sur devis | Oui | Statut « en train de décrocher » + relance automatique |

**Notre place** : entre Zerosix/Joyn (fidélité, peu de marketing) et Malou (réputation, pas
de base clients). **Base clients + relance + avis + preuve, sans installation.**

## 7. Fonctions à reprendre (simples, dans le filtre de l'ADR 0074)

Classées par valeur pour le restaurateur ÷ effort pour nous. « Existe » renvoie à ce qui est
déjà dans le code.

| # | Fonction | Inspiré de | Existe déjà | Effort |
|---|---|---|---|---|
| 1 | **Retrait de la récompense contre avis Google** (conformité) | Règles Google 2026 | À retirer | Faible — urgent |
| 2 | **Segments automatiques** : nouveaux, habitués, en train de décrocher, perdus, anniversaire du mois | Bloom, SevenRooms | Données oui, écran non | Faible |
| 3 | **Relance des clients qui décrochent** en un clic, puis en automatique | Bloom, Owner, SevenRooms | Séquences (ADR 0063) | Faible |
| 4 | **Bibliothèque de campagnes prêtes** (10 à 15 : bienvenue, relance, anniversaire, jour creux, nouveau plat, météo, match) avec texte proposé par IA | Zerosix, SevenRooms | Annonces (broadcast) | Moyen — c'est notre savoir-faire d'agence |
| 5 | **Demande d'avis après visite**, sans récompense, à tous | Partoo, Malou | Canal qualité (ADR 0026) | Faible |
| 6 | **Centre des avis Google** : notification, réponse proposée par IA, validation en un geste | Malou, Partoo | Accès API Google Business Profile à demander | Moyen |
| 7 | **Page de résultats mensuelle** : clients revenus vs groupe témoin, avis, note, abonnés | SevenRooms | Groupe témoin (ADR 0063) | Moyen |
| 8 | **Carte Wallet** (Apple/Google) : le membre garde sa carte sans installer d'app | Thanx, Joyn | Au backlog | Moyen |
| 9 | **Posts Google programmés** depuis la même campagne | Malou | Non | Moyen (après n° 6) |
| 10 | **Lecture seule de la caisse** (API unifiée type Chift) : taux de capture, effet sur le CA | — | Import CSV (ADR 0027) | À partir de 10–30 établissements |

**À ne pas reprendre** : commande en ligne et livraison (Owner), réservation (SevenRooms),
cartes cadeaux (Leat, Piggy), Wi-Fi invité (matériel, Bloom), synchronisation vers 50
annuaires (Malou), intégrations caisse maison (tous les « mastodontes »).

## 8. Offre et prix (à tester, ADR 0074 §7)

| Plan | Pour qui | Contenu | Prix de départ |
|---|---|---|---|
| **Gratuit** | Tous | Capter + fiche membre + annonces à la main + 500 tickets/mois | 0 € |
| **Croissance** | Le propriétaire qui veut agir lui-même | Segments, relance au rythme de chaque client, campagnes en un clic, centre des avis, page de résultats | ≈ 99 €/mois |
| **Pro** | Celui qui veut qu'on s'en occupe | Croissance + copilote du lundi + fiche Google gérée + référencement + site de commande d'un partenaire (installation, gestion, optimisation) + rapport et point mensuels | 500 €/mois |
| **Publicité gérée** (option) | Celui qui veut plus de nouveaux clients | Campagnes Meta et Google gérées, visites en salle mesurées | Sur devis |

Logique : le Gratuit construit la base (et le verrou membres), la Croissance se vend sur « je
relance en un clic », le Pro sur « on pense marketing à votre place », la publicité gérée sur
« on vous amène du monde ».

### Le site de commande dans le Pro

- Il existe déjà (solution de sa caisse, ou intermédiaire relié à la caisse type Deliverect) :
  on l'**optimise** — carte, photos, bouton « Commander » sur Google et Instagram, liens
  suivis, pixel Meta et conversions Google.
- Il n'existe pas : on le **met en place chez un partenaire relié à la caisse**. Le partenaire
  porte la conformité à la caisse certifiée (SCE), les paiements et la maintenance ; nous,
  l'installation, la mesure et l'optimisation. Commission d'apport à négocier.
- On écrit « installation, gestion et optimisation », **jamais « maintenance »**.

## 9. Aller chercher les restaurateurs

1. **Preuve d'abord** : étude de cas Kraainem (inscrits, taux de capture, clients revenus
   après une relance, avis gagnés) — une page.
2. **Belchicken** : présentation au siège, 3 établissements pilotes **payants** (même à prix
   réduit).
3. **Audit gratuit** (`/audit-gratuit`, ADR 0071) comme porte d'entrée pour les autres
   restaurants : il montre le manque (avis, visibilité, clients non relancés) avant de
   vendre.
4. **Kit d'activation en salle** (ADR 0053) livré à chaque ouverture : affiche au comptoir,
   QR de l'équipe, phrase à dire, prime au serveur. La capture se gagne en salle.
5. **Pas de nouvelle mécanique de fidélité** avant 10 établissements actifs.

## 10. Le copilote marketing (Pro)

Principe : **un signal → une action proposée → un clic → une mesure**. Le restaurateur reçoit
un message le lundi avec **trois actions maximum** :

> **Votre semaine chez Smashly Ixelles**
> 1. Pluie jeudi et vendredi soir → relance emporter aux 140 habitués **[Envoyer]**
> 2. Belgique–France samedi 21 h → offre menu partagé **[Envoyer]**
> 3. 38 clients ont dépassé leur rythme habituel → relance personnalisée **[Envoyer]**
>
> La semaine dernière : 61 clients revenus après les campagnes (12 dans le groupe témoin).

### Signaux « quand agir »

| Signal | Action type | Source |
|---|---|---|
| Météo | Pluie → emporter ; chaleur → frais mis en avant | Open-Meteo (gratuit) |
| Matchs | Offre avant le coup d'envoi | API-Football, TheSportsDB |
| Événements proches | Publicité locale, horaires | Ticketmaster Discovery, PredictHQ, agendas ouverts |
| Vacances scolaires | Deux vagues à cibler (calendriers francophone et flamand distincts depuis 2022) | Calendriers des communautés |
| Ramadan, Aïd (si clientèle concernée, au choix du restaurateur) | Horaires et offres de rupture du jeûne | Aladhan (gratuit) |
| Blocus et examens | Offre tard le soir | Calendriers universitaires |
| Travaux, fermetures de route | « Toujours ouverts, voici l'accès » | Données ouvertes régionales |

### Signaux « le marché autour »

| Signal | Message | Source |
|---|---|---|
| Nouveau concurrent à proximité | « Relancez vos habitués cette semaine » | Google Places (déjà branché) |
| Publicités des concurrents | « X fait une promo Instagram depuis 5 jours » | Bibliothèque publicitaire Meta |
| Tendances de recherche | « "Smash burger" +60 % à Bruxelles » | Google Trends (API en test, à vérifier) |
| Population de la zone | Ciblage publicitaire | Statbel (données ouvertes) |
| Audience atteignable | « 42 000 personnes de 18–34 ans à 3 km » | Estimation d'audience, API Marketing Meta |

### L'arme secrète : ses tickets croisés avec les signaux

- Sensibilité météo **propre à l'établissement** (« chez vous, la pluie fait +22 % d'emporter »).
- Relance au **rythme de chaque client**, pas à 30 jours pour tous.
- **Plats qui font revenir** (lignes de tickets déjà en base) → offre de bienvenue.
- **Jours creux prévus** (prévision ADR 0027) → campagne proposée à l'avance.
- Meilleure heure d'envoi par client ; thèmes des avis (« attente le vendredi soir »).

### Visites en salle envoyées aux régies

API de conversion Meta et conversions Google Ads alimentées par les tickets validés :
« cette campagne Instagram a fait revenir 84 clients au comptoir ». **Case de consentement
distincte obligatoire** (RGPD) avant tout envoi.

## 11. Données de comptes à connecter (Pro)

Lues avec l'autorisation du restaurateur, via les API officielles, jamais par aspiration :

| API | Ce que le restaurateur découvre | Accès |
|---|---|---|
| Google Business Profile — statistiques | Vues, appels, itinéraires, clics site, menu et « Commander », mots-clés de recherche | Connexion Google + accès API à demander (long : à lancer tout de suite) |
| Google Business Profile — avis et posts | Répondre aux avis et publier depuis Boosteats | Même accès |
| Google Search Console | Recherches qui mènent à son site, positions | Connexion Google |
| Instagram et Facebook (Meta) | Portée, abonnés, visites du profil, clics vers le site | Compte professionnel connecté |
| Google Analytics 4 | Visites et conversions du site | Connexion Google |
| Tripadvisor Content API | Note et rang Tripadvisor | Gratuit sous conditions |
| PageSpeed Insights, Places, DataForSEO | Vitesse, concurrents, place sur Maps | Déjà branchés |

Pas d'API exploitable : Uber Eats, Deliveroo, TheFork (données via les intermédiaires reliés
à la caisse, ou export manuel). Alternatives à DataForSEO si besoin : Local Falcon,
BrightLocal, SerpApi.

**Ordre de construction** : météo + jours fériés + vacances → relance au rythme du client →
message du lundi → matchs et événements → connexions Google et Meta → visites en salle vers
les régies.

## Sources

- Owner.com — [tarifs](https://www.owner.com/pricing), [revue Dupple](https://dupple.com/reviews/owner)
- Malou — [offre MalouApp](https://www.malou.io/en-us/offer/malou-app), [alternatives et prix (Revyo)](https://www.getrevyo.com/blog/alternative-malou)
- Leat — [tarifs](https://www.leat.com/pricing), [Capterra](https://www.capterra.com/p/10028461/Leat/)
- Joyn — [présentation](https://joyn.eu/en/what-is-joyn/), [BNP Paribas Fortis](https://www.bnpparibasfortis.be/en/public/entrepreneurs/daily-banking/payments/joyn-merchant)
- Zerosix — [tarifs](https://www.zerosix.com/tarifs-programme-fidelite), [campagnes](https://www.zerosix.com/animations-campagnes-marketing)
- Piggy — [restaurants](https://www.piggy.eu/industry/restaurant)
- Partoo — [réponses automatiques](https://www.partoo.co/en/blog/automatic-replies-to-reviews-thanks-to-partoo/)
- SevenRooms — [automatisation marketing](https://sevenrooms.com/platform/marketing-automation/)
- Bloom Intelligence — [Wi-Fi marketing](https://bloomintelligence.com/what-is-wifi-marketing/)
- Chift — [API caisse unifiée](https://www.chift.eu/categories/pos)
- Caisse certifiée (SCE) — [Fédération Horeca Bruxelles](https://www.horecabruxelles.be/sce-2-0-en-horeca-ce-que-vous-devez-savoir-sur-la-modernisation-des-caisses-enregistreuses/), [VATupdate](https://www.vatupdate.com/2026/06/09/belgium-extends-fiscal-cash-register-compliance-deadlines-through-2029/)
- Règles Google sur les avis 2026 — [Birdeye](https://birdeye.com/blog/google-review-policy/), [Launchcodex](https://launchcodex.com/blog/seo-geo-ai/google-business-profile-review-policy-update/)
