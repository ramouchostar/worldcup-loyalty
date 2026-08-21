# ADR 0037 — Mesurer le haut de l'entonnoir côté serveur

**Statut** : Accepté (2026-08-21). Complète l'**ADR 0036** (conservation des scans) et le plan de mesure (`docs/tracking-plan.md`). Contraint par l'**ADR 0025** (minimisation, consentement).

## Contexte

Après le correctif de l'ADR 0034, la question devient : pourquoi si peu de monde ? Le restaurateur avance une hypothèse — « les gens ne scannent pas le QR code ». Elle n'est ni vérifiable ni réfutable en l'état.

Ce qu'on sait mesurer aujourd'hui, à Kraainem sur les 18-19/08 :

| Étage | Mesure | Chiffre |
|---|---|---|
| arrivée sur la page | **aucune** | **?** |
| inscription | `memberships.joined_at` | 8 |
| ticket scanné | `receipt_scans` (ADR 0036) | 6 |
| commande | `orders` | 0 (verrou ADR 0034) |

Le premier étage manque, et c'est celui qui départage les deux lectures : « personne ne scanne le QR » (peu d'arrivées) et « ils scannent mais n'installent pas » (beaucoup d'arrivées, peu d'inscriptions). Deux problèmes opposés, deux remèdes opposés — l'affiche et sa place d'un côté, la page d'atterrissage de l'autre.

GA4 ne répond pas : le Consent Mode v2 refuse tout par défaut (ADR 0025) et l'écrasante majorité des arrivées n'y remonte jamais. C'est un choix assumé, il n'est pas question de le desserrer pour mesurer.

## Décision

### 1. Un compteur serveur, sans donnée personnelle

`qr_landings` (m60) compte les arrivées sur `/r/[restaurantId]` par **jour belge**, **provenance** (`qr_code` si le lien porte l'`utm_source` des QR imprimés, `direct` sinon) et **visiteur** (`anonyme` / `membre`).

Ni IP, ni agent utilisateur, ni cookie, ni identifiant : un entier par case. Rien à consentir puisque rien de personnel n'est collecté — c'est ce qui rend la mesure fiable là où GA4 est aveugle.

### 2. Ce que le compteur ne dit pas

Il compte des **chargements de page**, pas des personnes : un rechargement compte deux fois, un bot ou un préchargement aussi. On l'assume et on l'écrit à côté du tableau — la comparaison entre jours reste juste, et c'est elle qui nous intéresse.

Dédupliquer demanderait un cookie ou une empreinte, donc du consentement, donc à nouveau l'angle mort. Un chiffre grossier mais honnête vaut mieux qu'un chiffre juste que personne n'autorise.

### 3. L'entonnoir se lit d'un seul endroit

`/platform/scans` affiche les quatre étages jour par jour, **pour un établissement à la fois** — additionner les arrivées de plusieurs restaurants ne veut rien dire. Les trois derniers étages remontent même sans m60 : l'absence de comptage ne doit pas priver de ce qu'on sait déjà.

### 4. Best-effort, jamais bloquant

Un échec de comptage n'empêche jamais la page de s'afficher (même règle que `record_scan`, ADR 0029 §6). La page d'atterrissage est la première impression du programme ; elle ne tombe pas pour une statistique.

## Conséquences

- Une écriture de plus par affichage de page publique — un `INSERT … ON CONFLICT` sur une table minuscule, négligeable.
- La comparaison arrivées / inscriptions donne un **taux de conversion d'affiche** exploitable : il devient possible de juger un emplacement de QR, un visuel, un moment de la journée.
- À surveiller : si les compteurs paraissent gonflés par des robots, la piste suivante est d'exclure les requêtes de préchargement, pas d'ajouter un cookie.

## Alternatives rejetées

**S'appuyer sur GA4.** Refusé par défaut chez la quasi-totalité des visiteurs ; mesurer là-dessus reviendrait à décider sur un échantillon inconnu et biaisé.

**Un cookie de déduplication.** Il ferait basculer la mesure dans le champ du consentement — exactement l'angle mort qu'on cherche à sortir.

**Journaliser chaque visite en ligne (IP, agent, horodatage).** Donnée personnelle, conservation à justifier, minimisation violée (ADR 0025 §7) — pour une question à laquelle un compteur répond.
