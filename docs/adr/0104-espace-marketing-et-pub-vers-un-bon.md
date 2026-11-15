# ADR 0104 — L'espace Marketing, et la pub qui mène à un bon

**Statut** : Accepté (2026-11-15, Mehdi, en session). Maquette validée le même jour :
https://claude.ai/artifact/MWBkdi6Ffqrn1tY63m4qFC (« c'est super bien à lancer, ça fait sens, hyper
simple à montrer aux clients »). **Amende l'[ADR 0064](0064-la-console-repond-a-trois-questions.md)**
(les cinq onglets de la vue simple : « Annonces » devient « Marketing ») et
**l'[ADR 0086](0086-pub-le-process-deux-validations-le-reste-automatique.md)** §1, §6 et §7 (une pub
qui porte une offre est une pub « Visites » qui mène à un bon). N'amende ni l'ADR 0007 ni l'ADR 0028 :
le bon est montré à un **passant venu d'une pub**, pas à un membre dans le programme, et il ne porte ni
points ni seuil. Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

1. **Le marketing est éparpillé.** Annonces dans la barre du bas, Pub et Prestataires dans « Plus »,
   avis Google dans « Actions », idées de la brigade dans « Idées ». Le restaurateur ne voit nulle
   part, d'un coup d'œil, ce qui tourne, ce qu'il pourrait lancer, et ce que ses actions ont donné.
   Mehdi veut un espace « fortement utilisé, fortement conseillé, très simple », sur le modèle des
   studios créatifs (Higgsfield : une galerie d'actions prêtes, une image, un nom, un appui), lié aux
   données du resto, et qui accueillera les prochaines fonctions marketing.
2. **La pub avec offre ne se mesure pas.** Jusqu'ici, une pub portait une offre et un **mot clé** à
   dire au comptoir (ADR 0086 amendé le 2026-10-29). Le comptage dépend de l'équipe en salle, qui ne
   le fait pas : la pub de Houba (notoriété, 13 → 27/11) donne des personnes touchées, rien sur ceux
   qui sont venus. Une pub de notoriété ne peut pas non plus s'optimiser sur une action.

## Décision

### 1. L'espace Marketing

- Dans la vue simple, l'onglet **« Annonces » devient « Marketing »** (`/admin/<id>/marketing`). Les
  cinq onglets sont désormais **Idées · Stats · Tickets · Marketing · Plus**. La page Annonces existe
  toujours, à un appui depuis Marketing et depuis « Plus ».
- Dans la vue pro, la section « Contenus et pub » devient **« Marketing »** ; elle est toujours là
  (la page Marketing y est en tête), Pub et Prestataires y restent selon leurs drapeaux.
- La page répond, de haut en bas, à cinq questions :
  1. **Quoi faire cette semaine** : UNE recommandation en grand, avec les trois chiffres qui la
     justifient. D'abord une idée de la brigade à décider aujourd'hui (Hugo, Emma, Louis, Max) — la
     carte mène à « Idées », où se prend la décision (un seul endroit, ADR 0054) ; sinon une
     recommandation calculée sur les données du resto (`lib/marketing-space.ts`, logique pure et
     testée) : jour le plus calme (au moins 28 jours de CA notés, écart d'au moins 15 % sous la
     moyenne), première pub, ou annonce quand aucune n'est partie depuis 14 jours. Rien d'honnête à
     proposer → pas de carte, jamais une recommandation inventée.
  2. **Ce qui tourne** : la pub en diffusion ou en pause (même logique que l'encart validé le
     2026-11-14, `lib/ads/home-card.ts`) avec, pour une pub à bon, les clics, les bons obtenus et les
     bons utilisés ; les annonces programmées.
  3. **Lancer une action** : la galerie. Une tuile par action, avec une image, un nom simple, ce
     qu'elle touche et ce qu'elle coûte ; filtres Faire venir, Faire revenir, Photos et vidéos,
     Google. Chaque tuile ouvre l'écran existant ; une tuile fermée par le forfait ou un drapeau dit
     « Bientôt » ou le forfait qui l'ouvre, jamais un lien vers un 404.
  4. **Qui tu peux toucher** : clients du programme, clients d'accord pour recevoir une promo,
     abonnés aux notifications.
  5. **Ce que tes actions ont donné** : chaque annonce avec les tickets du programme dans les 3 jours,
     comparés aux mêmes jours de la semaine d'avant ; chaque pub avec son résultat (et ses bons).
     Jamais « grâce à nous » (ADR 0064) : on montre ce qui s'est passé.
- Toute nouvelle fonction marketing arrive comme **une tuile** de la galerie, et comme une
  recommandation quand les données s'y prêtent. La page ne change pas de forme.
- Pas d'e-mail promo aux contacts tant que la case de consentement e-mail n'existe pas (ADR 0063) :
  la maquette le montrait, il n'est pas construit.

### 2. Une pub avec offre mène à un bon

Pour les **prochaines** pubs (celles qui tournent déjà ne changent pas) :

- Une pub qui porte une **offre** est une pub **« Visites »** (`TRAFIC`, optimisée sur les clics,
  inchangé côté Meta). Notoriété et vidéo ne portent plus d'offre.
- Son bouton est **« Obtenir l'offre »** (`GET_OFFER`) et son lien mène à la **page du bon** sur
  Boosteats : `/bon/<établissement>/<n° de demande>` (adresse lisible, publique comme la pub),
  avec `utm_source=meta`. Une pub sans offre garde son lien vers l'itinéraire Google Maps.
- La page du bon montre le resto, l'offre, ses dates, l'adresse. Un appui sur **« Obtenir mon bon »**
  crée un bon (`ad_vouchers`) : un **code court** (6 caractères, sans 0/O ni 1/I) et un **QR** que la
  caisse scanne avec la console ouverte. Le bon reste sur l'appareil (cookie strictement nécessaire,
  il ne porte que l'identifiant du bon) : revenir sur la page remontre le même bon.
- **À la caisse** : le QR ouvre `/admin/bon/<jeton>` (même contrôle d'accès que le coupon, ADR 0011) ;
  sans QR, le code se tape sur `/admin/<id>/bon`. « Bon utilisé » marque le bon, une seule fois
  (idempotent). Hors des dates de l'offre, le bon est refusé avec la raison.
- **Aucune donnée personnelle** : ni nom, ni téléphone, ni e-mail. Contre le remplissage, au plus
  20 bons par heure et par adresse IP, comptés sur une **empreinte salée** (`AUDIT_IP_SALT`, ADR
  0071), jamais l'IP en clair.
- Le bon invite, en petit, à rejoindre le programme de l'établissement (`/r/<id>`).
- Le mot clé de l'offre reste demandé et s'affiche sur le bon : la caisse le reconnaît d'un coup d'œil.

### 3. Ce que voit le restaurateur

Pour une pub à bon : **clics** (Meta), **bons obtenus** et **bons utilisés en caisse** (Boosteats),
sur Marketing, sur la page Pub et dans le résumé de `/platform/pub`. Euros permis : c'est sa dépense,
en console.

## Conséquences

- Code : `lib/admin-nav.ts`, `app/admin/[restaurantId]/marketing/**`, `lib/marketing-space.ts`(+ test),
  `lib/ads/vouchers.ts` (+ test), `app/(public)/bon/**` ou équivalent, `app/api/bons/**`,
  `app/admin/bon/[token]`, `app/admin/[restaurantId]/bon`, `lib/ads/campaigns.ts` (lien et bouton),
  le formulaire de pub (offre → Visites), Emma inchangée (elle propose déjà Visites + offre).
- Données : migration `20261115-1200-bons-de-pub` (`ad_vouchers`, `ad_voucher_views`), service-role
  seulement, code tolérant à son absence (la page du bon dit « indisponible », la pub garde son lien).
- Échos : CONTEXT.md (« bon de pub », « espace Marketing »), CLAUDE.md, ADR 0064 et 0086 (renvoi
  ici), `lib/marketing-pages.test.ts` si un texte public change, mesure SQL.

## Trace (ADR 0065)

- `docs/mesures/suivi-bons-de-pub.sql` : par pub, clics Meta, vues de la page du bon, bons obtenus,
  bons utilisés. **Seuils** : moins de 20 % des clics deviennent un bon après 100 clics → la page du
  bon est à revoir ; moins de 10 % des bons sont utilisés après 30 bons → l'offre ou la caisse est à
  revoir (l'équipe ne scanne pas ?). Plus de 20 bons en une heure sur une même empreinte = refus,
  tracé dans les journaux (`[bon]`).
- `docs/mesures/suivi-espace-marketing.sql` : actions lancées par établissement et par mois
  (annonces, demandes de pub, idées marketing acceptées). **Seuil** : si moins d'un établissement
  actif sur deux lance une action en un mois, la recommandation du haut est à revoir.

## Alternatives rejetées

- **Garder le mot clé seul** : rien ne se compte sans l'équipe, qui ne compte pas.
- **Code promo à saisir dans la caisse Belchicken** : la caisse (S4D) n'est pas à nous, et rien
  ne remonterait chez Boosteats.
- **Demander un numéro de téléphone pour le bon** : plus de frein au clic, des données personnelles
  à protéger, pour un gain de mesure nul (le bon unique suffit).
- **Pixel Meta sur la page du bon** (optimiser sur les bons obtenus) : exige le consentement
  publicitaire de la bannière, refusé en dur aujourd'hui (Consent Mode). À rouvrir à part.
