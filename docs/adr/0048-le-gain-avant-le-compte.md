# ADR 0048 — Le gain avant le compte : l'aperçu OCR visiteur devient l'écran de conversion

**Statut** : Accepté (2026-09-09) — amende [ADR 0045](0045-preuve-scan-avant-compte.md)
(la preuve du scan n'est plus le montant seul) et précise l'exception euro de
l'[ADR 0028](0028-points-decoupled-from-euros.md) §5. Lot 2 du parcours cible
« le ticket avant tout » (`docs/plan-parcours-cible.md`, arbitrages du porteur
du 2026-09-04). Ne change rien au calcul des points ni des cadeaux
(**ADR 0006**, **0017**, **0021**), ni à l'anti-fraude (**ADR 0008**).

> Le numéro 0048 est également utilisé par un ADR **non fusionné** de la branche
> `claude/boosteats-audit-refonte-70b5re` (dédoublonnage par empreinte de
> ticket, code annulé le 2026-09-05, aucune PR ouverte). Numéro pris sur
> `origin/master` et réservé par cette PR, conformément à CLAUDE.md § Collaboration ;
> l'autre document sera renuméroté s'il revient.

## Contexte

L'ADR 0045 a ouvert l'OCR aux visiteurs anonymes pour prouver que le scan avait
marché avant de demander un compte. Ce qu'il affiche : **« ✅ Ticket bien lu ·
36,10 € · Montant détecté sur ton ticket »**.

C'est une preuve technique, pas un argument. Le montant du ticket, le client
l'a déjà sur le papier qu'il tient — l'app ne lui apprend rien. Et elle
enchaîne immédiatement sur le geste le plus coûteux du parcours (« connecte-toi
pour garder tes points ») avec, pour seule contrepartie, des points dont il ne
sait pas encore ce qu'ils valent. L'audit du parcours (`docs/audit-parcours.md`,
2026-09-04) place exactement là le trou : l'écran de conversion **ne convertit
rien**, il accuse réception.

Or tout ce qu'il faut pour dire la conséquence est déjà écrit et déjà branché
ailleurs : `loadRewardGrid` + `resolveSoloReward` + `nextSoloTier`
(`lib/rewards.ts`) alimentent le hero du dashboard et la carte « Cadeau visé »
du récap membre (`/api/orders/precheck`). Seul le visiteur n'y avait pas droit —
c'est-à-dire précisément celui qu'il faut convaincre.

## Décision

**Le cadeau est gagné avant qu'on demande quoi que ce soit, et c'est lui qui
paie chaque demande suivante.** Séquence retenue par le porteur (option A du
plan, `§2`) : **gain → compte → app → notifications → équipes**. Cet ADR livre
le premier maillon (le gain) et la formulation du second (le compte) ; le
repositionnement de l'app, des notifications et de la question d'équipe reste
le lot 6 du plan.

### 1. `/api/orders/parse-receipt` renvoie la conséquence, pas seulement la lecture

Deux champs s'ajoutent à la réponse, calculés depuis le **catalogue réel** de
l'établissement :

```jsonc
{ "reward": "Finest burger",                            // couche 1 atteinte, ou null
  "next_tier": { "item": "Menu 4 Tenders", "pct": 62 } } // ou null au palier max
```

**Couche 1 uniquement** — et ce n'est pas un raccourci d'implémentation :
c'est la seule couche due à un membre **sans équipe** (ADR 0034 §2), donc la
seule qu'un visiteur qui s'inscrit obtiendra réellement, et la seule qu'aucun
verrou invisible ne peut couper (ni double verrou ADR 0007, ni couverture
d'équipe ADR 0017 §3, ni plafond mensuel ADR 0012, qui laisse explicitement la
couche 1 active). Annoncer les couches 2 ou 3 à un visiteur serait annoncer un
cadeau qu'on ne peut pas tenir.

Calculé **pour tout appelant**, consommé côté visiteur : un membre connecté a
déjà la même carte via `/api/orders/precheck`, qui suit en plus le montant
corrigé à la main. La forme de la réponse ne dépend donc pas de
l'authentification — une réponse à géométrie variable selon la session est
exactement le genre de chose qui casse six mois plus tard.

**Best-effort strict** : grille non configurée, catalogue vide, panne Supabase →
`null` des deux côtés et l'écran retombe sur le montant lu. Jamais une erreur
pour un aperçu (même philosophie que le métering ADR 0029 §6 et l'archivage
ADR 0036 §1).

### 2. Ce que l'écran montre, dans cet ordre

`components/member/TicketGainCard.tsx` :

| Rang | Contenu | Pourquoi |
|---|---|---|
| 1 | **`+48` points**, en très gros | la seule unité que le client manipule (ADR 0028) |
| 2 | **le cadeau, nommé et illustré** — « Ton cadeau : Finest burger · À récupérer au comptoir » | la conséquence concrète, principe ADR 0010 (« conséquences, pas chiffres ») ; l'article s'affiche en grand via `lib/food-icon` |
| 2′ | *ou* « Prochain cadeau — {article} » + barre | sous le premier palier : une distance **nommée et courte** plutôt qu'un écran qui dit seulement « c'est enregistré » |
| 3 | « Lu sur ton ticket : 36,10 € », en petit et gris | la preuve de l'ADR 0045, rétrogradée |

Deux états, jamais un troisième : dans les deux cas le client repart avec
**quelque chose de nommé**.

### 3. Le montant reste affiché, mais rétrogradé — arbitrage euro

L'ADR 0028 §5 n'autorise l'euro côté client que pour la **saisie** du montant
du ticket (ingestion). L'ADR 0045 a livré un euro **affiché**, en gros, comme
preuve de lecture — un écart assumé mais jamais acté.

Il est acté ici, et resserré : le montant reste, mais il devient une **relecture
de l'ingestion** (« Lu sur ton ticket : … ») et non plus la nouvelle de l'écran.
Petit, gris, sous les points et sous le cadeau. Il répond à « est-ce que l'app a
bien lu **mon** ticket ? » — la question à laquelle un nombre de points ne
répond pas, parce que le client n'a rien pour le vérifier.

Ce qui reste interdit, inchangé : aucun **seuil** en euros, aucun **coût de
revient**, aucun **écart** chiffré vers le palier suivant. `pct` remplit une
barre, il n'est jamais rendu comme un chiffre lisible (même règle que le hero,
ADR 0028 §6).

### 4. Le mot « gagné » et l'ADR 0008

L'ADR 0008 interdit de promettre un cadeau comme acquis et bannit
« automatique » / « instantané » ; la validation reste différée et la
ré-analyse serveur reste l'unique source de vérité.

Formulation retenue (celle du plan, `§3` étape 2) : **« Ton cadeau : X · À
récupérer au comptoir. »** — affirmative et concrète, sans jamais dire
« validé », « vérifié », « automatique » ni « instantané ». De même les points
sont libellés **« points sur ce ticket »** et non « points gagnés » : ce que ce
ticket porte, sans affirmer qu'il est déjà crédité.

Le risque résiduel — un ticket qui part en file admin (ADR 0008) ou tombe sur
un cadeau déjà actif (ADR 0011) — est le même que celui que l'ADR 0043 a
explicitement accepté pour la landing, dans une situation moins favorable
(article tiré au hasard, avant tout scan). Ici l'article est celui que la
grille résoudra pour ce montant précis.

### 5. L'argument du compte devient le cadeau

« Connecte-toi pour **garder tes points** » → « Crée ton compte pour
**réclamer ton cadeau** » dès qu'un cadeau est atteint. Sans cadeau (petit
ticket, grille non configurée), les points restent l'argument — on ne fabrique
pas une promesse qui n'existe pas.

### 6. Le gain doit tenir au-dessus de la ligne de flottaison

Mesuré sur le rendu réel à **390 × 844** (Kraainem) : avec la consigne et le
repère 1-2-3 conservés, le bouton « Continuer avec Google » tombait à **901 px**
— hors écran. Un écran de conversion dont le CTA demande de scroller ne
convertit pas.

Deux blocs cèdent la place dès qu'une photo est là :

- le **repère 1-2-3** (« 1 photo · 2 compte · 3 cadeau au comptoir ») : la carte
  de gain dit désormais la même chose en concret, un cadeau nommé au lieu d'une
  promesse ;
- le **titre « Prends ton ticket en photo »** (4xl, deux lignes) côté visiteur :
  la consigne a fait son travail. Le **logo reste** — c'est le repère
  d'établissement, pas une consigne.

Résultat : bouton Google à **749 px**. Le basculement suit la présence de la
photo, pas la fin de l'analyse, pour ne pas faire sauter la mise en page au
milieu des 2 à 6 secondes d'OCR.

L'ADR 0030 §4 (« on ne cache jamais une fonctionnalité ») reste tenu : rien
n'est masqué ici, une **consigne accomplie est remplacée par son résultat**.

### 7. Palette verte fixe, jamais `brand_accent`

La carte de cadeau utilisait d'abord `bg-brand-gold/15` — le motif de la carte
« Cadeau visé » existante. Vérification sur le rendu réel : `brand_accent`
résout en **rouge pour Kraainem** (`lib/branding.ts`), donc un encadré **rose**
à l'endroit exact où l'on annonce une bonne nouvelle. Lu comme une alerte.

C'est la raison pour laquelle l'écran de succès porte déjà un dégradé vert
**en dur** plutôt que la charte de l'établissement. Même règle ici : la carte
de gain et sa barre de progression sont **vertes en dur**, indépendantes de la
charte. La charte garde ce qui lui revient — boutons, bordure de carte.

La carte « Cadeau visé » du récap membre (`precheck`) est alignée sur la même
palette : c'est le **même écran, à deux étapes d'intervalle** (aperçu visiteur
puis récap après connexion), et annoncer le même cadeau en vert puis en rose
serait pire que les deux séparément.

## Alternatives rejetées

- **Afficher les trois couches au visiteur.** Les couches 2 et 3 sont des
  cadeaux d'équipe : un visiteur n'a pas d'équipe (ADR 0034), et elles
  dépendent de verrous invisibles (0007/0012/0017). Promesse non tenable.
- **Retirer le montant complètement** (lecture stricte de l'ADR 0028). Le
  client perd le seul moyen de vérifier que l'app a lu son ticket, et l'ADR
  0045 perd sa raison d'être. On garde la preuve, on la range.
- **Chiffrer l'écart au palier suivant** (« plus que 4 € »). C'est un seuil en
  euros déduisible en une soustraction — interdit (0007/0028), et le hero a
  déjà tranché en faveur du qualitatif (`lib/hero-copy.ts`).
- **Ne calculer le gain que pour les appels anonymes** (économiser une requête
  pour les membres). Fait dépendre la forme de la réponse de la session ; le
  coût réel est une requête indexée derrière un appel Vision de 2 à 6 s.
- **Mettre le cadeau en cache entre l'aperçu anonyme et la reprise
  authentifiée.** Même arbitrage que l'ADR 0045 sur l'OCR : garder
  `SubmitOrderClient` simple plutôt que d'ajouter un cache d'aperçu.

## Conséquences

### Code
- `app/api/orders/parse-receipt/route.ts` : `reward` + `next_tier` dans la
  réponse (best-effort, `try/catch` silencieux).
- `components/member/TicketGainCard.tsx` (nouveau) : la carte de gain — points,
  cadeau, palier suivant, montant relu. Aucune donnée sensible, aucun appel
  réseau, palette verte en dur.
- `components/member/SubmitOrderClient.tsx` : la carte visiteur affiche
  `TicketGainCard` au lieu du montant seul ; l'argument du compte suit le
  cadeau ; le repère 1-2-3 et le titre visiteur s'effacent dès qu'une photo est
  là ; la carte « Cadeau visé » du récap passe au vert (§7).

### Coût
Une requête `reward_tiers` + `menu_items` par scan (`loadRewardGrid`, indexée
par `restaurant_id`), y compris pour les scans qui n'aboutissent pas. Sans
commune mesure avec l'appel Vision qui la précède.

### Mesure
Aucun événement ajouté : l'entonnoir à dix étages est le lot 3 du plan
(`funnel_events`, compteurs serveur — GA4 est aveugle sous Consent Mode,
ADR 0037). Les événements visiteur existants (`visitor_ticket_captured`,
`visitor_signup_started`) sont inchangés et suffisent à lire l'effet de ce lot :
le rapport « photo prise → départ vers la connexion » est exactement ce que cet
écran est censé déplacer.

### À surveiller
- Un cadeau nommé à l'aperçu puis **non délivré** (ticket en file admin, cadeau
  déjà actif ADR 0011) est le seul scénario de déception créé par cet ADR. À
  regarder sur `/platform/scans` : part des scans `parsed` sans commande.
- Si un établissement n'a **aucune grille solo configurée**, le visiteur ne voit
  que ses points — la configuration des paliers devient encore plus importante
  (même remarque que l'ADR 0040 sur le tour de bienvenue).
