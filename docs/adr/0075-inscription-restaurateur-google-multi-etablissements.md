# ADR 0075 — L'inscription restaurateur part de Google, le compte vient après, plusieurs établissements d'un coup

**Statut** : Proposé (2026-10-01) — décidé par le porteur en session, maquette validée
(« Inscription restaurant Boosteats », cinq écrans). C'est l'« ADR de suivi » annoncé par
l'[ADR 0015](0015-multi-restaurant-platform-pivot.md) §6 et § Évolutions (flow self-service).
Amende l'ADR 0015 §6-7 (ordre établissement → compte, condition de validation),
l'[ADR 0031](0031-declared-communities-and-recognition-prompt.md) §1 (communautés hors du
tunnel), l'[ADR 0019](0019-receipt-key-discovery.md) §2 (une analyse de ticket pour
plusieurs établissements) et l'[ADR 0030](0030-navigation-coherence-and-role-journeys.md)
§1 et §8.2 (destination d'un restaurateur dont l'inscription n'est pas finie). N'amende ni
l'ADR 0007 ni l'ADR 0073 (le code d'établissement ne se copie jamais).

## Contexte

Le 2026-10-01, le gérant de Krusty Smash a voulu s'inscrire depuis son rapport d'audit : il
est tombé sur la page de connexion, puis sur une boucle (corrigé par la PR #263). Au-delà du
bug, le tunnel actuel demande dans cet ordre : un compte, puis nom, ville, adresse, cuisine
et communautés tapés à la main, puis la carte en CSV, puis trois photos de ticket, puis les
réseaux. Un seul établissement à la fois.

Trois constats :

- **Le compte d'abord est un mur.** Le restaurateur n'a encore rien vu de ce qu'il obtient
  qu'on lui demande déjà un e-mail et un mot de passe.
- **Google sait déjà presque tout.** Nom, adresse, commune, téléphone, site, lien Maps,
  catégorie : la fiche Google (déjà lue par l'audit, `lib/audit/places.ts`, ADR 0071) les
  donne. Les retaper est une perte de temps et une source de fautes (secteur mal orthographié
  → `/secteurs` éclaté).
- **Les restaurateurs qui nous intéressent ont souvent plusieurs adresses.** La base le
  permet depuis l'ADR 0015 §7 et l'ADR 0041 (sièges), la console a un sélecteur, mais
  l'inscription n'en crée qu'un et rien ne permet d'en ajouter un ensuite.

## Décision

### 1. Ordre : établissements → compte → carte → ticket

1. **Établissements, sans compte.** Une recherche Google (Places API New, **toute la
   Belgique** — l'audit gratuit reste limité à Bruxelles, ADR 0071 §3). Choisir un résultat
   remplit la fiche : nom, adresse, commune (= `sector`, ADR 0016), téléphone, site, lien
   Maps, type de cuisine. Le restaurateur **corrige**, il ne saisit pas. « + Ajouter un autre
   établissement » en ajoute autant qu'il en a (plafond 10). « Saisir à la main » reste
   possible pour un établissement absent de Google.
2. **Compte.** Un seul écran « Enregistrer mes N établissements » : Google ou e-mail + mot de
   passe, politique de confidentialité et conditions restaurateurs. C'est **ici** que les
   établissements sont créés (`pending`, siège gérant pour chacun, ADR 0041).
3. **Carte**, puis 4. **Ticket** : chacune a « Ajouter plus tard ».

Le brouillon (étape 1) ne touche pas la base : il vit dans le navigateur, et part avec la
demande de compte dans les métadonnées d'inscription, pour survivre à un lien de
confirmation ouvert dans une autre application (cas fréquent sur mobile). Il est relu et
revalidé côté serveur au premier retour authentifié — jamais cru tel quel.

Rien de payant n'est ouvert sans compte : la recherche Google est plafonnée par IP comme
celle de l'audit gratuit, et l'analyse IA du ticket (ADR 0019) reste réservée aux comptes.

### 2. Plusieurs établissements : carte et format de ticket une fois, copiés

Avec plusieurs établissements, une question : « La même carte dans mes N établissements ? »
(oui par défaut). La carte est importée une fois et **copiée** dans chacun (`menu_items` est
par établissement, ADR 0013 — pas de catalogue partagé) ; la grille de cadeaux par défaut
(ADR 0017) est calculée pour chacun. Elles divergent ensuite librement dans chaque console.

Même règle pour le **format** du ticket (clé, position, groupe date, profil — ADR 0019,
0066) : une analyse, copiée. **Jamais copiés** : `store_code` (le code d'établissement
imprimé dans la clé, ADR 0073 — le copier ferait accepter chez B les tickets de A) et
`key_examples` (vraies clés d'un établissement). Le code d'établissement reste lu ticket par
ticket comme aujourd'hui (ADR 0073 § nouveau restaurateur).

### 3. La page d'avancement

Tant qu'un établissement `pending` n'a pas sa carte ou son ticket, son restaurateur arrive,
à chaque connexion, sur **une seule page** : une ligne horizontale d'étapes (faites en vert,
restantes en orange, validation en gris) et, pour chaque étape restante, une carte avec son
bouton. Rien d'autre. Elle pousse à finir.

« Fait » se lit dans les données, jamais déclaré (même règle que l'ADR 0064) : carte =
au moins un article actif dans `menu_items` ; ticket = `restaurant_receipt_config.confirmed_at`
renseigné (« Je n'ai pas de numéro fiable » compte comme fait, c'est une réponse). C'est le
critère déjà utilisé par la relance d'onboarding (`app/api/cron/notifications`).

**Pourquoi bloquer la console**, contre l'ADR 0030 §4 (« on montre ce qui manque, on ne
cache rien ») : un établissement sans ticket configuré retombe sur le format Belchicken
(`LEGACY_BESTELNUMMER_CONFIG`) et refuserait tous ses tickets ; sans carte, pas de cadeau.
La console d'un établissement incomplet ne montre que des écrans vides. La page d'avancement
*est* l'écran « ce qui manque ». Le super-admin garde l'accès complet (ADR 0030 §3).

### 4. La validation attend la carte et le ticket

`approveRestaurant` refuse un établissement incomplet, avec le motif à l'écran
(« carte manquante », « ticket manquant ») — jamais en silence. `/platform` affiche les deux
états pour chaque établissement en attente. La création directe par le super-admin
(`createRestaurantAsSuperAdmin`) n'est pas concernée.

### 5. Ce qui sort du tunnel

- **Communautés** (ADR 0031 §1) : plus demandées à l'inscription. Elles restent dans
  Réglages → « D'où viennent tes clients ? » (`CommunitiesForm`), zone par défaut = le secteur.
- **Réseaux sociaux** : le lien Google Maps et le site viennent de la fiche ; Instagram,
  TikTok et Facebook passent dans les réglages. L'étape « Réseaux » disparaît.

### 6. Ajouter un établissement plus tard

La console a un bouton « Ajouter un établissement » : la même recherche, sans redemander de
compte, puis la carte (copiée d'un établissement existant ou nouvelle) et le ticket.

### 7. Une fiche Google = un établissement

`restaurants.google_place_id` est enregistré et unique : une fiche déjà inscrite ne peut pas
l'être une seconde fois par un autre compte (« Cet établissement est déjà inscrit —
écrivez-nous »). C'est le garde-fou contre l'inscription d'un concurrent ou d'un doublon.

## Traces

- **Entonnoir serveur** : établissements en brouillon envoyés, créés, avec carte, avec
  ticket, validés — lisibles sur `/platform`, par source (`signup_attribution`, PR #263).
- **Qualité du pré-remplissage** : pour chaque établissement, source (`google` / `manuel`) et
  liste des champs corrigés par le restaurateur (`restaurants.signup_prefill`). Un champ
  corrigé plus d'une fois sur trois dit que la lecture Google de ce champ est mauvaise.
- **« Ajouter plus tard »** : nombre d'établissements créés sans carte ni ticket, et délai
  avant de les compléter. S'il dépasse une semaine en médiane, la page d'avancement ne pousse
  pas assez.
- **Doublons refusés** (§7) comptés, pour voir si la règle bloque des cas légitimes
  (un restaurateur qui a deux comptes).

## Livraison

1. Cet ADR.
2. Écran Établissements (recherche Google Belgique, fiche corrigeable, plusieurs
   établissements), brouillon, création au compte ; colonnes `google_place_id`, `phone`,
   `signup_prefill`.
3. Carte et ticket copiés à plusieurs établissements, « Ajouter plus tard », page
   d'avancement et blocage de la console, validation conditionnée.
4. « Ajouter un établissement » dans la console ; réseaux sociaux et communautés dans les
   réglages.

## Conséquences

- Le CSV de carte reste le format d'import tant qu'un import photo/PDF n'existe pas ; la
  maquette annonce « photo, PDF ou fichier » : à aligner sur ce qui est livré.
- `isRestaurantOwner` ne peut pas garder un brouillon (pas encore de siège) : le brouillon
  n'a pas de route serveur avant le compte, par construction.
- La numérotation des étapes (« 2/4 », « 3/3 ») disparaît au profit de la ligne d'étapes.
- Le message « Ta demande est en cours d'examen » (ADR 0030 §8.2) ne s'affiche qu'une fois
  carte et ticket faits.

## Alternatives rejetées

- **Compte à la fin du tunnel** : la carte et les photos de ticket devraient vivre dans un
  brouillon anonyme, et l'analyse IA serait ouverte à n'importe qui.
- **Carte et ticket établissement par établissement** : juste pour des restaurants
  différents, mais une chaîne referait N fois la même chose ; le choix « différente selon
  l'établissement » reste proposé.
- **Bruxelles seulement** : un restaurateur hors Bruxelles devrait tout saisir ; la limite de
  l'audit vient de son coût, pas de l'inscription.
