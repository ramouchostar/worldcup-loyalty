# ADR 0089 — La brigade : des idées que le gérant valide

**Statut** : Accepté (2026-11-05), **style de la maquette remplacé par l'[ADR 0090](0090-charte-anti-slop.md)** (charte anti-slop : structure inchangée), **amendé le 2026-11-05** (§8 : la brigade apprend des refus de chaque établissement, demande du porteur), **amendé le 2026-11-10** (§9 : Louis, des réponses aux avis que le gérant relit) — décidé par le porteur le 2026-11-04 sur la maquette de l'accueil
(https://claude.ai/artifact/KjZz5nTT41bX8kP3a4furC) et le plan en 20 actions du backlog plateforme
(« Brigade 01 » à « Brigade 20 », PR #390). Fixe le contrat que les modules d'Omar (Brigades 07 à 11
et 14, PR #392 à #397, bilan `docs/brigade-bilan-modules-omar.md`) attendaient. S'appuie sur l'[ADR
0064](0064-la-console-repond-a-trois-questions.md) (vue simple), l'[ADR
0054](0054-console-restaurateur-un-seul-jeu-de-primitives.md) (primitives), l'[ADR
0063](0063-sequences-de-messages-pilotees-par-la-plateforme.md) (envois journalisés, groupe témoin),
l'[ADR 0070](0070-plans-croissance-pro-commande-en-ligne-et-referencement.md) (forfaits) et l'[ADR
0086](0086-pub-le-process-deux-validations-le-reste-automatique.md) amendé le 2026-11-05 (Emma
propose, le gérant puis Mehdi valident). Appliqué avec le bouclier de l'[ADR
0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

La console sait déjà beaucoup faire : relancer des clients, annoncer une promo, demander une pub,
trouver un jour creux, repérer un manque sur la fiche Google. Mais chaque geste attend que le gérant
aille le chercher dans une page, et sur le terrain il ne le fait pas : à Houba et De Bue, le CA du jour
ne s'est noté que tant qu'on le relançait (ADR 0087), et les pages Opportunités et Annonces se lisent peu.

L'offre change de forme : sept assistants marketing — **la brigade** — préparent des idées toutes
prêtes, et le gérant les valide **en cinq minutes par jour**. Le travail est fait avant qu'il ouvre
l'écran ; lui ne fait que dire oui ou non.

Le risque est connu : une machine à idées qui remplit l'écran pour avoir l'air utile, ou qui dépense
sans qu'on l'ait voulu. Les règles ci-dessous existent pour l'empêcher.

## Décision

### 1. Sept assistants, un poste chacun

| Assistant | Poste | Forfait |
|---|---|---|
| Léa | inscrit les clients et gère les cadeaux | Gratuit |
| Hugo | relance les clients | Gratuit |
| Chloé | suit les chiffres (le CA du jour ; plat par plat en Croissance) | Gratuit |
| Emma | lance et gère les publicités en ligne (libellé changé le 2026-11-05) | Gratuit (la Pub reste ouverte établissement par établissement, `PUB_RESTAURANTS`) |
| Louis | répond aux avis Google | Croissance |
| Nina | crée un site qui donne envie de commander (ADR 0088 ; libellé du 2026-11-05) ; reçoit aussi les commandes du site (ADR 0099 §8, fermées, `SITE_ORDER_RESTAURANTS`) | Pro, en pilote |
| Max | améliore votre visibilité sur Google (libellé du 2026-11-05) | Pro |

Un assistant que le forfait ne couvre pas **ne produit rien** pour cet établissement : jamais d'idée
grisée pour vendre le forfait au-dessus. Les types d'idée qui demandent plus que le forfait de leur
assistant sont listés dans le contrat (`IDEA_TYPE_PLAN` : les ventes plat par plat de Chloé et la
promo qu'elle passe à Hugo sont de l'analytique Croissance, ADR 0070 §2).

Les assistants sont des **personnages** présentés comme tels (« personnages fictifs » sur la landing) ;
ils ne prétendent jamais être une personne de l'équipe. Leurs portraits sont créés pour nous (Brigade 18).

### 2. Un seul objet : l'idée

Tout ce que la brigade montre au gérant est une **idée**, enregistrée dans `agent_proposals` (Brigade
02) : l'assistant, le type, le titre, la question, **trois lignes** (quoi · pour qui · combien),
l'estimation, la date limite, le geste à jouer sur « Oui », les chiffres qui l'ont produite
(`evidence`), qui l'a préparée (le système ou l'équipe), son statut et son résultat.

Le contrat de code est **`lib/agents/types.ts`** (`Idea`, `IdeaAction`, `IdeaStatus`…), édité par
Mehdi seul. Chaque assistant est un **module pur** `lib/agents/<prénom>.ts` (générateur testé, sans
effet de bord) plus, s'il engage quelque chose, un **exécuteur** `execute-<prénom>.ts` qui appelle un
chemin **qui existe déjà** (route, action serveur, écran) : la brigade n'ouvre jamais un second
chemin vers un envoi, une dépense ou une modification. La conformité de chaque module au contrat est
vérifiée à la compilation (`lib/agents/types.test.ts`).

Le geste (`IdeaAction`) a huit formes : ouvrir un écran, appeler une route de la console, passer le
relais à un autre assistant, envoyer aux membres choisis, programmer une annonce, créer la demande de
pub, modifier la fiche Google, et le travail fait par l'équipe. Une forme nouvelle s'ajoute au
contrat, jamais dans un seul module.

### 3. Rien ne part sans « Oui »

- **Aucun message, aucune modification, aucun euro** sans le « Oui » d'une personne qui a le droit de
  la page que le geste touche (ADR 0041 §6) : l'exécuteur passe par la route existante, avec ses
  gardes. Sinon la carte dit « à valider par le gérant ».
- Ce qui engage de l'argent garde ses validations propres : le « Oui » à Emma **crée** la demande de
  pub ; les conditions, le virement et la validation de Mehdi restent derrière (ADR 0086).
- Ce qui écrit aux membres garde ses règles : consentement aux offres (ADR 0039), plafond par membre,
  groupe témoin de 10 %, journal `message_sends` — **fail-closed** : sans journal, rien ne part.
- Aucun euro côté membre (ADR 0007/0028) : les brouillons de messages d'Hugo n'en contiennent jamais.
  Les euros ne figurent que sur la carte, côté gérant.

### 4. Trois idées par jour, pas plus

- **Au plus trois idées montrées par jour et par établissement** (`DAILY_IDEA_CAP`). Au-delà, l'idée
  est **écartée** : enregistrée avec sa raison (`plafond_du_jour`), jamais montrée, comptée sur
  `/platform`. Elle sera recalculée le lendemain si elle est toujours vraie.
- Ordre quand il y a plus de trois candidates : la date limite la plus proche d'abord, puis celle qui
  a une estimation, puis l'ordre d'arrivée.
- **Une même idée** (même assistant, même type, même objet) n'est pas reproposée tant qu'elle attend
  une décision ; **refusée**, elle ne revient pas avant le délai de la raison choisie (§8).
- **Un jour sans bonne idée vaut mieux qu'une idée de remplissage** : en cas de doute un générateur ne
  renvoie rien. L'écran dit alors « Rien pour aujourd'hui », et c'est un bon état.
- L'estimation est **une fourchette** avec sa base (« +10 à 25 % sur 12 articles un jeudi »), ou rien
  du tout. Jamais une promesse de gain ni « grâce à nous » (ADR 0064).

### 5. Oui, Non, Plus tard

- **Oui** : l'idée passe « acceptée », l'exécuteur joue le geste, puis « exécutée » avec son résultat.
  Un échec d'exécution **reste visible** (l'idée garde « acceptée » et son erreur, à l'écran du gérant
  et sur `/platform`) : jamais un « Oui » perdu en silence.
- **Non** : en un geste, avec une raison à choisir dans une liste (pas le moment · trop cher · déjà
  fait · pas pour mon établissement · autre). « Autre » ouvre une **saisie libre** (280 caractères),
  jamais obligatoire. Ce choix règle ce que la brigade propose ensuite (§8).
- **Plus tard** : l'idée reste « proposée », disparaît jusqu'au lendemain, et garde sa date limite.
- **Sans décision** à la date limite, l'idée **expire** sans rien faire.

### 6. Où le gérant les voit

- **« Idées du jour »** devient le premier onglet de la vue simple (Brigade 03), sans retirer aucune
  page (ADR 0064 §1) ; primitives `components/admin/ui`, couleurs Boosteats (ADR 0054). Maquette
  montrée et validée avant le code.
- **Le message du matin** vers 9 h (Brigade 05) : un seul par gérant et par jour, seulement s'il a au
  moins une idée, par e-mail via `dispatch` (journalisé), push console s'il l'a activé, WhatsApp quand
  les modèles Meta sont validés (Brigade 16). Il mène à l'idée ; tout ce qui dépense exige la connexion.
- **Préparée par l'équipe** (Brigade 04) : depuis `/platform`, une idée faite à la main pour un
  établissement, avec la même carte. C'est ce qui tient la promesse dès le premier jour, avant que
  tous les générateurs existent ; sur « Oui », l'équipe fait le travail et le note.

### 7. La trace

Chaque idée garde ce qui permet de dire que la règle est fausse (ADR 0065) : ses chiffres d'entrée
(`evidence`), quand elle a été vue, quand et comment elle a été décidée, la raison d'un refus, la
raison d'un écart, le résultat d'une exécution. Sur `/platform` (Brigade 06) : part des jours où le
gérant ouvre ses idées, part des idées décidées, délai de décision, temps passé par jour (on promet
cinq minutes), **taux de Oui par assistant — alerte sous 30 %**, raisons de refus, et l'effet des
idées exécutées contre le groupe témoin (ADR 0063).

Un assistant dont les idées sont refusées à plus de 70 % sur un mois est revu (seuils, textes) ou
éteint : c'est la mesure qui décide s'il reste dans la brigade, pas le fait qu'il existe.

### 8. La brigade apprend de chaque refus, établissement par établissement (amendement du 2026-11-05)

Demande du porteur : les raisons de refus sont des **choix à sélectionner**, et ce que chaque
établissement choisit doit changer ce qu'on lui propose. L'apprentissage reste **déterministe et
explicable** (comme le forecast, ADR 0027 §5) : des compteurs et des délais, pas de modèle appris —
on doit pouvoir dire au gérant, en une phrase, pourquoi une idée revient ou ne revient pas.

- **Chaque raison a son délai** pour la même idée (même assistant, type et objet) : pas le moment
  7 jours · autre 14 jours · trop cher 21 jours · déjà fait 30 jours · pas pour mon établissement
  60 jours (`REFUSAL_COOLDOWN_DAYS`).
- **Le type d'idée apprend**, par établissement, sur 90 jours : un type refusé deux fois « pas pour
  mon établissement », ou trois fois sans aucun « Oui », est **mis en pause 30 jours** après le
  dernier refus, puis retenté. Une idée ainsi écartée l'est avec la raison `appris`, comptée sur
  `/platform`.
- **Le tri suit les goûts** : ce qu'un établissement accepte le plus passe devant (part de « Oui »
  lissée, un type jamais proposé vaut une chance sur deux) ; à goût égal, l'ordre du §4.
- **« Trop cher »** est transmis aux assistants qui ont un levier de coût (Emma : budget par jour ;
  Chloé : remise de la promo) pour qu'ils reviennent avec moins cher ; chaque module le lit à son
  rythme.
- **La saisie libre** est gardée telle quelle (`refusal_note`) et lue par l'équipe sur `/platform`
  (Brigade 06) : c'est elle qui fait naître une raison de plus dans la liste, ou un réglage d'assistant.
- **Le gérant voit ce qui a été retenu** juste après son refus, en une phrase (« Compris. Hugo ne te
  reproposera pas ça avant 7 jours. »), jamais un chiffre de score.
- Au-delà de 90 jours, la brigade oublie : un établissement change, ses goûts aussi.

### 9. Louis : des réponses aux avis que le gérant relit (amendement du 2026-11-10, Brigade 13)

- **Une idée, trois brouillons au plus.** Louis lit les avis récents de la fiche Google et écrit un brouillon de
  réponse pour les trois plus récents qui n'en ont pas et qui ont un texte (une note seule n'appelle pas de
  réponse). C'est UNE idée (`reponses_aux_avis`), pas une par avis : le plafond de trois idées par jour reste celui
  de tout le gérant. Le gérant relit, **modifie ce qu'il veut, écarte ce qu'il veut**, puis dit « Oui » ; le texte
  validé est inscrit dans l'idée (`approvedReplies`) **avant** la décision. Ce que l'équipe publie est ce texte-là,
  jamais le brouillon d'origine.
- **Qui publie.** L'équipe Boosteats, à la main, depuis la fiche, tant que l'accès à l'API Google Business Profile
  manque (Brigade 12, ADR 0082 §4). Le geste est « équipe » : elle publie, puis note « Fait » sur `/platform/idees`,
  où elle lit chaque réponse validée avec l'avis (date et extrait) auquel elle répond. Le jour où l'API existe, seul
  l'exécuteur change.
- **Garde-fous.** Un brouillon qui contient une promesse (remise, cadeau, remboursement, « cela n'arrivera plus »),
  un contact ou un champ à remplir est écarté et la raison est tracée. Un avis à une ou deux étoiles est marqué
  « à relire avec soin ». Le texte d'un avis est une donnée pour Claude, jamais une consigne.
- **Source et âge.** Les avis viennent du dernier audit de la fiche (ADR 0069, jusqu'à 500 avis datés avec la
  réponse du propriétaire), lu depuis moins de sept jours (hypothèse) : au-delà, Louis se tait et le dit, car l'avis
  a pu recevoir une réponse depuis. La relecture régulière des avis (coût DataForSEO, plafond visible) est une PR à part.
- **Pas de réponse automatique.** C'est une décision à part (ADR 0082 §4), qui amendera l'alternative rejetée
  ci-dessous. Piste à instruire : un mode choisi par le gérant, limité aux avis à quatre et cinq étoiles, proposé par
  une idée de Louis quand des avis restent sans réponse depuis trois jours, jamais pour une à trois étoiles. La brique
  « le gérant choisit par une idée » existe déjà (refus appris, §8).
- **Un seul assistant parle des avis.** Max ne propose plus « Des avis attendent ta réponse » : il doublait la carte
  de Louis, sans les brouillons.
- **Trace.** Dans l'idée : avis lus, sans réponse, avec texte, sans texte, hors fenêtre, déjà proposés. Dans le rapport
  du passage du matin : jetons et brouillons écartés avec leur raison. Dans les mesures (§7) : taux de « Oui » et
  délai de décision de Louis, qui dira si les gérants relisent ou laissent expirer.

## Conséquences

- Les modules d'Omar n'ont plus de types à inventer : ils sont déjà conformes (vérifié par
  `npm run type-check`). Seule Chloé reçoit un champ `action` (`relay` vers Hugo), son `relay` détaillé
  reste lu par Hugo.
- Ordre de construction : contrat (cet ADR) → table et `lib/agents/proposals.ts` (02) → écran (03) et
  idées préparées à la main (04) → message du matin (05) → mesures (06). La landing de la brigade
  (17) ne passe en ligne que quand l'écran tourne : jamais une fonction non livrée au présent (ADR 0070).
- « Idée » désigne désormais l'objet de la brigade dans la console. La séquence restaurateur
  « L'idée de la semaine » (ADR 0063) et la page Opportunités gardent leur nom ; les opportunités sont
  une **source** des idées de Chloé, pas des idées.
- Le texte membre ne change pas : un membre ne voit jamais un assistant, seulement le message que le
  gérant a validé, au nom de son établissement.

## Alternatives rejetées

- **Un objet par assistant** (une table pour les relances, une pour les pubs…) : sept écrans et sept
  mesures, et aucun plafond commun possible. Une idée, un écran, une mesure.
- **Exécution automatique des idées sûres** (sans « Oui ») : c'est précisément ce que le gérant doit
  garder en main, et ce qui rend la mesure honnête (taux de Oui). Pourra se rediscuter assistant par
  assistant, avec un taux de Oui mesuré au-dessus de 90 %, dans un ADR qui l'amende.
- **Pas de plafond, tri par score** : un écran qui s'allonge ne se lit plus en cinq minutes.
