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
| **Gratuit** | Tous | Capter + fiche membre + 1 annonce manuelle/mois | 0 € |
| **Essentiel** | Le propriétaire qui veut agir | Segments, campagnes en un clic, séquences, centre des avis, résultats | 79–99 €/mois |
| **Pro** | Celui qui veut qu'on le fasse pour lui | Essentiel + fiche Google gérée + rapport mensuel + point mensuel agence | 199–249 €/mois |
| **Agence** (option) | Celui qui veut plus de nouveaux clients | Publicité payante gérée, mesurée dans la page résultats | Sur devis |

Logique : le Gratuit construit la base (et le verrou membres), l'Essentiel se vend sur « je
relance en un clic », le Pro sur « on s'en occupe », l'Agence sur « je t'amène du monde ».

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
- Règles Google sur les avis 2026 — [Birdeye](https://birdeye.com/blog/google-review-policy/), [Launchcodex](https://launchcodex.com/blog/seo-geo-ai/google-business-profile-review-policy-update/)
