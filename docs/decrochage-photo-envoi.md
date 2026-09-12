# Le décrochage photo → envoi

**Date** : 2026-09-12 · **Question posée** : pourquoi tant de gens photographient
un ticket sans l'envoyer, et pourquoi y a-t-il plus d'inscrits que de tickets ?
**Complément à** `docs/crash-test-parcours.md`, qui traite la compréhension et le
comptoir — pas ce décrochage-ci.

---

## 0. Le renversement de méthode

La demande était : « confronter le parcours à toutes les possibilités de
comportement imprévisible ». On ne peut pas, et il ne faut pas essayer :
l'espace des comportements est infini, celui des **endroits où un comportement
peut diverger** ne l'est pas. Ce sont les **points de décision** — chaque endroit
où l'app attend un geste que le client doit inventer.

Entre « j'ai pris la photo » et « c'est envoyé », il y a aujourd'hui **entre un et
cinq points de décision selon le chemin**. La cible est zéro. Tout ce document
tient là-dedans.

Et le référentiel le plus utile n'est pas une base académique : c'est **la liste
des applications que le client a déjà utilisées cette semaine**. Il n'invente pas
un comportement, il **rejoue celui qu'il connaît** (loi de Jakob). Voir §3.

---

## 1. La mesure qui tranche — à faire avant toute correction

**La tuile « abandonnés » de `/platform/scans` additionne trois populations qui
n'ont rien à voir** (`app/platform/scans/page.tsx:171-173` : le compte se fait sur
`outcome`, sans regarder `user_id`). Or depuis la migration
`20260907-1930-receipt-scans-visiteur.sql`, `receipt_scans.user_id` est nullable :
les scans de visiteurs anonymes sont dans la même table que ceux des membres.

```sql
SELECT
  CASE WHEN user_id IS NULL THEN 'visiteur sans compte' ELSE 'membre connecté' END AS qui,
  outcome,
  count(*) AS n
FROM receipt_scans
WHERE restaurant_id = 'kraainem'
GROUP BY 1, 2
ORDER BY 1, 2;
```

Trois lectures, trois chantiers **différents** :

| Ligne | Ce que c'est vraiment | Chantier |
|---|---|---|
| `visiteur` · `parsed` | **Pas un abandon : un mur.** Un visiteur n'a aucun bouton d'envoi — il ne *peut pas* soumettre (§2, S4). | Le compte |
| `membre` · `parsed` | **Le vrai abandon.** Il avait le formulaire sous les yeux et n'a pas appuyé. | L'écran d'envoi (S1·S2·S3) |
| `*` · `header_rejected` | **Un refus de l'app**, pas un abandon du client. | La lecture (S7) |

Tant que ces trois chiffres sont additionnés, on optimise à l'aveugle. Le split
coûte une ligne dans le calcul des tuiles — **c'est la première chose à faire.**

Même remarque pour « plus d'inscrits que de tickets » : §2, S5 montre que
l'asymétrie est en partie **fabriquée par la vitrine**, pas subie.

---

## 2. Les sept points de rupture

### 🔴 S1 — L'écran annonce le gain avant que le ticket soit parti

**Preuve.** `SubmitOrderClient.tsx` : dès que `parseStatus === "done"`, le membre
voit une carte **verte** — « Cadeau visé · *Finest burger* · À récupérer au
comptoir après validation » — avec le montant lu, le numéro de commande rempli,
et l'illustration du plat. Tout, sur cet écran, dit que c'est fait. Le ticket,
lui, n'est **pas** parti : il faut encore appuyer sur « Envoyer mon ticket »,
plus bas.

**Modèle.** Gouffre d'évaluation (Norman) : l'état du système (« brouillon non
envoyé ») et le signal rendu à l'utilisateur (« gagné, vert, nommé ») se
contredisent. **Les gens ne partent pas sur les difficultés, ils partent sur les
signaux d'aboutissement.** C'est le mécanisme qui explique le mieux un
`outcome = 'parsed'` avec un montant parfaitement lu : le client n'a pas
renoncé, il a cru avoir fini.

**Aggravant.** Le vert est réservé ailleurs dans le code à l'écran de succès
*après* envoi (`success_validated`). La même couleur sert donc deux états
opposés.

**Correction.** Tant que le ticket n'est pas parti, rien sur cet écran ne doit
ressembler à une victoire : pas de vert, pas de « cadeau visé » au passé, un
libellé qui dit l'état réel (« Ce ticket vaut {article} — envoie-le pour le
réclamer »). Et idéalement : supprimer l'étape (§4).

### 🔴 S2 — Le bouton d'envoi est probablement sous la ligne de flottaison

**Preuve.** Sur l'écran membre, dans l'ordre : logo + titre 4xl, zone photo avec
aperçu `max-h-56` (224 px) + deux boutons « Reprendre / Autre photo », puis
éventuels bandeaux d'avertissement, puis la carte récap (2 lignes), puis la
carte « Cadeau visé », **puis** le bouton. Le bouton d'envoi est le dernier
élément d'une pile qui dépasse très probablement la hauteur d'un écran de
390 × 844.

Combiné à S1 : le client a déjà eu sa bonne nouvelle, il n'a **aucune raison de
scroller**.

**À mesurer, pas à supposer** — et l'équipe sait déjà le faire : l'ADR 0048 note
« *mesuré à 390 × 844 : bouton Google à 901 px, 749 px sans elle* ». Même mesure,
sur « Envoyer mon ticket », dans les quatre cas (montant lu / non lu, numéro lu /
non lu).

**Aggravant.** Quand le montant n'est pas lu, l'input s'ouvre avec `autoFocus` :
le clavier logiciel surgit et repousse encore le bouton.

### 🔴 S3 — Le geste ne ressemble à aucun geste que le client connaît

**Preuve.** Voir le tableau du §3. Dans **toutes** les applications où une photo
sert de preuve et que le client utilise déjà, la photo **est** l'envoi. Aucune ne
demande une photo, puis affiche un formulaire, puis attend un second geste.

**Modèle.** Loi de Jakob. Le client ne lit pas notre écran : il rejoue le modèle
qu'il a en tête — « photo prise = c'est envoyé ». Notre modèle réel est « photo
prise = brouillon », et **rien à l'écran ne le lui dit** (voir S1, qui dit même le
contraire).

**Correction.** Aligner le modèle sur celui qu'ils ont, pas l'inverse (§4).

### 🔴 S4 — Le visiteur ne peut structurellement pas envoyer

**Preuve.** Le formulaire est rendu sous la condition
`parseStatus === "done" && !visitor`. Un visiteur n'a donc **aucun** bouton
d'envoi : il a une carte de gain et deux boutons de connexion. Sa photo est
retenue en IndexedDB (30 min) le temps qu'il crée un compte, revienne par
`?resume=1`, et appuie *alors* sur « Envoyer mon ticket ».

**Conséquence directe sur la mesure.** Toute ligne `user_id IS NULL` +
`outcome = 'parsed'` est un visiteur qui a buté sur le mur du compte — **pas** un
client qui a renoncé à envoyer. La compter comme un abandon d'envoi envoie
corriger le mauvais écran.

**Chaîne de survie à vérifier une par une** : la photo tient 30 min en IndexedDB ;
sur iOS, ajouter le site à l'écran d'accueil crée un **conteneur de stockage
séparé** (l'ADR 0049 l'a déjà écrit pour l'app) — donc un visiteur qui installe
l'app avant de revenir **perd sa photo** ; la navigation privée la perd aussi ;
un aller-retour OAuth qui change de navigateur la perd aussi.

### 🔴 S5 — L'asymétrie inscrits > tickets est en partie fabriquée par la vitrine

**Preuve.** `app/r/[restaurantId]/page.tsx` comporte **trois** portes, dont deux
créent un membre sans ticket :

1. en haut : « J'ai un ticket — je le scanne » (`ScanTicketCta`) ✅
2. en bas, bloc rouge plein écran : « **Pas encore de ticket ?** Installe déjà
   l'application, il y a déjà des points à gagner » → « S'inscrire directement → »
3. la variante connecté-non-membre : « Je rejoins ma communauté → »

L'ADR 0040 a mis le compte au premier ticket précisément pour ne plus fabriquer
de membres vides. Le pied de page rouvre la porte qu'il a fermée — et l'ADR 0053
(QR nominatif du personnel) envoie tout le monde sur cette même vitrine, où un
serveur pousse naturellement « inscris-toi ».

**Aggravant (promesse fausse).** « il y a déjà des points à gagner » : sans
ticket, ce qu'on gagne ce sont des **jetons** (micro-récompenses sociales), pas
des points. Le mot est faux au sens du glossaire — et c'est exactement la
confusion de monnaies décrite en C3 de l'autre document.

**Correction.** Une seule porte sur la vitrine : le ticket. L'inscription sans
ticket, si on la garde, cesse d'être un bloc rouge pleine largeur et devient une
sortie discrète — et elle dit la vérité sur ce qu'on y gagne.

### 🟠 S6 — Le retour après création de compte est un second sommet de risque

**Preuve.** Chemin visiteur complet : photo → carte de gain → « Crée ton compte
pour **réclamer ton cadeau** » → OAuth → `?resume=1` → photo rechargée → analyse
relancée → **et il faut encore appuyer sur « Envoyer mon ticket »**.

**Modèle.** Le même aboutissement prématuré qu'en S1, en plus fort : on lui a dit
que le compte servait à *réclamer son cadeau*. Compte créé ⇒ cadeau réclamé, dans
sa tête. L'écran qui suit lui redemande un geste dont la raison a déjà été
consommée.

**Correction.** Après une reprise `?resume=1` sur un ticket déjà lu et non
ambigu, l'envoi doit partir **seul** — le client vient de payer le prix fort, on
ne lui redemande rien.

### 🟠 S7 — Une lecture ratée ferme complètement la porte

**Preuve.** Si `/api/orders/parse-receipt` répond en erreur (en-tête non reconnu,
413 photo trop lourde, 502, timeout), le client passe en `parseStatus = "error"`
— et le formulaire, conditionné à `parseStatus === "done"`, **n'apparaît jamais**.
Les seules sorties sont « Réessayer l'analyse » et reprendre la photo. Un membre
dont le ticket résiste à la lecture est **enfermé** : il ne peut pas envoyer, même
en acceptant une vérification manuelle.

C'est incohérent avec le chemin voisin, déjà prévu et déjà écrit : quand le
numéro de commande manque, le message dit « laisse vide — ta commande sera
vérifiée manuellement sous 2h ». Cette porte de sortie existe pour un champ
manquant, pas pour une lecture ratée.

**Correction.** Toujours offrir l'envoi manuel : montant saisi à la main, photo
jointe, file d'arbitrage. Le serveur ré-analyse de toute façon (voir §4) — rien
n'est affaibli. Et ces cas-là sortent alors de la statistique d'abandon, où ils
n'ont rien à faire.

---

## 3. Le référentiel qui sert vraiment : ce que le client fait déjà

Les collections formalisées existent et sont utiles : **Baymard Institute**
(plusieurs centaines de lignes directrices sur les tunnels et la saisie mobile,
adossées à des tests filmés), **Nielsen Norman Group** (mobile, caméra,
formulaires), les corpus d'abandon de formulaire. Mais pour ce décrochage précis,
le référentiel décisif est plus court et gratuit : **les apps que ce client ouvre
déjà toutes les semaines**.

| Geste | Ce que font les apps qu'il connaît | Ce que fait la nôtre |
|---|---|---|
| Scanner un QR pour payer (Payconiq / Bancontact) | Scan → montant affiché → **un seul** bouton, plein écran | Vitrine → photo → formulaire → bouton en bas |
| Carte de fidélité en caisse (Lidl Plus, Colruyt Xtra) | Code affiché, scanné par la caisse, **rien à confirmer** | Le client doit confirmer lui-même |
| Note de frais (Expensify & équivalents) | Photo → **déjà enregistrée**, l'OCR corrige après | Photo → à relire → à envoyer |
| Virement par photo (apps bancaires) | Photo → champs pré-remplis → **confirmer le paiement** (l'enjeu justifie le second geste) | Même geste, sans enjeu qui le justifie |
| S'identifier (itsme) | Un geste, une confirmation, fin | — |

Ce qu'il faut en retenir : le second geste n'existe, dans le monde du client, que
**quand il y a un risque à assumer** (envoyer de l'argent). Ici il n'y en a aucun
de son côté — il ne perd rien à envoyer un ticket. Le geste de confirmation est
donc perçu comme une formalité sans objet, c'est-à-dire comme rien du tout.

---

## 4. La correction de fond : la photo **est** l'envoi

**L'argument décisif est technique, pas esthétique.** Le formulaire de relecture
n'est pas un dispositif anti-fraude : `app/api/orders/route.ts` **ré-analyse la
photo côté serveur** (`analyzeReceipt`) et compare sa propre lecture au montant
déclaré ; un écart de plus de 5 % lève `amount_mismatch` et part en arbitrage. La
vérité vient du serveur, pas du client. Le formulaire ne sert donc qu'à **une**
chose utile : laisser le membre corriger une lecture ratée.

D'où la cible, qui ne touche ni l'ADR 0008 ni l'ADR 0052 :

```
Lecture nette (montant lu, clé lue, confiance haute)   → ENVOI IMMÉDIAT, sans rien demander
Lecture partielle ou douteuse                          → on demande UNIQUEMENT ce qui manque
Lecture impossible                                     → envoi manuel + arbitrage (jamais de cul-de-sac, S7)
```

Le membre voit alors l'écran de succès existant — gros chiffre de points, cadeau
nommé, illustration — **sans avoir eu à décider quoi que ce soit**. Et le délai
de 3–5 s de l'ADR 0008 trouve enfin son emploi : il couvre l'envoi au lieu de
faire patienter devant un formulaire.

Pour la majorité des tickets (lecture nette), le parcours passe de
**photo → relire → envoyer** à **photo → c'est envoyé**. C'est le modèle que le
client a déjà en tête (§3), et il n'y a plus de point de décision à rater.

Correction complémentaire côté visiteur : garder le mur du compte (c'est une
décision produit assumée, ADR 0040), mais **envoyer dès le retour de connexion**
(S6) au lieu de redemander un geste.

---

## 5. Ordre de bataille

| # | Action | Rupture | Coût |
|---|---|---|---|
| 1 | **Séparer visiteurs / membres / refus** dans les tuiles de `/platform/scans` | la mesure | 1 ligne |
| 2 | Mesurer la position du bouton « Envoyer mon ticket » à 390 × 844, dans les 4 cas | S2 | 20 min |
| 3 | Retirer tout signal de victoire avant l'envoi (vert, « cadeau visé ») | S1 | 1 h |
| 4 | Une seule porte sur la vitrine + corriger « des points à gagner » | S5 | 1 h |
| 5 | Ne jamais fermer la porte sur une lecture ratée | S7 | 2 h |
| 6 | **Envoi automatique quand la lecture est nette** | S1·S2·S3 | 1 j |
| 7 | Envoi automatique au retour de `?resume=1` | S6 | ½ j |
| 8 | Vérifier la chaîne de survie de la photo (iOS, nav. privée, install avant retour) | S4 | ½ j |

Les lignes 1 et 2 ne corrigent rien : elles disent lesquelles des suivantes
valent la peine. Elles passent en premier.

---

## 6. Ce que ce document ne sait pas

Aucun chiffre réel n'a pu être lu ici (l'accès Supabase de cette session n'est
pas authentifié) : tous les constats viennent du **code** et des relevés déjà
écrits dans les ADR 0050 et 0051. La requête du §1 est donc à lancer avant
d'arbitrer — elle peut invalider S1/S2 d'un coup si l'essentiel des scans
abandonnés sont des visiteurs, auquel cas le chantier bascule entièrement sur le
mur du compte.
