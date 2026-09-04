# ADR 0048 — Dédoublonnage par empreinte de ticket, le numéro en signal secondaire

**Statut** : Accepté (2026-09-04) — implémenté (phase C du chantier d'activation).
Amende l'**ADR 0003** et l'**ADR 0008** (le Bestelnummer n'est plus le seul verrou
anti-doublon) et complète l'**ADR 0019** (clé de ticket découverte par établissement).
Ne change rien au calcul des points ni des cadeaux (**ADR 0006**, **0017**, **0021**).
S'appuie sur l'**ADR 0020** (lignes d'articles et heure déjà extraites) et l'**ADR 0036**
(image conservée 30 jours).

## Contexte

L'anti-doublon reposait sur une seule valeur : `orders.duplicate_key`, dérivée du
numéro de commande lu par l'OCR — le Bestelnummer à l'origine (ADR 0003/0008), puis
la clé configurée par établissement (ADR 0019). Un index `UNIQUE` en base, et rien
d'autre.

Ce verrou suppose que l'OCR lit le numéro **exactement**. Il ne le fait pas toujours.
Sur un ticket thermique, `…/08228` se lit `…/08223` : le 8 et le 3 se confondent. La
clé produite est alors différente, l'index UNIQUE ne voit rien, et **le même ticket
physique crée deux commandes validées** — donc deux crédits de points, deux fois la
dépense dans le score de l'équipe, et potentiellement deux cadeaux dus.

Constaté à Belchicken Kraainem pendant le test de lancement : mêmes articles, même
montant, même heure, deux numéros à un chiffre près. La signature était déjà visible
dans `lib/scan-frictions.test.ts` (ADR 0036) sans qu'on en tire la conclusion.

Deux angles morts s'y ajoutent :

1. **Sans clé lisible, il n'y a aucun anti-doublon du tout.** La clé de repli
   `NOBN_<user>_<timestamp>` (ADR 0019 §5) est unique par construction. Ces commandes
   partent en file admin, mais rien ne signale à l'admin qu'il valide deux fois le
   même ticket.
2. **La matière première d'une meilleure détection existait déjà et n'était pas
   lue** : `orders.order_time` et `order_items` sont remplis depuis l'ADR 0020,
   l'image est conservée 30 jours depuis l'ADR 0036.

Le risque symétrique cadre la solution : **deux clients peuvent commander la même
chose à la même minute.** Au coup de feu du midi, deux menus identiques à 13h34 sont
un événement banal. Un dédoublonnage trop large punirait des clients honnêtes — ce
qui coûte plus cher qu'un doublon.

## Décision

### 1. Une empreinte de contenu, indépendante du numéro

`lib/receipt-fingerprint.ts::contentFingerprint` hache **établissement + montant +
lignes d'articles normalisées** (minuscules, sans accents, ponctuation aplatie —
`normalizeItemName`, ADR 0020/0046), les lignes étant **triées** avant hachage : deux
lectures OCR du même ticket peuvent restituer les lignes dans un ordre différent, et
l'ordre d'affichage n'identifie pas un ticket.

**L'heure n'est pas dans l'empreinte**, volontairement. La tolérance retenue est de
±2 minutes, et une tolérance ne se met pas dans un hachage : deux heures à une minute
d'écart donnent deux hachages sans rapport. L'heure est comparée séparément.

Une empreinte **sans aucune ligne d'article** (OCR muet sur les articles) est marquée
`weak` : elle ne vaut que « ce resto, ce montant » et ne doit jamais suffire à
accuser deux membres différents.

### 2. Le numéro de commande devient un signal secondaire, tolérant

`ocrConfusionDistance` compare deux numéros en n'admettant que les confusions
réellement observées sur ticket thermique — **0/8, 1/7, 3/8, 5/6, 6/8, 2/7** — et
**uniquement** à longueur égale, séparateurs identiques, au plus deux substitutions.

Strict sur la longueur par nécessité : un numéro plus court est un numéro *tronqué*,
pas un numéro *mal lu*, et un tronquage peut désigner un autre ticket. Strict sur les
paires par nécessité aussi : les numéros de caisse d'une même journée sont
séquentiels, donc proches par construction — `…08228` et `…08229` ne diffèrent que
d'un chiffre, mais 8 et 9 ne se confondent pas, et ce sont bien **deux tickets**.

Quand l'empreinte correspond déjà, un numéro qui ne diffère que par ces confusions
transforme le soupçon en certitude.

### 3. Un hachage perceptuel de la photo, calculé côté serveur

`lib/image-phash.ts` : réduction 32×32 en niveaux de gris, DCT, signe des
64 coefficients basse fréquence par rapport à leur médiane. Le coefficient continu
est écarté — il ne porte que l'exposition, exactement ce qu'on veut ignorer.

Mesuré sur des images passées par le pipeline de production : deux prises du même
ticket (recadrage, exposition, JPEG q62) tombent à **6/64** ; deux tickets différents
à **22/64**. Seuils retenus : ≤ 8 doublon, 9–14 à vérifier.

**Calculé côté serveur** (`sharp`, déclaré en dépendance), jamais fourni par le
client — même règle que la ré-analyse OCR d'`app/api/orders/route.ts` : rien de ce
que le client envoie n'influence la validation. Le navigateur décode pourtant déjà
l'image (`lib/receipt-image-client.ts`) et le calcul y aurait été gratuit ; c'est un
coût serveur assumé pour ne pas ouvrir une porte de contournement.

### 4. Quatre signaux, et ce qui n'est pas certain n'est jamais rejeté

`lib/duplicate-detection.ts` — fonction pure, le verdict le plus sévère l'emporte :

| Situation | Verdict |
|---|---|
| Numéro de commande identique | doublon |
| Même membre · empreinte identique · heure à ±2 min | doublon |
| Même membre · empreinte identique · numéro à confusion OCR près | doublon |
| Même membre · empreinte identique · même jour · heure non lue | doublon |
| Même membre · même montant · heure à ±2 min · moins de 24 h | doublon |
| Même membre · photos à ≤ 8/64 · moins de 24 h | doublon |
| **Membres différents** · empreinte identique · heure à ±2 min | **à vérifier** |
| Même montant · heure à ±2 min · ≥ 50 % de lignes communes, empreinte différente | **à vérifier** |
| Même membre · photos à 9–14/64 · moins de 24 h | **à vérifier** |

La ligne qui compte est celle en gras : **deux membres différents ne sont jamais
rejetés automatiquement**, même avec un contenu identique à la même minute. Un humain
tranche, les deux tickets côte à côte.

### 5. La file « à vérifier » vit dans la console, et ne crédite rien

Un cas ambigu porte le flag `duplicate_review` : la commande reste `pending`, donc
**aucun point n'est crédité, aucun score d'équipe n'est touché**. C'est toute la
raison d'être de cette file — arbitrer avant de créditer coûte un délai ; créditer
puis reprendre coûte la confiance du client.

`/admin/[id]/duplicates` montre les deux tickets côte à côte (photo, montant, heure,
numéro, lignes) et deux boutons. « C'est le même ticket » rejette la commande.
« Ce sont deux commandes différentes » retire le flag et la renvoie en file de
validation ordinaire — cette page **ne valide jamais elle-même**, pour ne pas
court-circuiter les autres contrôles (montant, en-tête, confiance OCR).

Table `duplicate_reviews`, RLS activée **sans policy** = service-role uniquement : la
règle déclenchée et les seuils de confusion sont de la mécanique anti-fraude, que ni
le membre ni le restaurateur ne doivent pouvoir lire (même principe que
`receipt_scans`, ADR 0036 §4, et `restaurant_receipt_config`, ADR 0019 §1).

### 6. Un seul message au membre

**« Ce ticket a déjà été utilisé. »** Sans détail technique, sans nommer le signal,
sans dire quel ticket — la mécanique anti-fraude ne s'explique pas (ADR 0008/0019),
et un doublon reste le plus souvent **accidentel** (glossaire CONTEXT.md,
*Doublon*). Le message remplace aussi l'ancien « Ce numéro de ticket a déjà été
enregistré dans le système », qui révélait le mécanisme.

### 7. Fail-open de bout en bout

La migration `20260904-1830` s'applique à la main (docs/migrations/README.md). Tant
qu'elle ne l'est pas :

- l'insertion de la commande **retente sans les deux nouvelles colonnes** (codes
  `42703` / `PGRST204`) — sans cela, déployer le code avant la migration aurait
  bloqué **toutes** les soumissions ;
- le chargement des candidats se rabat sur les colonnes historiques ;
- le journal est simplement sauté.

Toute panne du moteur renvoie un verdict `ok`. Le verrou historique (index `UNIQUE`
sur `duplicate_key`) reste en place et continue seul. C'est le bon arbitrage : un
incident de dédoublonnage ne doit pas refuser le ticket d'un client légitime.

## Conséquences

### Schéma (`docs/migrations/20260904-1830-dedoublonnage-tickets.sql`)
- `orders.content_fingerprint`, `orders.image_phash`, deux index de recherche.
- Table `duplicate_reviews` (service-role only).
- **Pas d'index `UNIQUE` sur l'empreinte** : deux clients *peuvent* commander la même
  chose le même jour. C'est la conjonction empreinte + heure + membre qui fait le
  doublon, et elle se décide dans le code, pas dans une contrainte.

### Code
- `lib/receipt-fingerprint.ts`, `lib/image-phash.ts` (pur),
  `lib/image-phash-server.ts` (sharp, serveur), `lib/duplicate-detection.ts` (pur),
  `lib/duplicate-guard.ts` (I/O), `lib/duplicate-reviews.ts`,
  `lib/duplicate-audit.ts` (pur).
- `app/api/orders/route.ts` : garde avant insertion, colonnes tolérantes.
- `app/admin/[restaurantId]/duplicates/` : la file d'arbitrage.
- `scripts/audit-doublons.mjs` (`npm run audit:doublons`) : rejeu de l'historique,
  **lecture seule**, produit `docs/audit-doublons.md`.
- `sharp` passe en dépendance déclarée (elle était déjà résolue via Next 16).

### Opérationnel
- Migration à appliquer dans l'éditeur SQL Supabase à la fusion.
- L'audit rétroactif **ne corrige rien** : il propose. Toute reprise de solde demande
  un accord explicite et un second script écrit pour ça.
- Le pHash n'est pas rejouable sur l'historique (images de plus de 30 jours effacées,
  ADR 0036) : l'audit est **conservateur**, il peut manquer des doublons, il n'en
  invente pas.

## Alternatives rejetées

**Renforcer le seul numéro de commande** (meilleur prompt, second appel Vision de
vérification). Double le coût et la latence à chaque scan, et ne couvre toujours pas
les établissements sans clé fiable (ADR 0019 §5).

**Un index `UNIQUE` sur l'empreinte de contenu.** Séduisant parce que la base tient
la règle — mais il rejetterait le deuxième client qui commande le même menu le même
jour. Un anti-doublon qui punit des clients honnêtes est pire que le doublon.

**Faire du pHash le signal principal.** Une photo cadrée autrement, sous une autre
lumière, s'éloigne vite ; et l'image est effacée au bout de 30 jours (ADR 0036) alors
que la commande reste. C'est un signal de corroboration, pas une clé.

**Calculer le pHash dans le navigateur**, où l'image est déjà décodée. Gratuit, mais
c'est une donnée envoyée par le client sur un chemin anti-fraude : un fraudeur
enverrait un hachage quelconque et échapperait au signal.

**Rejeter tout cas ambigu.** Simple à écrire, et faux : deux clients qui commandent
la même chose à la même minute existent tous les midis. Le coût d'un faux rejet
(un client qui ne revient pas) dépasse celui d'un cadeau en trop.

**Créditer d'abord, corriger ensuite.** Reprendre des points déjà annoncés à un
membre détruit la confiance bien au-delà de ce que vaut la correction — c'est aussi
pourquoi un cadeau déjà remis au comptoir n'est jamais repris (§5 du rapport d'audit).
