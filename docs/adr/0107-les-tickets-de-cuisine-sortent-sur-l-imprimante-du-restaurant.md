# ADR 0107 — Les tickets de cuisine sortent sur l'imprimante du restaurant

**Statut** : Proposé (2026-11-20). Choisit le principe d'impression que l'[ADR 0099](0099-le-site-de-commande-en-option.md) §2 laissait ouvert (Restent ouverts 4) et réalise ce que l'[ADR 0100](0100-les-options-se-reglent-par-groupes-de-plats.md) §9 appelait « rien n'est imprimé ». **Rien n'est construit** : cet ADR se valide avant le code. La commande du site reste fermée par `SITE_ORDER_RESTAURANTS` (vide) ; aucune imprimante n'a été essayée.

## Contexte

Aujourd'hui une commande du site est **lue à l'écran** : la console « Commandes du site » la montre avec ses tickets de cuisine par coin, et un carillon sonne tant que le restaurateur n'a pas dit « J'ai vu » (ADR 0099 §7 et §10). Le contenu des tickets est déjà calculé et testé (`lib/menu-options/tickets.ts`, logique pure : un ticket par coin, le prénom en grand, « SANS SALADE » en entier). **Aucun papier ne sort.** Le choix du découpage (un ticket par coin ou un seul, avec ou sans ticket « CAISSE · TOUT ») n'est pas enregistré.

Ce que veut le porteur (Omar, 2026-11-10) : un **ticket imprimé directement, sans intermédiaire** (pas de tablette de relais), quitte à acheter une imprimante réseau ou cloud plus chère ; un ticket par coin de cuisine ; un accusé quand la commande est sortie.

Contrainte qui décide de tout : notre serveur est sans état (Vercel). Il ne peut pas **ouvrir une connexion vers** une imprimante qui vit derrière la box du restaurant. C'est donc l'imprimante qui doit **venir chercher** ses tickets.

Ce qui a été lu le 2026-11-20 (documentation des fabricants, **aucun matériel essayé**) :

- **Star CloudPRNT** : l'imprimante envoie un POST à intervalle régulier avec son état (`statusCode`, 2xx = prête ; 410 plus de papier ; 420 capot ouvert) et son adresse MAC. Le serveur répond « un ticket est prêt » (`jobReady`, avec un jeton). L'imprimante le télécharge (GET), l'imprime, puis **confirme** (DELETE). Une erreur en cours d'impression arrive dans le POST suivant.
- **Epson Server Direct Print** : même principe, l'imprimante interroge une adresse à intervalle fixe et reçoit un XML (ePOS-Print). Non comparée en détail.
- **Prix** (un revendeur belge, logiscenter.be, 2026-11-20) : Star TSP143IV avec Ethernet, USB et CloudPRNT, environ **234 € HT** l'unité ; dix rouleaux de papier, environ 16 € HT.

## Décision (proposée)

### 1. L'imprimante interroge notre serveur

Jamais l'inverse. Le protocole est **Star CloudPRNT** en premier, derrière une interface (`PrinterProtocol`) pour qu'un second fabricant (Epson) s'ajoute sans toucher au reste. Raison : la documentation lue donne à l'imprimante une identité, des codes d'état (papier, capot), un **accusé par ticket**, et fonctionne derrière une box sans ouvrir de port. Epson n'est pas écarté : voir Restent ouverts 1.

### 2. Une file d'impression en base

Deux tables, service role seul, code tolérant à leur absence (sans elles : rien ne part, l'écran et le carillon de l'ADR 0099 §10 restent le filet) :

- `print_printers` : l'établissement, un nom (« Cuisine », « Pizza »), les **coins qu'elle dessert**, une clé secrète (hachée), la MAC, la date du dernier passage et le dernier état lu.
- `print_jobs` : la commande, l'imprimante, le **ticket figé** (le texte exact), l'état (`en_attente`, `envoye`, `imprime`, `en_erreur`, `abandonne`), le nombre d'essais, les dates.

### 3. Un ticket par coin, vers l'imprimante du coin

À l'enregistrement d'une commande, `buildTickets` (existant) produit les tickets ; chacun va à l'imprimante qui **dessert son coin**. Un coin sans imprimante va à l'imprimante « par défaut » de l'établissement ; sans imprimante par défaut, **rien n'est imprimé et l'écran le dit** (jamais un ticket perdu sans que quelqu'un le sache). Le découpage et le ticket « CAISSE · TOUT » deviennent des **réglages enregistrés** de l'établissement.

### 4. Le ticket est une photo figée

Écrit au moment de la commande : renommer un plat ou changer son coin plus tard ne réécrit pas un ticket déjà parti, et « Réimprimer » sort exactement le même.

### 5. Le texte

Texte simple, prénom et « SANS X » en grand. Les imprimantes thermiques ont un jeu de caractères limité (accents, « œ », guillemets typographiques) : tant que la page de codes n'est pas essayée sur le matériel choisi, un **tableau de repli** (œ → oe, guillemets droits, tiret simple) évite les caractères illisibles. À vérifier sur la première imprimante.

### 6. L'accès

Chaque imprimante a une **adresse secrète** (`/api/print/<clé>`) : l'imprimante ne signe rien, c'est la seule authentification qu'elle sait faire. Clé jamais en clair en base, **renouvelable** depuis la console. Le serveur vérifie que la clé et la MAC correspondent, sinon il répond comme si l'adresse n'existait pas.

### 7. L'état est montré, la panne est dite

La console affiche pour chaque imprimante « vue il y a 3 s », « hors ligne depuis 4 min » ou la cause quand l'imprimante la donne (« plus de papier », « capot ouvert »). Une imprimante est **hors ligne** après trois intervalles sans passage (seuil à mesurer).

### 8. Aucun échec silencieux

Un ticket pas imprimé deux minutes après la commande déclenche le **bandeau rouge et le carillon** de la console (l'alerte de l'ADR 0099 §10 devient le filet de sécurité de l'imprimante). Un ticket n'est pas renvoyé plus de deux fois sans qu'une personne le décide (un doublon de papier envoie deux fois le même plat en cuisine). « Réimprimer » est un geste du restaurateur.

### 9. Ce que le client voit ne change pas

La page de commande continue de dire « envoyée », pas « reçue par le restaurant » (ADR 0099 §9) : le suivi de l'état par le client n'existe pas. L'état « imprimé à 12:04 » est montré **à la console seulement**. Promettre la réception au client sera une PR à part, quand une imprimante aura réellement confirmé.

### 10. Imprimante hors ligne : on ne bloque pas les commandes dans la première version

L'ADR 0099 §2 écrivait que les commandes se bloquent côté client. Proposition : **non, pas encore**. Un restaurateur dont la box tombe ne doit pas perdre toutes ses commandes ; la commande est acceptée, le filet est l'alerte du §8. Bloquer suppose un message au client (« le restaurant ne peut pas prendre de commande pour le moment ») et un moyen de réouvrir : à décider (Restent ouverts 2).

### 11. Pas dans cette décision

Tiroir-caisse, ticket du client sorti sur l'imprimante, commandes de livraison, impression d'un établissement sans ticket de test réussi (voir « La mise en service »).

## La mise en service (la scène)

Le restaurateur branche l'imprimante au réseau, imprime la feuille d'état, ouvre la page de réglages de l'imprimante et y colle l'adresse que la console lui donne (« Ajouter une imprimante »), puis touche « Ticket de test ». La console dit « vue il y a 3 s » ou « jamais vue », avec la marche à suivre. **Un établissement n'est pas ouvert aux commandes tant qu'un ticket de test n'est pas sorti.**

## Trace (ADR 0065)

Délai entre la commande et « imprimé » (médiane et 90e centile ; **seuil : plus de 60 s au 90e centile** = trop lent pour un coup de feu) ; tickets non imprimés après deux minutes ; passages manquants par imprimante et par jour ; erreurs par code (papier, capot) ; part de réimpressions faites à la main (**plus de 5 %** = quelque chose cloche) ; **charge** : nombre d'appels de sondage par jour et par imprimante (la date du dernier passage s'écrit au plus toutes les 30 s). Requêtes dans `docs/mesures/suivi-impression.sql`.

## Échos à suivre (ADR 0065)

ADR 0099 §2 (l'imprimante confirme), §7 (« l'impression » hors tranche), §10 (sans imprimante), Restent ouverts 4 ; ADR 0100 §9 (« Rien n'est imprimé », jeu de caractères à tester) ; `CONTEXT.md` (**Commande du site** « à venir », **Coin de cuisine** ; un terme **Imprimante**, jamais confondu avec le ticket de caisse du programme) ; l'écran « Commandes du site » (état imprimé) ; `CLAUDE.md` (état actuel). Les échos marketing de l'ADR 0099 §8 ne bougent pas tant que le drapeau est fermé. **Vocabulaire** : un ticket de cuisine n'est jamais écrit dans `orders` (les tickets de fidélité).

## Conséquences

- **Matériel** : une imprimante réseau par poste d'impression, environ 234 € HT l'unité plus le papier. Qui l'achète et qui l'installe est une décision commerciale (Restent ouverts 3).
- **Sondage sur Vercel** : à un appel toutes les 5 secondes, une imprimante appelle environ 17 000 fois par jour (trois établissements, environ 52 000). Mesurer le coût avant d'ouvrir à d'autres ; l'intervalle se règle dans l'imprimante.
- **Jamais essayé sur du vrai matériel** : la première étape de code est testée contre un faux client qui rejoue le protocole, mais la preuve est l'achat d'**une imprimante de test**.
- **Dépendance au fabricant** : contenue derrière l'interface du §1.

## Alternatives rejetées

- **Une tablette ou une application de relais** : le porteur a dit « sans intermédiaire », et c'est un appareil de plus à garder allumé, branché et connecté (la panne du carillon, en pire).
- **Imprimer depuis le navigateur du restaurateur** : page ouverte obligatoire, fenêtre d'impression, aucun accusé. Même fragilité que le son.
- **Un mini-ordinateur local (Raspberry) qui interroge notre serveur** : matériel à installer et à dépanner chez chaque restaurateur.
- **Un service d'impression tiers** : un intermédiaire de plus avec les prénoms et téléphones des clients (ADR 0099, données personnelles) ; non évalué.

## Restent ouverts

1. **Fournisseur** : Star (proposé) ou Epson, et qui fournit le matériel.
2. **Bloquer les commandes** quand l'imprimante est hors ligne, ou garder l'alerte seule (§10).
3. **Qui paie et qui installe** l'imprimante.
4. **La caisse certifiée** (ADR 0099, Restent ouverts 3) : toujours à faire confirmer avant la première commande réelle.
5. **L'intervalle de sondage et le seuil « hors ligne »** : à mesurer sur le vrai matériel.
