# ADR 0033 — Console plateforme : comptes démo, chiffres réseau, backlog

**Statut** : Accepté (2026-08-15). Étend l'**ADR 0015 §7** (rôle super-admin plateforme) et l'**ADR 0030 §2/§7** (la console plateforme n'est pas une impasse). N'amende **ni l'ADR 0007** (aucun de ces chiffres ne redescend vers un membre) **ni l'ADR 0029** (le plan reste la seule mécanique de monétisation).

## Contexte

`/platform` était une page unique : file d'approbation, liste des établissements, trois formulaires de rattachement, et deux compteurs (« établissements actifs », « adhésions réseau »). Trois manques la rendaient inexploitable pour piloter le réseau à deux.

1. **Les chiffres ne distinguaient rien.** Les compteurs additionnaient les vrais établissements et tous ceux créés pour tester, démarcher ou faire une démonstration. Le seul chiffre qu'on regarde pour savoir où on en est était donc faux — et il alimentait aussi la **preuve sociale publique** (accueil, `/secteurs`) : annoncer à un prospect des établissements fictifs est un mensonge commercial.
2. **Aucune profondeur.** Deux totaux, aucune série temporelle. Impossible de répondre à « combien d'établissements activés ce mois-ci ? », « combien de membres se servent réellement de l'app ? », « où décroche-t-on entre la signature et un programme qui tourne ? ».
3. **Aucun endroit pour décider.** Le plan d'action vivait dans des conversations. Une décision prise devant des chiffres qu'on ne retrouve pas au moment de l'exécution ne survit pas à la semaine.

## Décision

### 1. `restaurants.is_demo` — un établissement fictif, pas un mode démo

Un compte démo est un établissement **ordinaire** : même table, même code, même parcours d'onboarding, même console admin, même app membre. **Aucune branche `if (isDemo)` nulle part** — un mode démo qui diverge du produit finit par démontrer un produit qui n'existe pas.

Sa seule différence est de **périmètre de visibilité** :

| Surface | Compte démo |
|---|---|
| Accueil `/` (preuve sociale) | exclu |
| `/secteurs` (ADR 0016) | exclu |
| `/join` — « Choisis ton restaurant » | exclu |
| `/platform/stats` | exclu par défaut, réintégrable par commutateur |
| `/r/[id]`, `/admin/[id]` — URL directe | **accessible** |

L'URL directe reste ouverte : c'est précisément ce qu'on ouvre devant un restaurateur. Ce qu'on retire, c'est la **découvrabilité** — personne ne rejoint un resto fictif par accident, et aucun chiffre public ne le compte.

La bascule est **réversible d'un clic** depuis la console (`Marquer démo` / `Passer en réel`), avec confirmation dans le sens qui rend public. La case « Compte démo » à la création rend l'option permanente pour les prochains établissements fictifs.

**Bascule initiale (m56)** : tous les établissements sauf `kraainem` passent en démo — à ce jour, Belchicken Kraainem est le seul en exploitation réelle. Le bloc ne s'exécute qu'au premier passage (aucun resto encore marqué démo) pour qu'un rejeu ne réécrase pas un reclassement manuel, et la migration liste en sortie les comptes démo portant de vraies commandes, à repasser en réel.

### 2. `/platform/stats` — les chiffres du réseau, en séries

Une page dédiée, super-admin exclusivement. Cinq séries mensuelles sur douze mois, **une mesure par graphique** (jamais deux échelles sur un même axe) : établissements activés, nouvelles adhésions, **membres actifs**, tickets validés, CA suivi. Plus un **entonnoir d'activation** (créés → actifs → restaurateur rattaché → catalogue prêt → premiers membres → programme vivant) et un tableau triable par établissement.

Deux définitions structurent la page :

- **Membre actif** = compte ayant fait valider **au moins un ticket** sur la période. C'est la seule mesure qui distingue un compte créé d'un client fidélisé ; « nombre de membres » seul se confond avec le nombre d'inscriptions.
- **Date d'activation** (`restaurants.activated_at`, m56) = passage en `active`, **distincte de `created_at`** : un établissement démarché est créé le jour du rendez-vous et activé plus tard. Sans cette colonne, la courbe d'activation raconte le rythme de saisie, pas celui de mise en ligne. Seule la **première** activation compte — réactiver un établissement désactivé ne le fait pas réapparaître comme nouveau.

Le CA réseau figure ici et **nulle part ailleurs** : ADR 0007 interdit les euros et le CA côté membre, ADR 0015 §7 limite le restaurateur à son propre établissement. La plateforme est le seul point du produit où ces données sont agrégées.

Agrégation en une passe applicative (lignes brutes chargées puis regroupées en JS) plutôt qu'en `count: exact` par établissement : une requête au lieu de 5 × N, et des agrégats croisés qu'un `COUNT` ne donne pas (membres actifs = `user_id` distincts). Ce choix tient tant que le réseau est petit ; le plafond de chargement est explicite et la page **dit** qu'elle est tronquée si elle l'atteint, au lieu de mentir en silence.

### 3. `platform_backlog` — le plan d'action dans la console, pas à côté

Une table (m56), service-role only, volontairement **plate** : un titre, un détail, un chantier, un état, impact, effort, une personne, une échéance, et un établissement optionnel. Pas de sprints, pas d'assignation par compte (on est deux — le champ est du texte libre), pas de fil de commentaires. Un backlog qui demande à être administré n'est plus tenu à jour.

**La priorité n'est pas saisie, elle est calculée** : `impact ÷ effort`. Saisir « P1 » ne force aucune comparaison et dérive en trois semaines ; noter un impact et un effort oblige à situer chaque action par rapport aux autres. L'étiquette de décision lit le **couple**, pas le score seul — « gros chantier » (fort impact, gros effort) et « à trancher » (faible impact, faible effort) valent tous les deux 1,0 mais n'appellent pas la même décision.

Le backlog vit **dans** la console parce que les décisions se prennent devant les chiffres : `/platform/stats` et `/platform/backlog` sont à un onglet l'un de l'autre, et un item peut pointer l'établissement concerné. Un Trello à côté se désynchronise du produit en quelques semaines.

`bloque` est un état distinct de `a_faire` : une action qui attend quelqu'un d'autre ne doit pas polluer la file de travail ni s'afficher comme « prochaine action ».

### 4. `/platform` devient un espace, pas une page

Quatre onglets (Réseau · Chiffres · Backlog · Membres) portés par un **layout**, jamais recopiés page par page. Le layout garde l'accès (`is_super_admin`) et porte la sortie vers l'app membre — mais **chaque page conserve son propre contrôle** : un layout Next.js encadre un rendu, il ne protège ni les Server Actions ni les requêtes d'une page.

## Conséquences

- Les compteurs publics et la console ne comptent plus la même chose qu'avant : le chiffre d'établissements affiché sur l'accueil **baissera** au passage de m56. C'est la correction d'un chiffre faux, pas une régression.
- Créer des établissements fictifs devient sans risque : ils n'atteignent aucune surface publique tant qu'ils sont marqués démo.
- Toute nouvelle surface publique listant ou comptant des établissements doit filtrer `status = 'active' AND is_demo = false` — `lib/demo.ts` (`listLiveRestaurants`) est l'unique porte d'entrée prévue pour ça. Oublier le filtre est une régression au même titre qu'exposer `target_revenue` côté client (ADR 0007).
- Les surfaces de la console restent tolérantes à m56 non appliquée (repli sur les colonnes historiques, bandeau explicite) : aucune page ne casse entre le déploiement du code et l'exécution de la migration.
- Le backlog contient des données internes fondateurs. RLS activée sans aucune policy, comme `owner_invites` (ADR 0032) et `plan_requests` (ADR 0029) : jamais lisible par la clé anon.

## Alternatives écartées

- **Un environnement de démonstration séparé** (base ou déploiement dédié) — le coût réel n'est pas l'infrastructure mais la **dérive** : un environnement démo se désynchronise du produit, et on finit par démontrer une version qui n'existe plus. Le drapeau sur la ligne garantit que la démo tourne exactement sur le code de production.
- **Un préfixe de nommage (`[DEMO] …`)** — une convention n'est pas une contrainte : rien ne l'applique aux requêtes, et le nom finit affiché tel quel devant le prospect qu'on essaie de convaincre.
- **Vues SQL matérialisées pour les chiffres** — la bonne réponse au moment où le réseau la justifiera. Prématuré à cette échelle : une vue matérialisée ajoute un cycle de rafraîchissement à maintenir pour agréger quelques milliers de lignes, et fige la définition de « membre actif » qu'on est encore en train d'affiner.
- **Notion / Trello / Linear pour le backlog** — meilleurs outils dans l'absolu, mais hors du contexte où les décisions se prennent. Le critère retenu n'est pas la richesse fonctionnelle, c'est la distance entre le chiffre et la décision.
- **Une colonne `priority` saisie à la main** — écartée pour la raison donnée en §3 : elle n'oblige à aucune comparaison.
