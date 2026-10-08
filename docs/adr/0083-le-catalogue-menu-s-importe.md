# ADR 0083 — Le catalogue menu s'importe d'un lien, d'une capture ou d'un PDF, puis le restaurateur le vérifie

**Statut** : Accepté (2026-10-08) — décidé par le porteur en session. L'écran d'import et le
tableau à vérifier restent à **valider sur maquette** avant d'être codés (ADR 0065). Amende
l'[ADR 0013](0013-menu-catalog-and-costs.md) §1 (le CSV n'est plus le seul format) et clôt la
réserve de l'[ADR 0075](0075-inscription-restaurateur-google-multi-etablissements.md) § Conséquences
(« le CSV de carte reste le format d'import tant qu'un import photo/PDF n'existe pas »). Une
source s'ajoute quand l'[ADR 0082](0082-fiche-google-geree-sur-invitation.md) nous donne accès
à la fiche Google. N'amende ni l'ADR 0007 ni l'ADR 0013 §1 sur le prix de revient (toujours
saisi par le restaurateur).

## Contexte

L'étape « carte » de l'inscription (ADR 0075 §1) demande un CSV à quatre colonnes. C'est
l'étape que le restaurateur repousse le plus volontiers (« Ajouter plus tard »), alors que sans
catalogue un établissement ne peut ni être validé ni offrir de cadeau. Or presque tous ont déjà
leur carte quelque part : leur site, Uber Eats, Takeaway, Deliveroo, un PDF, la carte en salle.

Idée de départ : retrouver le lien Uber Eats depuis la fiche Google et lire la carte
automatiquement. Ce que l'examen du 2026-10-08 a montré :

- **La lecture publique de la fiche Google ne donne que le site** (`websiteUri`, Places API,
  `lib/audit/places.ts`). Les liens « Commander » vers les plateformes ne sont pas exposés. Ils
  le deviennent avec l'accès gestionnaire de l'ADR 0082.
- **Uber Eats bloque la lecture depuis un serveur.** Un appel direct reçoit un 403 Cloudflare
  (constaté pour l'import des photos, `scripts/import-menu-images.mjs`), et leurs conditions
  d'utilisation interdisent l'extraction automatique. Takeaway et Deliveroo se protègent de la
  même façon.
- **Les prix des plateformes de livraison ne sont pas ceux de la salle.** Ils sont souvent plus
  chers de 15 à 30 % pour absorber la commission. Or `menu_price` est la valeur perçue qui classe
  les cadeaux (ADR 0013 §3, ADR 0017). Repris tels quels, ils faussent la suggestion.
- **Les noms des plateformes ne sont pas ceux du ticket de caisse**, et c'est le nom du ticket
  qui sert au rapprochement (`lib/menu-match.ts`, ADR 0067).

## Décision

### 1. Quatre sources, une seule suite

L'étape « carte » (inscription, page d'avancement, console `/admin/[id]/menu`) propose :

1. **Un lien**, pré-rempli avec le `websiteUri` de la fiche Google quand il existe. Le serveur
   lit la page. Si elle est bloquée (plateforme de livraison, défi anti-robot, page vide), on le
   dit à l'écran : « Uber Eats ne nous laisse pas lire sa page : envoie une capture ou ton PDF »,
   avec la cause `link_blocked`. **Jamais de navigateur automatisé pour contourner une
   protection.**
2. **Des captures d'écran ou des photos** de la carte : page de livraison, carte en salle,
   tableau au-dessus du comptoir. Plusieurs images à la fois.
3. **Un PDF.**
4. **Le CSV** de l'ADR 0013, inchangé, en secours.

Plus tard, une cinquième source s'ajoute : **la carte et les liens enregistrés sur la fiche
Google**, quand l'établissement nous y a donné accès (ADR 0082).

### 2. Nous adaptons le résultat, le restaurateur le vérifie

Le modèle de lecture (le même que les tickets, ADR 0072) extrait les articles. C'est notre code
qui les **met au format du catalogue**, jamais le restaurateur :

- catégories ramenées à nos familles ;
- tailles écrites comme la carte les connaît (« Nugget (4) », ADR 0067) ;
- doublons fusionnés ;
- formules (« Menu… ») gardées comme articles ;
- origine de chaque prix notée (`delivery` si la source est une plateforme de livraison,
  `salle` sinon).

Le restaurateur arrive alors sur **un tableau à vérifier**, sous un bandeau clair : « Vérifie
bien chaque ligne : nous avons lu ta carte, mais c'est toi qui la connais. »

- **Prix de vente pré-rempli.** Quand il vient d'une plateforme de livraison, il est marqué
  « prix livraison, vérifie ton prix en salle ». Nous ne le corrigeons pas nous-mêmes.
- **Prix de revient vide, à saisir par lui.** Jamais pré-rempli, jamais estimé à sa place
  (ADR 0013 §1) : un coût sous-estimé fausse le plafond budget (ADR 0012). Un repère (« en
  général 25 à 35 % du prix ») peut s'afficher à côté, jamais dans la case.
- Il peut **ajouter, retirer, renommer** des lignes.
- L'enregistrement passe par **le même chemin d'écriture que le CSV** : même upsert sur
  `(restaurant_id, name)`, même désactivation sans suppression, même copie vers les autres
  établissements (ADR 0075 §2). Il n'y a pas de seconde porte d'entrée dans `menu_items`.

**À trancher sur la maquette** : un article sans prix de revient. `cost_price` est obligatoire
aujourd'hui. Exiger les soixante coûts avant d'enregistrer recrée le mur qu'on veut retirer.
L'autre voie : enregistrer l'article hors cadeaux (`reward_eligible = false`) tant que son coût
manque, avec une migration qui rend le coût facultatif pour ces seuls articles.

### 3. Limites

- La lecture ne se lance **qu'avec un compte** (même règle que l'analyse du ticket, ADR 0075 §1).
- Elle est plafonnée par établissement et par heure, parce que chaque lecture est facturée.
- Taille et nombre de pages bornés. Au-delà, on le dit à l'écran (`too_large`), on ne tronque
  pas en silence.
- Les prix restent des données euros côté console uniquement (ADR 0007, ADR 0013 §4).

## Conséquences

- **Données** : une table des imports. Pour chacun :
  - établissement et source (lien, images, PDF, CSV, fiche) ;
  - résultat et cause nommée : `link_blocked`, `unreadable`, `empty`, `too_large`,
    `rate_limited`, `reading_unavailable` ;
  - modèle, délai et jetons ;
  - articles lus, puis articles enregistrés, modifiés, ajoutés et retirés par le restaurateur.
  
  Migration horodatée, code tolérant à son absence. Les fichiers envoyés ne sont gardés que le
  temps de la lecture.
- **Trace** (ADR 0065) :
  - entonnoir par source sur `/platform` ;
  - **taux de lignes corrigées** : s'il dépasse un tiers des articles lus, la lecture ne fait pas
    gagner de temps, et la règle est à revoir ;
  - part des prix « livraison » modifiés ;
  - liens bloqués par domaine ;
  - délai entre l'étape et un catalogue enregistré, comparé à l'époque du CSV seul.
- **Échos à suivre dans les PR d'implémentation** :
  - le rapprochement des tickets : un nom lu sur Uber qui diffère du ticket passe par les alias
    existants (`menu_item_aliases`), jamais par un renommage automatique ;
  - la page d'avancement et la relance d'onboarding (critère « au moins un article actif »
    inchangé) ;
  - la copie entre établissements (ADR 0075 §2) ;
  - les textes de l'étape (« Ajouter plus tard ») ;
  - le modèle CSV téléchargeable (gardé) ;
  - `CONTEXT.md` (le catalogue n'est plus « soumis via un fichier CSV » seulement).

## Alternatives rejetées

- **Retrouver le lien Uber Eats sur la fiche et lire la page automatiquement** : le lien n'est
  pas exposé publiquement, la page est bloquée côté serveur, et l'extraction est contraire aux
  conditions d'Uber Eats.
- **Navigateur automatisé ou service de contournement** : fragile (chaque changement de
  protection casse l'import), contraire aux conditions des plateformes, et une dépendance tierce
  de plus (ADR 0074 §3).
- **Corriger nous-mêmes les prix de livraison** (par exemple −20 %) : nous ne connaissons pas
  sa marge par plateforme. Un prix inventé est pire qu'un prix signalé.
- **Estimer le prix de revient** : déjà écarté par l'ADR 0013 ; une estimation fausse le
  plafond budget sans que personne ne le voie.
