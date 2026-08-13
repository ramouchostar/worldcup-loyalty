# ADR 0031 — Communautés déclarées par l'établissement & question de reconnaissance

**Statut** : Accepté (2026-08-11). Amende l'**ADR 0014** (§2 création & adhésion) et l'**ADR 0018** (§3 découverte d'équipes). Aucun changement aux couches de récompense (ADR 0006), au score (ADR 0028) ni au cooldown de changement d'équipe (ADR 0014 §4).

## Contexte

La mécanique d'équipes fonctionne, mais son amorçage repose sur un pari : qu'un membre prenne l'initiative de **créer** une équipe et de recruter son réseau. À l'ouverture d'un établissement, ce pari échoue presque toujours.

Trois frictions mesurables dans le code actuel :

1. **Créer une équipe est un acte coûteux** — nommer, typer, choisir une zone, puis recruter. Rejoindre une équipe qui existe déjà est un tap. Or la seule voie disponible au premier membre est la plus coûteuse des deux.
2. **La découverte est vide au démarrage** — « Équipes dans ta zone » (ADR 0018) n'affiche rien tant que personne n'a créé d'équipe, et une liste vide se lit « cette app est morte ».
3. **Le résultat typique est l'équipe fantôme de 1 membre** — déjà identifié comme tel par l'ADR 0018 §Contexte.

Une analyse comportementale préalable a écarté la solution intuitive — **détecter automatiquement** les écoles et entreprises autour du restaurant et pré-créer les équipes — pour trois raisons :

- **Données introuvables** : l'effectif d'une entreprise par unité d'établissement n'est pas publié en Belgique (ni BCE/KBO, ni OSM, ni Places). Le critère « > 100 employés » n'est pas calculable.
- **La carte n'est pas le territoire** : un dataset sait ce qui est *à proximité*, le restaurateur sait qui *entre réellement*. Il connaît sa clientèle mieux que n'importe quelle source externe.
- **Pré-créer des équipes industrialise le problème** qu'on veut résoudre : 15 équipes à 0 membre affichées dans une liste sont un signal social pire qu'une liste vide, et elles privent le premier arrivant du statut de capitaine — précisément ce que l'ADR 0014 protégeait en rejetant les « équipes créées par l'admin ».

## Décision

### 1. Le restaurateur déclare ses communautés — ce ne sont pas des équipes

Nouvelle table `team_suggestions` : jusqu'à **8** noms d'écoles, d'entreprises ou de quartiers par établissement, saisis à l'**étape 1 de l'onboarding** (facultatif) et modifiables ensuite dans **Réglages → « D'où viennent tes clients ? »**.

> **Une suggestion n'est pas une équipe.** Elle n'a ni score, ni membres, ni place au classement. Son nom n'est **jamais publié** tant qu'aucun membre ne s'y est reconnu.

C'est cette séparation qui règle d'un coup : les équipes fantômes, la preuve sociale négative, la pollution du classement, et l'exposition juridique à publier le nom d'un tiers de sa propre initiative.

### 2. L'équipe est matérialisée au premier « oui » — et ce membre devient capitaine

Le premier membre qui se reconnaît crée l'équipe (`teams.created_by = lui`) et `team_suggestions.team_id` est renseigné. Les suivants rejoignent normalement.

L'ADR 0014 tenait à ce qu'un humain porte l'équipe (« chaque membre recrute son propre réseau ») ; ce mécanisme le préserve intégralement — on supprime seulement **l'attente** d'un capitaine spontané, pas le capitaine.

Concurrence : deux « oui » simultanés créent deux équipes. Résolu par verrou optimiste — `UPDATE … WHERE team_id IS NULL` ; le perdant supprime son équipe (vide, sans score) et rejoint celle du gagnant.

### 3. La question de reconnaissance, en fin de tutoriel

Nouvelle étape de `OnboardingFlow`, **après** le tour guidé (dont la dernière bulle explique justement ce qu'apporte une équipe — la poser avant, c'est la poser à quelqu'un qui ne sait pas ce qu'il choisit) :

> « Te reconnais-tu dans une de ces équipes ? »
> 🎓 **EPHEC** · 🎓 **Athénée d'Ixelles** · 🏢 **Alma** · 🏘️ **Quartier Flagey**
> → *Aucune de ces équipes*

**Un seul écran, 4 propositions maximum affichées ensemble, un tap.** La reconnaissance est immédiate — on repère son école dans une liste, on ne délibère pas dessus. Une version en enchaînement oui/non (une proposition à la fois) a été essayée puis abandonnée : elle demandait jusqu'à 3 décisions pour arriver au même endroit, soit trois fois plus d'occasions d'abandonner en plein onboarding, pour une question qui ne mérite aucune délibération.

Règles d'affichage, non négociables :

- **Aucun point, aucun nombre de membres.** C'est une question d'identité (« je suis de cette école »), pas une comparaison d'équipes. Un chiffre transforme la reconnaissance en évaluation.
- **Jamais d'ordre par score ou par popularité.** Priorité aux communautés situées dans une zone déclarée du membre (ADR 0018), **aléatoire** à l'intérieur de chaque groupe. Classer par score reviendrait à afficher « voici l'équipe qui va bientôt franchir un palier » : le membre rejoindrait le leader plutôt que les siens, et le moteur de recrutement s'effondrerait.
- **Le vide devient un statut** : une communauté que personne n'a encore rejointe s'annonce « Sois le premier — tu en deviens capitaine », jamais « 0 membre ».

### 4. Aucune reconnaissance → aucune exclusion

Après « Aucune de ces équipes » (ou « Passer ») :

> 👍 **Pas de souci** — Tu peux continuer **sans équipe** : tes cadeaux personnels tombent à chaque commande, équipe ou pas. Une équipe ajoute simplement des cadeaux en plus quand vous commandez à plusieurs.

Deux sorties : **« Voir toutes les équipes → »** (la page équipe, avec le classement et la création) ou **« Plus tard »**. Le même message est repris en tête de la page équipe pour le membre sans équipe.

C'est la stricte vérité du modèle : la couche 1 solo (ADR 0006) n'a jamais dépendu d'une équipe, et l'ADR 0018 §1 a déjà acté que l'équipe est optionnelle. On le **dit** désormais au lieu de le laisser deviner.

### 5. Relance à une semaine, côté serveur

Toute sortie sans équipe arme `memberships.team_prompt_next_at = NOW() + 7 jours`. « Aucune de ces équipes » mémorise en plus **les propositions affichées** (`team_prompt_declined`) pour que la relance en présente **d'autres**, et non les mêmes. « Passer » ne juge rien : il repousse sans rien refuser.

L'état vit sur `memberships`, pas dans `localStorage` : la question doit revenir même sur un autre appareil, et ne doit pas revenir deux fois sur deux navigateurs. Scopé par établissement, comme le cooldown de changement d'équipe (ADR 0015 §5).

## Modèle de données (m54)

```sql
CREATE TABLE team_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'autre'
                CHECK (type IN ('ecole','entreprise','rue_quartier','taxis','autre')),
  zone          TEXT,
  team_id       UUID REFERENCES teams(id) ON DELETE SET NULL,  -- NULL = non matérialisée
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON team_suggestions (restaurant_id, lower(name));

ALTER TABLE memberships
  ADD COLUMN team_prompt_next_at  TIMESTAMPTZ,
  ADD COLUMN team_prompt_declined UUID[] NOT NULL DEFAULT '{}';
```

RLS : lecture réservée aux membres connectés (une suggestion non matérialisée relève de la connaissance client du restaurateur) ; écritures via service role, même convention que `teams`.

Retirer une communauté **déjà matérialisée** ne supprime pas l'équipe : la ligne passe `is_active = false`, l'équipe et son historique survivent, seul le raccourci d'adhésion disparaît.

## Conséquences

### Code
- `lib/team-suggestions.ts` (pur, client-safe) — constantes, normalisation, dédoublonnage, `pickPromptCandidates` (zone d'abord, aléatoire ensuite), `teamTypeEmoji` (source unique, `lib/teams.ts` la réexporte).
- `lib/teams.ts` — `replaceTeamSuggestions`, `listTeamSuggestions`, `listDiscoverySuggestions`, `getTeamPrompt`, `joinTeamBySuggestion` (verrou optimiste), `declineTeamSuggestion`, `snoozeTeamPrompt`. Extraction de `uniqueJoinCode` / `ensureScoreRow`, partagés avec `createTeam`.
- `POST /api/teams/suggestions` — `{ restaurantId, action: 'join' | 'decline' | 'later', suggestionId?, suggestionIds? }` (`decline` porte les propositions affichées, pas une seule).
- `components/member/TeamRecognitionPrompt.tsx` + étape `teams` dans `OnboardingFlow` (après `tour`).
- `become-a-partner` étape 1 + `admin/[id]/settings` → `CommunitiesForm`.
- `my-team` : bloc « Te reconnais-tu ici ? » et message de non-exclusion ; les équipes issues d'une communauté sont exclues de « Équipes dans ta zone » (sinon doublon, dont une version avec score).

### Métrique de succès
**Pas le nombre d'équipes** — cette fonctionnalité le gonfle mécaniquement, c'est une vanity metric. Suivre la **taille médiane des équipes actives** et le **% d'équipes ≥ 5 membres**. Si le nombre d'équipes monte et que la médiane baisse, la fonctionnalité a échoué : les membres sont éparpillés et les couches 2 et 3 (ADR 0006) restent inertes.

## Alternatives rejetées

- **Détection automatique des écoles et entreprises > 100 employés** : effectif non disponible par unité d'établissement en Belgique ; et le restaurateur est de toute façon une meilleure source que n'importe quel dataset de proximité. Reste envisageable **plus tard** comme pré-remplissage du formulaire (v2), une fois le comportement validé — jamais comme source autonome.
- **Créer réellement les équipes à l'avance** : industrialise l'équipe fantôme, prive le premier arrivant du statut de capitaine, publie des noms de tiers sans qu'aucun membre ne l'ait demandé.
- **Affecter le membre par défaut** à la communauté la plus probable : un employeur ou une école sur un classement public est une information que le membre doit choisir de divulguer. L'opt-in est ici un choix produit autant que juridique.
- **Poser la question au signup** : l'ADR 0018 §1 a précisément supprimé le barrage de l'équipe à l'entrée. La question arrive en fin de tutoriel, quand le membre sait ce qu'est une équipe.
- **Trier les propositions par score** : voir §3 — le moment identitaire deviendrait un moment stratégique.
- **Enchaînement oui/non, une proposition à la fois** (première implémentation, remplacée) : jusqu'à 3 décisions successives pour un choix qui se fait à la reconnaissance, donc autant d'occasions supplémentaires d'abandonner en plein onboarding. La liste unique livre le même résultat en un tap.

## Suite possible (hors périmètre)

**Fenêtre de grâce sur le changement d'équipe.** Le premier choix ne consomme pas le cooldown (`assignTeam` ne journalise un transfert que s'il existe déjà une équipe), donc la reconnaissance en un tap reste sans risque. Mais un membre qui se trompe est ensuite bloqué 30 jours (ADR 0014 §4). Un changement libre dans les 7 jours suivant la première adhésion supprimerait cette aversion au regret sans rouvrir le score-surfing — un membre à ~0 € de dépense n'a rien à surfer. Demande un amendement explicite de l'ADR 0014 §4.
