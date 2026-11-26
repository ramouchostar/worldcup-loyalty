# ADR 0111 — Les articles du restaurant : un blog dans l'espace de commande, non indexé, publié par le gérant

**Statut** : Accepté (2026-11-26) par le porteur (Omar) : maquette et choix conseillés validés (https://claude.ai/artifact/GJmwiP9NYQtaNdeQQhQ5cN) ; Mehdi pas encore consulté ; rien n'est construit. Demande d'Omar : « création d'article avec une partie blog pour chaque resto ». Précise l'[ADR 0108](0108-l-espace-de-commande-du-restaurant-un-compte-des-points-nina.md) (§4, §6) et l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md) (ce que fait Nina). N'amende pas l'ADR 0108 §1.

## Contexte

Ce que le code dit aujourd'hui :

- Le blog existant (`/blog`, `lib/blog/`) est celui de **Boosteats**, pour les restaurateurs. Ses articles sont des fichiers du dépôt. Rien n'existe pour un restaurant.
- Son format de blocs n'a **pas de photo**. Ses blocs `cta`, `compare`, `table` et son affichage sont propres à la vitrine Boosteats.
- L'espace de commande (`/commander/<établissement>`) exige le drapeau `SITE_ORDER_RESTAURANTS` **et** un forfait Pro actif, sinon 404. Il est déjà `noindex, nofollow`.
- Son accueil montre le logo, le nom et la carte. Il n'y a pas encore d'entrée « Commander » dans l'app.
- Le panier n'est enregistré dans le navigateur qu'au moment de la connexion : **changer de page le perd**.
- La page de commande n'existe qu'en français.
- Les photos de plats vont dans un espace de stockage **public** (`menu-images` : JPG, PNG, WebP, 2 Mo).
- Nina n'a pas de générateur d'idées. Une idée d'un générateur sans fiche de jeu n'est pas montrée (ADR 0105).
- Dans le glossaire, **« Article » désigne déjà une ligne de la carte** (`menu_items`).

D'après `CLAUDE.md` (pas vérifié en base), Houba est en **Croissance** et l'espace de commande n'a jamais tourné sur une vraie base. Avec la règle actuelle, **aucun client de Houba ne verrait un article**. Aucun restaurateur n'a encore dit ce qu'il voudrait écrire.

## Décision

### 1. Où

- Le nouvel objet s'appelle **« article de blog »**. Le client lit « Nos articles ».
- Il vit dans l'espace de commande : `/commander/<établissement>/articles` (liste) et `/commander/<établissement>/articles/<adresse>` (lecture).
- Sur l'accueil de l'espace : **un seul bloc compact** entre l'identité et la carte, avec le dernier article et « Tous les articles ». Aucun article publié : le bloc n'existe pas.
- Mêmes portes que la commande (drapeau et forfait), sinon 404. Lecture **sans compte**.
- **Le panier survit** à la lecture d'un article.

### 2. Non indexé

`noindex, nofollow`, absent du plan du site. La page reste lisible par Google pour qu'il voie ce refus (pas de blocage dans `robots.txt`). **Non indexé ne veut pas dire privé** : toute personne qui a le lien peut lire.

| Ce que ce blog peut apporter | Ce qu'il n'apportera pas |
|---|---|
| Dire une nouveauté à qui est déjà sur la page de commande | Aucun visiteur venu d'une recherche Google |
| Un lien à partager soi-même (WhatsApp, réseaux, QR) | Aucun nouveau client trouvé tout seul |
| Un texte relu, avec les plats de la carte à côté | Aucun envoi : publier ne prévient personne |

Indexer serait **une autre décision** : elle rouvre l'ADR 0108 §1 (plus de pages générées pour Google), demande des pages assez riches et différentes d'un établissement à l'autre, et ne garantit aucune place.

### 3. Qui écrit, qui publie

- **Gérant et manager** écrivent, publient et retirent. Un siège « équipe » ne le fait pas.
- La plateforme ne publie jamais à la place du restaurant. Elle peut seulement **masquer**.
- L'écran est ouvert depuis une tuile « Écrire un article » de la page Marketing (`/admin/<établissement>/articles`).
- **Nina, en deuxième tranche** : un bouton « Demander un brouillon à Nina ». Le gérant écrit une à trois phrases ; Nina rédige avec ces phrases et la carte. Elle n'invente ni prix, ni date, ni allergène, ni origine d'un produit : ce qui manque reste entre `[crochets]` et **bloque la publication**. Elle ne fabrique aucune image.
- **Rien ne devient public sans « Oui, publier »** (ADR 0089 §3).
- Nina n'envoie **aucune idée** spontanée dans « Idées » : il faudrait une fiche de jeu avec un effet mesurable (ADR 0105), que nous n'avons pas.

### 4. Contenu

- Blocs : **paragraphe, intertitre, liste** (mêmes formes que `BlogBlock`), plus **photo** (fichier et texte qui la décrit) et **plat** (identifiant d'un article de la carte : nom et prix lus au moment de l'affichage ; plat retiré = bloc caché).
- Texte simple : ni HTML ni lien.
- Limites de départ : titre 80 caractères, 12 blocs, 4 photos.
- Ni catégories, ni FAQ, ni mots-clés, ni commentaires.

### 5. Photos

- Nouvel espace de stockage **privé**, adresses signées de courte durée : un article retiré ne laisse pas ses photos accessibles.
- JPG, PNG ou WebP, réduites sur le téléphone, 2 Mo au plus. Le serveur les réenregistre (`sharp`, déjà installé) et **efface la position GPS** et les autres métadonnées.
- Avant de publier, une case : « J'ai le droit d'utiliser ces photos et les personnes reconnaissables sont d'accord. » Qui a coché et quand est gardé.
- Article supprimé : photos supprimées.

### 6. États

**Brouillon, en ligne, retiré, masqué par Boosteats.** Modifier un article en ligne ne change rien pour le client avant un nouveau « Oui, publier ». « Retirer » agit tout de suite.

### 7. Contrôle et responsabilité

- Avant publication, un contrôle **sur le serveur** refuse et explique : un **prix écrit dans le texte** (utiliser le bloc plat), un lien, un e-mail ou un téléphone, un champ `[à remplir]`, une **promesse de santé ou d'allergène** (« sans gluten », « bon pour la santé », « minceur »). Une liste de mots **ne voit pas tout** : ce n'est pas une garantie.
- Le restaurant répond de ce qu'il publie. Boosteats héberge, masque avec un motif que le gérant lit, et reçoit les signalements (« Signaler cet article », limité en nombre).
- **À valider par un juriste avant ouverture** : rôle de Boosteats (hébergeur ou éditeur, surtout quand Nina rédige), allégations de santé, annonces de promotions, photos de tiers et de la franchise. Les conditions restaurateurs reçoivent une clause sur les contenus.

### 8. Langues

**Français seulement**, avec la langue notée sur chaque article. Pas de traduction automatique. Le néerlandais viendra avec la traduction de la page de commande.

## Conséquences

- **Trois tables nouvelles**, réservées au serveur (aucune migration dans cet ADR) :
  - `restaurant_posts` : établissement, adresse unique par établissement, langue, état, version brouillon et version publiée (titre et blocs), dates, origine (gérant ou Nina), confirmation des droits, motif de masquage, auteur (effaçable) ;
  - `restaurant_post_events` : publié, retiré, masqué, signalé, refusé au contrôle (avec le motif), qui et quand ;
  - `restaurant_post_daily` : par article et par jour, lectures et appuis sur « Voir la carte », sans aucune donnée sur le lecteur.
- **Un espace de stockage** privé `restaurant-post-photos`.
- Tables absentes : le bloc client est caché et la console le dit.
- L'article porte le nom du restaurant, jamais celui d'une personne.
- Tant que l'espace est fermé, le blog n'a **aucun lecteur**.

## Échos à suivre

- `CONTEXT.md` : terme « Article de blog » (_Avoid_ : « article » seul, réservé à la carte ; « annonce », qui est un envoi ; « idée »).
- `components/commander/OrderApp.tsx` : garder le panier à chaque changement. La reprise actuelle ouvre le panier et affiche « On a retrouvé ta commande » : à adapter.
- ADR 0108 §6 (tableau de Nina), ADR 0104 (tuile Marketing).
- Suppression de compte : détacher l'auteur. Registre des traitements : photos de personnes.
- Conditions restaurateurs et conditions d'abonnement.
- `lib/seo-pages.ts` : ne rien ajouter.
- Nouvel établissement ou compte démo : pas d'article, pas de bloc.
- Landing et fiche marketing : ne rien promettre avant la livraison.

## Trace

- Par article : lectures, appuis sur « Voir la carte ».
- Par établissement : articles publiés, retirés ; refus au contrôle par motif ; signalements et masquages.
- Brouillons de Nina : publiés tels quels, modifiés, abandonnés.
- **Seuils proposés, après 8 semaines d'espace ouvert** : moins de 2 articles publiés par établissement (l'outil ne sert pas) ; moins de 30 lectures par article (personne ne les voit : retirer le bloc ou rouvrir l'indexation) ; plus de la moitié des brouillons de Nina abandonnés (consigne à revoir).
- Les lectures comptées peuvent inclure des robots. L'effet sur les ventes n'est pas mesuré.

## Alternatives rejetées

- **Indexer dès maintenant** : rouvre l'ADR 0108 §1 sans lecteur ni mesure.
- **Articles écrits dans le dépôt**, comme le blog Boosteats : une publication de code par article.
- **Éditeur libre (HTML, liens)** : rendu cassé, hameçonnage, contrôle impossible.
- **Publication automatique par Nina** : contraire à l'ADR 0089.
- **Photos dans un espace public** : un brouillon ou un article retiré resterait accessible par son adresse.
- **Un outil de blog extérieur** : sort le client de la page de commande.

## Restent ouverts

1. ~~Indexation par Google.~~ **Tranché le 2026-11-26** : non, pour l'instant.
2. ~~Lien avec l'espace de commande.~~ **Tranché le 2026-11-26** : le blog dépend de l'espace (forfait Pro).
3. ~~Place du bloc.~~ **Tranché le 2026-11-26** : un bloc compact avant la carte.
4. ~~Nina dès le début.~~ **Tranché le 2026-11-26** : non, d'abord l'écriture à la main.
5. Cadre juridique (§7).
6. Aperçu d'un lien partagé (image sur WhatsApp), version ordinateur, limites et seuils.
