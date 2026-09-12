# Crash test du parcours — référentiels existants et application au parcours actuel

**Date** : 2026-09-12 · **Périmètre** : parcours membre (vitrine → ticket → cadeau → retour).
**Statut** : document de travail, pas un ADR. Les décisions qui en sortiront feront leurs ADRs.

---

## 0. Réponse courte

Oui. Il existe trois familles de référentiels réutilisables, et on n'a rien à
inventer :

1. **Des heuristiques génériques d'interface** — la liste de Nielsen et les
   « lois UX ». Utiles, mais elles trouvent surtout des défauts d'ergonomie.
2. **Des modèles comportementaux propres aux programmes de fidélité** — effet de
   progression dotée, gradient de but, maximisation du médium, illusion du
   travail. **C'est là qu'est le gisement** : ce sont des résultats publiés,
   mesurés, sur exactement notre objet (cartes à tampons, paliers, points).
   Ils expliquent pourquoi un mécanisme juste sur le papier ne produit rien.
3. **Des protocoles de test à bas coût** — test des 5 secondes, test du premier
   clic, trunk test, RITE. Ils se passent de labo : 20 minutes, un téléphone,
   cinq personnes.

Ce document donne (§1) les référentiels, (§2) un protocole de crash test
réutilisable à chaque lot, (§3) **le crash test déjà appliqué au parcours
actuel** — treize constats, chacun avec sa preuve dans le code ou dans les
chiffres du pilote — et (§4) le backlog priorisé qui en découle.

Un mot sur la méthode : un référentiel ne remplace pas un utilisateur. Il sert à
**savoir où regarder** et à **nommer** ce qu'on voit, ce qui transforme « les
gens ne comprennent pas » en un défaut réparable. Les cinq vrais tests
utilisateurs restent à faire — le §2 dit comment, et sur quoi.

---

## 1. Les référentiels existants

### 1.1 Heuristiques génériques (le filet à gros trous)

**Les 10 heuristiques de Nielsen (1994)** — le standard de l'industrie.
Les quatre qui mordent le plus ici :

| Heuristique | Question à poser à chaque écran |
|---|---|
| Visibilité de l'état du système | À tout instant : où j'en suis, qu'est-ce qui se passe ? |
| Correspondance système ↔ monde réel | Le mot affiché est-il le mot du client, ou le nôtre ? |
| Reconnaissance plutôt que rappel | Faut-il se souvenir d'un écran précédent pour comprendre celui-ci ? |
| Cohérence et standards | Ce composant se comporte-t-il comme partout ailleurs ? |

**Les lois UX** utiles pour arbitrer vite :

- **Loi de Jakob** — les gens passent l'essentiel de leur temps sur *d'autres*
  applications. Ils attendent que la nôtre marche comme celles-là. Une barre de
  progression qui ne fait pas ce que font toutes les barres de progression est
  un bug, quelle que soit son exactitude interne.
- **Loi de Hick** — le temps de décision croît avec le nombre d'options. Un écran
  = une décision.
- **Seuil de Doherty** (IBM, ~400 ms) — en dessous, l'utilisateur reste dans le
  flux ; au-dessus, il décroche. Avec l'exception de l'illusion du travail (§1.2).
- **Loi de Tesler** — la complexité est conservée : ce que le système ne prend
  pas en charge, quelqu'un le prend en charge à la main. Si l'app ne dit pas au
  caissier ce qu'il doit faire, c'est le client qui devra le lui expliquer.
- **Effet Zeigarnik** — une tâche commencée et interrompue reste en tête. C'est
  ce qui fait marcher un cadeau « en attente » ; c'est aussi ce qui rend une
  barre figée insupportable.
- **Règle du pic-fin** (Kahneman) — un parcours est mémorisé par son moment le
  plus intense et par sa fin. Notre fin, c'est le comptoir.

### 1.2 Modèles comportementaux des programmes de fidélité (le gisement)

Ce sont des résultats publiés sur des dispositifs identiques au nôtre.

**Effet de progression dotée** — *Nunes & Drèze, Journal of Consumer Research,
2006.* Deux cartes de lavage auto strictement équivalentes : 8 tampons à
remplir, ou 10 tampons dont 2 déjà offerts. Taux d'achèvement : **19 % contre
34 %**, et les clients de la seconde reviennent plus vite. La conclusion est
contre-intuitive et robuste : **on ne démarre pas les gens à zéro**. Un compteur
qui commence à zéro est un compteur qu'on abandonne.

**Hypothèse du gradient de but** — *Kivetz, Urminsky & Zheng, Journal of
Marketing Research, 2006.* Sur une carte café, la fréquence d'achat **accélère à
mesure que la récompense approche**. Deux conséquences pour nous : (a) la
distance au but doit être **perceptible** pour produire l'accélération ; (b) une
progression illusoire mais visible marche aussi (c'est le même papier qui montre
l'effet d'une carte 12 cases avec 2 pré-tamponnées).

**Maximisation du médium** — *Hsee, Yu, Zhang & Zhang, JCR, 2003.* Les gens
travaillent pour un « médium » (des points) plutôt que pour l'issue réelle — mais
**seulement si le taux de change vers l'issue est lisible**. Un médium dont on
ne sait pas ce qu'il achète cesse de motiver. Un médium qui n'achète rien du tout
est pire qu'aucun médium : il apprend que les compteurs de l'app ne veulent rien
dire.

**Illusion du travail** — *Buell & Norton, Management Science, 2011.* Un
comparateur de vols qui **montre** son travail (« j'interroge telle compagnie… »)
est jugé de meilleure qualité qu'un comparateur instantané — l'attente devient
un signal d'effort. Condition : il faut **montrer**, pas faire patienter. Un
sablier muet ne perçoit aucun bénéfice, il ne paie que le coût.

**Aversion à la perte** (Kahneman & Tversky) — perdre pèse environ deux fois plus
que gagner. Une fenêtre de récupération l'exploite. Mais au-delà d'un certain
empilement de conditions, le dispositif bascule de « urgence » à « piège », et ce
qui se perd alors est la confiance, pas le cadeau.

**Justice procédurale / équité perçue des barèmes** — un barème sévère mais
énoncé est mieux accepté qu'un barème généreux mais opaque. Un client qui ne
peut pas reconstituer la règle suppose qu'elle joue contre lui.

**Preuve sociale** (Cialdini) — un classement, un nombre de membres, un « X
personnes ici cette semaine ». Puissant et quasi gratuit ; contre-productif
quand les nombres affichés sont petits.

**Modèle du crochet** (Eyal : déclencheur → action → récompense variable →
investissement) et **renforcement intermittent** — la part de **variabilité**
dans la récompense est le principal levier de rétention. Un barème entièrement
déterministe est prévisible : juste, mais plat.

### 1.3 Catalogues de frictions déjà codifiées

- **Baymard Institute** — recherche systématique sur les tunnels e-commerce et
  la saisie mobile (formulaires, création de compte, champs, claviers). Ce qui
  nous concerne : *tout compte demandé avant la valeur coûte une part majeure du
  tunnel*, et *un champ en trop sur mobile se paie en abandon*.
- **Nielsen Norman Group** — mobile onboarding, « les gens ne lisent pas, ils
  balayent », modales et interruptions.
- **WCAG 2.2** — contraste, cible tactile ≥ 44 px, focus visible. À la fois une
  obligation et un filet à défauts de lisibilité au comptoir, debout, à une main.

### 1.4 Protocoles de test à bas coût

| Protocole | Ce qu'il mesure | Coût |
|---|---|---|
| **Test des 5 secondes** | Après 5 s sur la vitrine : où suis-je, qu'est-ce que je gagne, que dois-je faire ? | 2 min/personne |
| **Test du premier clic** | Le premier geste est-il le bon ? (fortement prédictif de la réussite globale) | 2 min |
| **Trunk test** (Krug) | Lâché sur un écran au hasard : je sais où je suis, comment revenir, quoi faire ? | 5 min |
| **Restitution à voix haute** | On fait raconter la règle par le client. Tout écart = un défaut de formulation. | 5 min |
| **SUS** (Brooke) | Score d'utilisabilité comparable dans le temps (68 = moyenne de l'industrie) | 10 questions |
| **RITE** | On corrige entre deux participants au lieu d'attendre la fin de la série | — |
| **Sondage Sean Ellis** | « Déçu si l'app disparaissait ? » — seuil usuel : 40 % de « très déçu » | 1 question |

---

## 2. Le protocole de crash test (réutilisable)

L'idée : ne pas tester avec un persona marketing bienveillant, mais avec des
**casseurs**. Chacun a une hypothèse de rupture et un critère de réussite
observable. Un passage complet = ~2 h à deux.

### 2.1 Les six casseurs

| # | Casseur | Contexte | Ce qu'il casse |
|---|---|---|---|
| **A** | **Le client debout** | Au comptoir, 90 s, une main, sac dans l'autre, 4G du resto | Tout écran qui demande à lire, à taper, ou à sortir de l'app |
| **B** | **Le sceptique** | « C'est quoi le piège ? Vous voulez quoi, mes données ? » | Toute promesse non tenue, toute condition découverte après coup |
| **C** | **Le calculateur** | Compare deux tickets, reconstitue le barème, teste les bornes | Tout barème non linéaire non expliqué, toute règle invisible |
| **D** | **Le revenant** | Revient 3 semaines après, a tout oublié, a changé de téléphone | Tout ce qui suppose une mémoire de la visite précédente |
| **E** | **Le caissier** | N'a pas installé l'app, a 6 clients en file, n'a pas lu la note | Tout ce qui suppose que le personnel sait quelque chose |
| **F** | **Le tricheur** | Deux comptes, photo d'une photo, ticket d'un ami, ticket d'hier | Les verrous anti-fraude et leurs messages d'erreur |

### 2.2 La grille — quatre questions par écran

Sur **chaque** écran du parcours, on répond par oui / non / à moitié :

1. **Où suis-je ?** (l'établissement est-il identifié, le programme reconnu ?)
2. **Qu'est-ce que je gagne ?** (nommé, concret, atteignable — pas une mécanique)
3. **Que dois-je faire, là, maintenant ?** (une seule action évidente)
4. **Qu'est-ce que ça m'a coûté ?** (secondes, taps, champs, sorties de l'app)

Un « non » sur la 2 ou la 3 est bloquant. Un « à moitié » sur la 1 se paie au
retour (casseur D).

### 2.3 Les scénarios à exécuter

1. **Le tunnel nominal** (A) — QR → photo → compte Google → ticket envoyé.
   *Critère* : < 90 s, zéro sortie de l'app, zéro champ tapé hors mot de passe.
2. **Le tunnel e-mail** (A) — le même sans compte Google. *Critère* : même
   chose. (cf. constat **C8**)
3. **La restitution** (B/C) — après le premier ticket, faire expliquer par le
   client : qu'est-ce que j'ai gagné, comment je le récupère, quand ça expire.
   *Critère* : trois réponses justes. **Aujourd'hui c'est le test à faire en
   premier** — c'est lui qui mesure l'écart dont on parle.
4. **Deux tickets d'affilée** (C) — un €22 puis un €12. *Critère* : le client ne
   se sent pas volé quand la barre recule. (cf. **C2**)
5. **Le retour au comptoir** (E) — le client tend son téléphone, chronomètre en
   marche. *Critère* : cadeau remis en < 60 s sans que le client explique le
   programme. (cf. **C6**)
6. **Le revenant** (D) — rouvrir l'app 3 semaines après, sans notification.
   *Critère* : il sait en 5 s ce qu'il a et ce qu'il doit faire.
7. **Les verrous** (F) — doublon, photo de photo, montant hors bornes.
   *Critère* : le refus est compréhensible et ne ressemble pas à une accusation.

### 2.4 Quand le refaire

Les compteurs d'entonnoir (`funnel_events`, ADR 0051) disent **où** ça tombe.
Le crash test dit **pourquoi**. Les deux ensemble, pas l'un sans l'autre :

- un décrochage repéré dans `funnel_events` → on rejoue le scénario correspondant ;
- à chaque lot qui touche un écran du tunnel → scénarios 1, 3 et 6 avant la PR.

---

## 3. Le crash test appliqué au parcours actuel

Treize constats. Chacun porte sa preuve : un fichier, un ADR, ou un chiffre du
pilote Kraainem. Ce ne sont pas des opinions de style — chacun se vérifie.

### 🔴 C1 — La vitrine promet trois couches, le système n'en garantit qu'une

**Preuve.** `app/r/[restaurantId]/page.tsx` affiche `getLandingTierPreview()`,
soit **trois lignes** : un article « Lors de prochaines commandes » (couche 1),
un « En cumulant avec ta communauté » (couche 2), un « En cumulant dans ta
réserve » (réserve). Or l'ADR 0034 §2 pose qu'un membre **sans équipe** n'a droit
qu'à la couche 1 — et à Kraainem `restaurants.teams_hidden = true`, donc la
couche 2 est **structurellement hors d'atteinte**. L'ADR 0048 a tranché ce point
mot pour mot, mais seulement pour l'écran visiteur : *« Annoncer les couches 2 ou
3 à un visiteur serait annoncer un cadeau qu'on ne peut pas tenir. »*
La vitrine, en amont, fait exactement cela.

**Aggravant.** `buildTierPreview()` tire l'article **au hasard** dans le tertile
de prix — ce n'est jamais le cadeau réellement assigné (risque documenté et
assumé par l'ADR 0043). Donc la variabilité, qui est le levier de rétention le
plus fort (§1.2), est placée là où elle produit une déception, et absente là où
elle produirait un effet.

**Modèle.** Violation d'attente. C'est le premier moteur de déception, très
au-dessus de tout défaut d'ergonomie — et c'est exactement le symptôme décrit
(« on pensait que les gens allaient comprendre, pas du tout »).

**Correction.** Étendre la règle de l'ADR 0048 à la vitrine : la couche 1 nommée
(elle, on la tient), les autres évoquées **sans nom d'article** (« et plus, en
jouant avec ta communauté ») — et masquées quand `teams_hidden`. Déplacer la
variabilité du côté de la remise réelle, dans le plafond de l'ADR 0017.

### 🔴 C2 — Deux barres de progression qui ne mesurent pas la même chose

**Preuve.** `nextSoloTier(grid, amount)` (`lib/rewards.ts:179`) calcule
`pct = (montant − borne basse) / (borne haute − borne basse)`. C'est la position
**d'un ticket** dans sa tranche, pas un cumul. Deux endroits l'affichent :

- écran de succès : le pourcentage **du ticket qui vient d'être envoyé** ;
- hero du dashboard : `previewAmt = max(15, round(panier moyen))`
  (`dashboard/page.tsx:175`), donc la position d'un ticket **hypothétique**.

Juste au-dessus, sur le même écran, « **Tes points** » affiche un **cumul**
(`totalPoints`, somme de tous les tickets).

**Modèle.** Loi de Jakob. Partout ailleurs — carte à tampons, jauge de profil,
barre de téléchargement — une barre **accumule**. Le membre lit « il me manque
38 % » et croit que sa prochaine commande **s'ajoute**. Elle ne s'ajoute pas.

**Conséquences concrètes.** (a) Un €22 puis un €12 : la barre **recule**. Sur une
jauge qu'on croit cumulative, c'est vécu comme un vol. (b) Le hero étant assis
sur le panier *moyen*, un membre régulier voit une barre qui **ne bouge jamais**,
quoi qu'il fasse. Une jauge immobile enseigne que les actions n'ont pas d'effet :
c'est l'inverse du gradient de but (§1.2), et une violation frontale de la
première heuristique de Nielsen.

**Correction.** Ne jamais appeler « progression » ce qui n'accumule pas. Soit on
change le libellé (« Ce ticket-ci » / « Un ticket de plus de X et c'est
{article} »), soit — décision produit, donc ADR — on rend la couche 1 réellement
cumulative. **C'est le constat n° 1 à traiter** : il est peu coûteux et il touche
les deux écrans les plus vus.

### 🔴 C3 — Trois monnaies, dont la plus visible n'achète rien

**Preuve.** Le membre voit successivement : « Tes points » (cumul personnel, le
plus gros chiffre du dashboard), les « pts » du score d'équipe (classement), les
« jetons » (4 = 1 cadeau), et « Ma réserve » (points bancables). Le glossaire
(`CONTEXT.md`) porte une règle anti-collision explicite — *« Ma réserve » — jamais
« points » seuls* — ce qui prouve que la collision est connue et non résolue.

Et surtout : **« Tes points » ne s'échange contre rien.** La réserve ne se
remplit qu'en **renonçant** à un cadeau disponible (ADR 0021).

**Modèle.** Maximisation du médium. Un médium ne motive que si son taux de change
est lisible. Ici le chiffre le plus gros de l'écran est celui qui n'achète rien —
et pour en obtenir un qui achète, il faut refuser un cadeau. En deux ou trois
visites, le compteur cesse d'être regardé.

**Correction.** Un seul compteur visible côté membre. Soit « Tes points »
devient la réserve (une monnaie, dépensable), soit il cesse d'être l'élément
dominant du dashboard. Décision produit → ADR.

### 🟠 C4 — Tout le monde démarre à zéro

**Preuve.** Aucun crédit initial nulle part : un nouveau membre voit 0 point et
une barre à 0 (ou à son panier moyen, cf. C2).

**Modèle.** Effet de progression dotée — **34 % contre 19 %** d'achèvement dans
Nunes & Drèze. C'est le levier le mieux documenté du secteur, et il ne coûte
qu'une ligne.

**Correction.** Créditer une avance à l'adhésion (« on t'a déjà mis X points
d'avance ») et la **dire**. À câbler sur la réserve, pas sur la couche 1 : la
couche 1 déclenche un cadeau réel, donc un coût (ADR 0012/0017), là où les points
de réserve sont dimensionnables sans toucher au plafond budget.

### 🟠 C5 — Le délai de 3–5 s ne montre rien

**Preuve.** `SubmitOrderClient.tsx` affiche « Vérification en cours... » pendant
le délai artificiel (ADR 0008). Un libellé, pas de contenu.

**Modèle.** Illusion du travail (Buell & Norton). Montrer le travail **augmente**
la valeur perçue ; faire patienter sans rien montrer ne paie que le coût. On paie
aujourd'hui le prix complet du délai sans encaisser son bénéfice.

**Correction.** Trois lignes qui s'allument l'une après l'autre pendant les mêmes
3–5 s : « Lecture du ticket » → « Contrôle du {libellé de clé} » → « Vérification
anti-doublon ». Zéro risque ADR 0008 : on ne prononce ni « automatique » ni
« instantané », on renforce même la perception de vérification sérieuse.

### 🔴 C6 — La fin du parcours repose sur un humain que rien n'outille

**Preuve.** Pilote Kraainem (ADR 0050) : **6 coupons ouverts, 0 remise
confirmée**. Le membre déclenche un compte à rebours de 10 minutes, puis tend son
téléphone à un caissier qui doit (a) savoir ce qu'est ce programme, (b) ouvrir
`/admin/coupon/[token]`, (c) contrôler le minimum de 10 €. Rien dans l'app ne
l'y prépare. L'ADR 0053 a outillé le personnel pour l'**acquisition**
(page-badge, phrase à dire) — **rien** pour la **remise**.

**Modèle.** Loi de Tesler : la complexité non prise en charge retombe sur
quelqu'un — ici, sur le client, qui doit expliquer le programme à l'employé au
moment même où il vient chercher sa récompense. Et règle du pic-fin : c'est **la
fin** du parcours, donc ce qui en sera mémorisé.

**Correction.** Le pendant « remise » de l'ADR 0053 : une page-badge caissier
(que faire quand un client montre un écran avec un compte à rebours), et/ou une
file « cadeaux à remettre aujourd'hui » côté console, atteignable sans token.
**C'est le seul moment où le programme tient sa promesse** — il n'est outillé
nulle part. Priorité absolue.

### 🟠 C7 — Le barème de points est concave et jamais expliqué

**Preuve.** `lib/points-model.ts` : `pts = round(20 + 4 × montant^0,6)`.
Soit 10 € → 36 pts, 25 € → 48, 50 € → 62, 100 € → 83. Le taux €→points passe de
3,6 à 0,83.

**Modèle.** Équité perçue. Le casseur C (le calculateur) constate qu'un ticket
5× plus gros rapporte **moins du double**. La formule est un bon choix produit —
elle récompense la fréquence autant que la dépense (ADR 0028) — mais tant que le
`BASE = 20` n'est pas nommé, elle se lit comme une arnaque. Une règle qu'on ne
peut pas reconstituer est supposée jouer contre soi.

**Correction.** Nommer le bonus de visite : « +20 rien que pour être passé, + ce
que rapporte ton ticket ». Aucun euro divulgué, aucune inversion possible (c'est
la concavité qui protège, pas le silence) — et une règle sévère devient une règle
généreuse, à barème strictement identique.

### 🟠 C8 — Le tunnel e-mail casse encore au comptoir

**Preuve.** `app/(auth)/signup/page.tsx` gère explicitement le cas
« *Email confirmation required → attendre la confirmation* » et affiche « Un lien
de confirmation a été envoyé à… ». C'est précisément le parcours que l'ADR 0040
voulait supprimer (*« sortir de l'app, ouvrir sa boîte, revenir »*), toujours
vivant pour quiconque ne passe pas par Google. Pendant ce temps la photo dort en
IndexedDB, **30 minutes** (`lib/pending-ticket.ts`).

**Correction.** Deux options, à trancher : désactiver la confirmation e-mail côté
Supabase (le consentement est déjà journalisé, le ticket est de toute façon
re-vérifié serveur — l'anti-fraude ne repose pas sur l'e-mail), ou assumer que
Google est la seule voie au comptoir et rendre l'alternative e-mail nettement
plus discrète. Dans les deux cas, mesurer : c'est un étage entier de
`funnel_events` (`signup_started` → `signup_completed`).

### 🟠 C9 — Les équipes sont masquées à un seul endroit sur cinq

**Preuve.** `getTeamsHidden()` n'est appelé que dans **deux** endroits :
`app/r/[restaurantId]/page.tsx:114` (bloc Top 5) et `getTeamPrompt()`
(`lib/teams.ts:337`). Restent visibles, non filtrés, chez un établissement qui a
demandé à masquer le concept :

- la carte vitrine « En cumulant avec ta communauté » (C1) ;
- le bloc dashboard « Pas encore d'équipe → Rejoindre une équipe » ;
- le CTA de l'écran de succès « Rejoindre une équipe · Pour gagner encore plus
  de cadeaux » ;
- la page `/my-team` et l'entrée de navigation.

**Modèle.** Cohérence (Nielsen). Un concept à moitié caché est pire que caché ou
assumé : le membre voit une porte, la pousse, et trouve un dispositif que le
restaurateur a lui-même jugé inopportun.

**Correction.** `teams_hidden` doit être un **interrupteur unique** traversant
toutes les surfaces membre, pas un filtre sur un bloc. Au passage : le fait que
le seul établissement vivant ait demandé à masquer les équipes est un signal
produit qui mérite d'être regardé pour lui-même — deux couches de récompense sur
trois en dépendent.

### 🟡 C10 — Aucune variabilité dans la récompense réelle

**Preuve.** La grille (`reward_tiers`) est entièrement déterministe : à montant
donné, article connu. La seule variabilité du système est… sur la vitrine
(`buildTierPreview` tire au hasard), donc sur la promesse et non sur le cadeau
(cf. C1).

**Modèle.** Renforcement intermittent / modèle du crochet — la part de variabilité
est le levier de rétention dominant. Un barème plat est juste et prévisible ; il
ne crée aucune raison de revenir *plus tôt*.

**Correction.** Introduire une variabilité **honnête et bornée** : à palier
atteint, l'article remis est tiré parmi ceux du palier qui respectent le plafond
de l'ADR 0017 — « surprise » côté client, coût inchangé côté restaurateur. Pas de
loterie, pas de hasard sur le *fait* de gagner : seulement sur *quoi*.

### 🟡 C11 — La vitrine énonce la mécanique, pas le bénéfice

**Preuve.** Titre en 5xl : « Transformer son ticket en récompenses ». Une
tournure à l'infinitif qui décrit **le procédé**. Le bénéfice concret (un article
nommé) arrive dans la carte, sous la ligne de flottaison sur un écran de 390 px.

**Modèle.** Test des 5 secondes. Question 2 de la grille (« qu'est-ce que je
gagne ? ») : la réponse existe, mais pas dans les 5 premières secondes.

**Correction.** Le nom de l'article de couche 1 dans le titre ou juste dessous.
À valider par un test des 5 secondes sur cinq personnes — c'est exactement le
type d'arbitrage qu'on ne doit pas trancher au jugé.

### 🟡 C12 — Le libellé « bonus communautaire » / « bonus d'équipe » est du vocabulaire interne

**Preuve.** Le dashboard et `/my-rewards` étiquettent les trois lignes
« cadeau de base », « bonus communautaire », « bonus d'équipe ». Un membre ne
distingue pas les deux dernières, et la distinction ne lui sert à rien : il ne
peut agir sur aucune des deux différemment.

**Modèle.** Correspondance système ↔ monde réel (Nielsen). Ces libellés nomment
**notre architecture** (les trois couches de l'ADR 0006), pas l'expérience du
client.

**Correction.** Étiqueter par la **cause** vue du client : « parce que ton ticket
dépassait X », « parce que ton équipe a franchi un palier ». Ou ne rien étiqueter
du tout et lister les articles — l'information de couche ne sert qu'à nous.

### 🟡 C13 — On mesure les franchissements, jamais la compréhension

**Preuve.** `funnel_events` (ADR 0051) compte dix étages. C'est une excellente
base et elle règle le problème du consentement — mais un décrochage entre deux
étages ne dit **jamais** pourquoi.

**Correction.** C'est précisément le rôle du §2. Rien à coder : le scénario 3
(restitution à voix haute) sur cinq clients dira en une heure ce que six semaines
de compteurs ne diront pas.

---

## 4. Backlog priorisé

Priorité = impact ÷ effort, dans l'esprit de l'ADR 0033 (calculée, pas saisie).

| # | Chantier | Constats | Impact | Effort | Nature |
|---|---|---|---|---|---|
| 1 | **Outiller la remise au comptoir** (page-badge caissier + file « à remettre ») | C6 | 5 | 2 | ADR + code |
| 2 | **Aligner la vitrine sur ce qu'on tient** (couche 1 nommée, reste sans article, respect de `teams_hidden`) | C1, C9 | 5 | 1 | code |
| 3 | **Barres de progression : dire ce qu'elles mesurent** | C2 | 5 | 1 | code (ADR si on passe au cumul) |
| 4 | **`teams_hidden` = interrupteur unique, toutes surfaces** | C9 | 4 | 1 | code |
| 5 | **Nommer le bonus de visite** (+20 par passage) | C7 | 4 | 1 | copie |
| 6 | **Montrer le travail pendant les 3–5 s** | C5 | 3 | 1 | code |
| 7 | **Exécuter le crash test** (scénarios 1, 3, 5, 6 — cinq personnes) | C13 | 5 | 2 | terrain |
| 8 | **Progression dotée à l'adhésion** | C4 | 4 | 2 | ADR + code |
| 9 | **Une seule monnaie visible** | C3 | 5 | 4 | ADR (décision produit) |
| 10 | **Trancher le tunnel e-mail** | C8 | 3 | 2 | config + code |
| 11 | **Libellés par cause, pas par couche** | C12 | 2 | 1 | copie |
| 12 | **Variabilité bornée du cadeau remis** | C10 | 3 | 3 | ADR + code |
| 13 | **Titre de vitrine (à valider en test 5 s)** | C11 | 3 | 1 | copie |

Les lignes 2 à 6 et 11 et 13 sont des corrections de **formulation et de
cohérence** : une journée à deux, sans migration, sans décision produit. Elles
règlent l'essentiel de l'écart « on pensait qu'ils comprendraient ».

Les lignes 1, 8, 9 et 12 sont des **décisions produit** : elles passent par un ADR.

La ligne 7 n'attend aucune des autres — et c'est elle qui dira si ce document a
vu juste.

---

## 5. Ce qu'il ne faut pas casser

Le crash test trouve des défauts ; il faut aussi nommer ce qui est déjà juste,
pour ne pas le perdre au prochain lot :

- **La séquence gain → compte → app → notifications → équipes** (ADR 0048/0049)
  est exactement la bonne : chaque demande est payée par un gain déjà acquis.
  C'est rare et c'est ce qui rend les constats ci-dessus réparables à peu de frais.
- **Le compte demandé au premier ticket, jamais avant** (ADR 0040) — conforme à
  tout ce que dit la recherche sur les tunnels.
- **Les compteurs serveur sans identifiant** (ADR 0037/0051) — on a une mesure
  qui ne dépend pas du consentement. Peu d'équipes de cette taille l'ont.
- **La capture en un tap** qui ouvre directement l'appareil photo.
- **Le cadeau nommé et illustré** plutôt que décrit — c'est la bonne façon de
  dire une récompense.

---

## Sources

- Nielsen, J. (1994). *10 Usability Heuristics for User Interface Design.*
- Nunes, J. C. & Drèze, X. (2006). « The Endowed Progress Effect: How Artificial
  Advancement Increases Effort. » *Journal of Consumer Research*, 32(4).
- Kivetz, R., Urminsky, O. & Zheng, Y. (2006). « The Goal-Gradient Hypothesis
  Resurrected. » *Journal of Marketing Research*, 43(1).
- Hsee, C. K., Yu, F., Zhang, J. & Zhang, Y. (2003). « Medium Maximization. »
  *Journal of Consumer Research*, 30(1).
- Buell, R. W. & Norton, M. I. (2011). « The Labor Illusion: How Operational
  Transparency Increases Perceived Value. » *Management Science*, 57(9).
- Kahneman, D. & Tversky, A. (1979). « Prospect Theory. » *Econometrica*, 47(2).
- Cialdini, R. (1984). *Influence.*
- Krug, S. (2000). *Don't Make Me Think.*
- Shostack, G. L. (1984). « Designing Services That Deliver. » *HBR* — service blueprint.
- Eyal, N. (2014). *Hooked.*
- Baymard Institute — recherche sur les tunnels e-commerce et la saisie mobile.
- Nielsen Norman Group — mobile onboarding, lecture en balayage.
- Brooke, J. (1996). *SUS: A Quick and Dirty Usability Scale.*
