# ADR 0049 — Le cadeau paie chaque demande : l'app après le compte, une fois par visite

**Statut** : Accepté (2026-09-09) — complète l'[ADR 0048](0048-le-gain-avant-le-compte.md)
(qui a livré le gain et la formulation du compte) et amende l'[ADR 0038](0038-install-app-second-chance.md) §4
(portée des clés d'installation). Lot 6 du parcours cible « le ticket avant tout ».
Ne change rien au calcul des points ni des cadeaux (**ADR 0006**, **0017**, **0021**),
ni à l'anti-fraude (**ADR 0008**), ni au canal push lui-même (**ADR 0009**).

> **Où sont les documents source.** L'audit (`docs/audit-parcours.md`) et le plan
> (`docs/plan-parcours-cible.md`, arbitrages du porteur du 2026-09-04) vivent sur
> la branche **`claude/boosteats-audit-refonte-70b5re`**, jamais fusionnée — ils
> ne sont pas dans `master`. Le présent ADR se lit donc seul : tout ce qui est
> décidé est écrit ci-dessous.

## Contexte

L'ADR 0048 a livré le premier maillon de la séquence : le ticket est lu, le
cadeau est nommé, et c'est lui qui paie la demande de compte (« Crée ton compte
pour **réclamer ton cadeau** »).

Les deux demandes suivantes, elles, ne sont payées par rien. La feuille
post-ticket (`PostTicketSheet`) dit :

> **Et maintenant ?**
> Deux options pour ne rien rater de tes cadeaux — c'est toi qui choisis.

C'est un menu, pas un argument — et il tombe à l'instant précis où un cadeau
vient d'être nommé, donc à l'instant où l'argument est disponible et gratuit.
« Installer l'app · Tes cadeaux en un tap » parle d'un confort d'usage ; ce
qu'on a à offrir, c'est un burger qui attend au comptoir.

Sa **portée** est fausse aussi. La feuille était « une seule apparition par
appareil », et cette apparition se consommait au premier tap — y compris un tap
sur le fond de la modale, qui écrivait les trois drapeaux définitifs
(`post_ticket_sheet_done`, `pwa_prompted`, `push_prompted`) sans qu'aucune
question ait été lue. C'est la friction **M6** de l'audit : le geste le plus
banal du mobile — taper à côté — supprimait définitivement la seule proposition
d'installation du parcours. Or l'installation conditionne les notifications
push (ADR 0009), c'est-à-dire tout le rappel proactif.

## Décision

### 1. La séquence, et pourquoi l'app ne peut pas passer avant le compte

Ordre retenu par le porteur (option A du plan, tranchée le 2026-09-04) :

```
gain  ──►  compte           ──►  app                ──►  notifications        ──►  équipes
           « réclame ton         « pour le               « pour savoir quand
             cadeau »              récupérer »             il t'attend »
```

L'intention produit était **app d'abord** : l'app est la porte du cadeau, donc
elle se mérite en premier. Elle est écartée pour une raison technique qui doit
rester écrite ici, sinon quelqu'un « optimisera » l'ordre dans six mois :

> **Sur iOS, l'app avant le ticket perd le ticket.** Ajouter un site à l'écran
> d'accueil crée un **conteneur de stockage séparé** de Safari : ni les cookies
> ni l'IndexedDB ne suivent. Or c'est exactement là que vit la photo
> (`lib/pending-ticket.ts`) et la chaîne de reprise (`pending_restaurant_id`,
> `pending_ticket`). La personne installerait l'app, l'ouvrirait, et trouverait
> un écran vierge — sans ticket, sans cadeau. Aucun contournement propre : depuis
> Safari, aucun lien ne peut ouvrir l'app installée en lui passant un jeton,
> l'app installée démarre toujours sur `start_url`. Sur Android le problème ne se
> pose pas (stockage partagé avec Chrome, `beforeinstallprompt` installe sans
> quitter la page).

La conséquence est plus stricte que « après le compte » : elle est **après la
soumission**. Le compte créé ne sauve rien à lui seul — la photo reste dans
l'IndexedDB du navigateur jusqu'au tap sur « Envoyer mon ticket ». Le seul
instant où quitter Safari ne coûte plus rien est celui où le serveur a le
ticket. La feuille reste donc **sur l'écran de résultat de la soumission**, là
où elle est déjà, et n'a rien à faire sur l'aperçu OCR.

Il n'y a pour autant **aucun écran supplémentaire** : le compte, l'app et les
notifications s'enchaînent dans le même parcours d'écran de ticket.

### 2. Ce que chaque demande coûte, et avec quoi on la paie

| Demande | Argument | Où |
|---|---|---|
| Le compte | « Crée ton compte pour **réclamer ton cadeau** » | carte de gain visiteur (livré par l'ADR 0048 §5) |
| Le compte (branche e-mail) | « **Réclame ton cadeau** — ton {cadeau} t'attend au comptoir » | `/signup` (§5 ci-dessous) |
| L'app | « **Pour récupérer** ton {cadeau} à ta prochaine visite, sans rouvrir le navigateur » | feuille post-ticket |
| Les notifications | « **Pour savoir quand** ton {cadeau} t'attend, et quand ton équipe monte » | feuille post-ticket |

Le titre de la feuille devient le cadeau lui-même — « **Finest burger — à
récupérer au comptoir** » — et son sous-titre dit ce qu'il reste à faire :
« Encore deux choses, et ton Finest burger te retrouve à ta prochaine visite. »

**Sans cadeau nommé, on ne fabrique pas la promesse.** Rien d'atteint, grille
non configurée, ou cadeau déjà actif (ADR 0011) → les libellés neutres actuels
restent. Même règle que l'ADR 0048 §5 : le cadeau paie la demande quand il
existe, jamais une promesse à sa place.

Les mots interdits ne changent pas : jamais « validé », « vérifié »,
« automatique » ni « instantané » (ADR 0008) ; jamais un euro, un seuil ou un
coût (ADR 0007/0028). Le nom du cadeau est un nom d'article, rien d'autre.

### 3. Une fois par **visite**, pas par appareil

C'est le changement de portée, et il tient à séparer trois questions que le code
avait confondues en une seule clé :

| Question | Où c'est écrit | Portée |
|---|---|---|
| La feuille est-elle déjà apparue **cette fois-ci** ? | `post_ticket_sheet_visite` (`sessionStorage`) | la visite |
| La **première** proposition a-t-elle eu lieu ? (passe la main à la carte permanente, ADR 0038 §4) | `pwa_prompted` (`localStorage`) | l'appareil |
| La question de l'installation est-elle **tranchée** ? | `pwa_install_settled` (`localStorage`) | l'appareil |

Ce qui en découle :

- **Un tap sur le fond de la feuille, ou « Plus tard », ne valent que pour la
  visite en cours.** La feuille revient à la prochaine visite, une fois, sur
  l'écran de résultat du ticket. « Plus tard » veut dire plus tard.
- **Seule une réponse explicite est définitive** : le dialogue natif du
  navigateur annulé, ou « C'est fait ✅ » déclaré sur le chemin manuel iOS. Dans
  les deux cas la personne a répondu — la feuille arrête de demander.
- **Les notifications n'ont plus de drapeau du tout** : `Notification.permission`
  est déjà la mémoire du navigateur (« denied » ne revient jamais tout seul).
  L'ancienne clé `push_prompted` ne faisait que la dupliquer, et mal — elle
  était posée même sur un tap dans le vide.
- La carte d'installation permanente (ADR 0038) n'est **jamais** silencée par un
  refus : ce qui doit la faire disparaître, c'est l'installation faite. Elle
  reste le rattrapage, et elle prend la main dès la première apparition de la
  feuille.

Le mot « visite » désigne ici une **session de navigateur sur l'appareil**
(`sessionStorage`) — rien n'est identifié, rien n'est compté, rien ne remonte.
Sans rapport avec l'**Arrivée** du glossaire, qui est une mesure serveur
(ADR 0037) et dont le vocabulaire proscrit justement « visite ».

### 4. La question d'équipe passe après

Elle était posée **avant** la feuille sur l'écran de succès (la feuille
attendait, via `hold`). Les deux ordres se défendent — les deux demandes sont
payées par le même cadeau — mais la séquence tranchée met les équipes en
dernier, et pour une raison : l'app et les notifications sont ce qui permet de
revenir vers la personne plus tard. La question d'équipe, elle, se repose toute
seule (relance serveur à une semaine, ADR 0031) ; l'installation non.

La feuille libère donc la question d'équipe quand elle a fini son tour — y
compris quand elle **ne s'ouvre pas** (app déjà installée, permission déjà
tranchée, visite déjà servie), sans quoi la question d'équipe resterait derrière
une feuille qui ne vient jamais.

### 5. Le cadeau voyage jusqu'à l'écran d'inscription

Qui choisit « Continuer avec un e-mail » quitte l'écran du ticket pour `/signup`,
qui disait « **Créer un compte** · 10 secondes suffisent ». L'argument gagné à
l'écran précédent s'évaporait à l'écran exact où il devait payer.

Le nom du cadeau suit donc la personne (`sessionStorage`, `lib/claim-reward.ts`)
et `/signup` titre « **Réclame ton cadeau** · Ton {cadeau} t'attend au comptoir.
Un compte de 10 secondes, et il est à toi. » Sans cadeau, le titre neutre reste.

Une donnée d'**affichage** : `sessionStorage` et non un cookie, parce que le
serveur n'en a aucun usage et qu'elle ne doit pas survivre à l'onglet. Elle
traverse la navigation vers `/signup` comme l'aller-retour OAuth (même onglet,
même origine), et elle est oubliée dès que la session existe. Le **bouton**, lui,
reste « Créer mon compte » : c'est ce qu'il fait, et l'ADR 0008 interdit de
laisser croire que le cadeau est déjà acquis.

### 6. L'écran « vérification en cours » reçoit la feuille aussi

C'est le seul écran du parcours qui **promet** une notification — « Tu seras
notifié dès que la vérification est terminée » — et le seul à ne l'avoir jamais
demandée : un ticket parti en file admin (ADR 0008) n'atteignait pas l'écran de
succès, donc jamais la feuille. La promesse tombait à plat.

Aucun cadeau à nommer ici (rien n'est validé) : c'est la notification elle-même
qui paie la demande — « Ton ticket est en vérification. Active les notifications
pour savoir dès qu'un cadeau t'attend. »

### 7. L'interrupteur ne devient pas rouge

`brand_accent` résout en rouge pour Kraainem (`lib/branding.ts`) : un
interrupteur qui passe au **rouge** quand on l'active annonce une bonne
nouvelle avec la couleur d'une alerte. Il passe au **vert en dur**, comme la
carte de gain et la carte « Cadeau visé » (ADR 0048 §7). Le lien « C'est
fait ✅ » passe en gris pour la même raison. La charte garde ce qui lui revient :
le bouton de sortie de la feuille.

## Alternatives rejetées

- **L'app avant le compte** (l'intention initiale, option B du plan). Casse iOS :
  ticket et session perdus à l'ouverture de l'app installée, sur environ la
  moitié du parc. Rédhibitoire — voir §1.
- **Deux parcours, un par plateforme** (option C). Deux tunnels à écrire, à
  mesurer et à maintenir, une détection reposant sur l'UA, pour un gain marginal
  sur un seul OS.
- **Une feuille à chaque écran de succès** (au lieu d'une fois par visite). Deux
  tickets dans la même soirée poseraient deux fois la même question : ce n'est
  plus une proposition, c'est du harcèlement.
- **Un « Ne plus me le proposer » explicite.** Un troisième bouton pour exprimer
  un refus que le dialogue natif du navigateur exprime déjà, sur l'écran où l'on
  vient d'annoncer une bonne nouvelle.
- **Reporter de N jours** (`pwa_snoozed_until`). La clé existait, sans plus aucun
  écrivain depuis le retrait du tour de bienvenue (ADR 0044) : un compte à
  rebours invisible vaut moins qu'une règle qu'on peut énoncer — « une fois par
  visite ». Clé supprimée plutôt que laissée morte.
- **Porter le nom du cadeau dans un cookie serveur.** Une donnée d'affichage qui
  n'a rien à faire dans une requête ; et un cookie de plus à expirer.

## Conséquences

### Code
- `lib/pwa-install.ts` : `pwa_prompted` garde un seul sens (la première
  proposition a eu lieu) ; nouvelle clé `pwa_install_settled` + `installTranchee()`
  / `noterInstallTranchee()` ; `onboardingProposeDeja()` devient
  `premierePropositionDue()` (l'`OnboardingFlow` qu'elle nommait n'existe plus) ;
  `CLE_PWA_REPORTEE` supprimée.
- `components/member/PostTicketSheet.tsx` : clé de visite en `sessionStorage`,
  libellés payés par le cadeau, `reward`/`pending`/`onDone` en props, sortie
  « Plus tard » qui n'écrit rien de définitif, interrupteur vert.
- `components/member/SubmitOrderClient.tsx` : la feuille passe **avant** la
  question d'équipe et reçoit le nom du cadeau ; elle est aussi posée sur
  l'écran « vérification en cours » ; le nom du cadeau part vers `/signup`.
- `components/InstallAppCard.tsx` : suit le renommage, comportement inchangé.
- `lib/claim-reward.ts` (nouveau) : portage du nom du cadeau vers l'inscription.
- `app/(auth)/signup/page.tsx` : titre et sous-titre payés par le cadeau quand il
  y en a un.

### Coût
Aucun appel réseau, aucune requête, aucune migration. Trois clés de stockage
local au lieu de trois — mais des clés qui veulent dire quelque chose.

### Mesure
**Aucun événement ajouté**, comme pour l'ADR 0048 : l'entonnoir à dix étages est
le lot 3 du plan (`funnel_events`, compteurs serveur — GA4 est aveugle sous
Consent Mode, ADR 0037). Les signaux existants suffisent à lire l'effet de ce
lot : `pwa_installed` (agrégat Android), la balise `AppInstallBeacon` (mode
installé, par membre — ADR 0038) et `push_permission_granted`. Ce sont ces trois
courbes qui diront si la feuille payée par le cadeau installe plus que la feuille
« Et maintenant ? ».

### À surveiller
- **Sur iOS Safari, aucun refus explicite n'existe** : pas de dialogue natif,
  donc pas de « dismissed ». La feuille y reviendra à chaque visite tant que la
  personne n'aura ni installé ni tapé « C'est fait ✅ ». C'est le prix de la
  règle « une fois par visite » ; si le retour terrain la trouve insistante, la
  réponse est un report côté iOS, pas un retour au drapeau définitif.
- **Une personne qui installe l'app mais continue d'utiliser Safari** reste vue
  comme non installée par `estInstallee()` (conteneurs séparés) : c'est « C'est
  fait ✅ » qui la sort de la boucle, et lui seul.
- La carte permanente (ADR 0038) prend la main dès la **première** apparition de
  la feuille : les deux surfaces peuvent donc coexister sur la même visite (la
  feuille sur l'écran du ticket, la carte sur le dashboard). C'est voulu — deux
  endroits, pas deux fois la même question sur le même écran — mais à regarder
  sur le rendu réel.
