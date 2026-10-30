# ADR 0074 — Les migrations passent par la CLI Supabase, appliquées par la CI avec approbation

**Statut** : Accepté (2026-09-29) — mécanique en place, **mise en service à la main** (secrets et relecteur,
`docs/migrations/README.md` § Mise en place). Complète l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md)
(la trace) et clôt le « chantier à part » annoncé par `docs/migrations/README.md` depuis le 2026-08-21.

## Contexte

Les migrations s'appliquent **à la main** : l'auteur de la PR colle le SQL dans l'éditeur Supabase après la
fusion. Trois conséquences mesurées le 2026-09-29 :

- **Rien ne dit ce qui est appliqué.** Sur les 40 migrations horodatées, 28 se vérifient par le schéma
  (tables, colonnes, fonctions exposées par l'API) et leurs objets sont tous présents ; **12 ne se vérifient
  pas** (index, `GRANT`, `UPDATE`/`INSERT` de données). Des preuves indirectes en confirment 3 de plus
  (128 scans sans `user_id`, un article sans prix de revient, `position_hint` corrigé chez Houba et De Bue) ;
  **5 restent sans preuve** (`20260830-0218`, `20260918-0330`, `20260918-0400`, `20260918-0530`, `20260925-1530`).
- **L'application repose sur une personne et sur un copier-coller** : le SQL d'une PR arrive dans un message,
  avec le risque d'échappement (les `\d` d'un motif de clé ont failli être doublés le 2026-09-29).
- **Le code doit rester fail-open** partout, parce que « la migration est peut-être passée » n'est pas une
  information qu'on peut lire.

Il faut un historique tenu par l'outil et un point de contrôle humain avant la production.

## Décision

### 1. Geler l'existant, partir de maintenant

Les migrations d'avant (`docs/m1…m60` et les 40 de `docs/migrations/`) **restent où elles sont** et ne sont
**pas** confiées à la CLI. La CLI tient son historique dans `supabase_migrations.schema_migrations` : y ranger
les anciennes obligerait à les déclarer « appliquées » sans les rejouer (`supabase migration repair`), donc à
parier sur les 5 sans preuve — et en marquer une à tort la cacherait pour toujours ; les rejouer écraserait des
données (coûts à la pièce, soldes). Un dossier de plus que l'on gèle, comme `mNN` à m60, coûte moins cher :
pas de renommage des 40 fichiers, pas de lien cassé dans les ADR qui les citent.

### 2. Toute nouvelle migration : `supabase/migrations/YYYYMMDDHHMMSS_slug.sql`

Le format de la CLI (vérifié : `supabase migration new` produit `20260929125832_test_format.sql`, CLI 2.118.0),
version à 14 chiffres unique et postérieure à `20260929110000`. `scripts/check-naming.mjs` refuse tout
fichier neuf dans les dossiers gelés (avec le nom à utiliser à la place), un nom mal formé, une version
en double ou trop ancienne. `supabase/config.toml` (généré par `supabase init`, sans secret : uniquement des
`env(...)`) fixe le projet.

### 3. La CI applique, après approbation d'un humain

`.github/workflows/migrations.yml` : à la fusion d'un fichier de `supabase/migrations/` sur `master`, ou
à la demande, un job lie le projet, affiche l'historique distant contre les fichiers locaux, fait un **essai à
blanc** puis applique (`supabase db push`). Le job est dans l'environnement **`production`**, qui exige un
relecteur : rien ne part sans un clic. CLI épinglée (`2.118.0`).

**Aucune connexion à la production pendant une PR** : un workflow modifiable dans une PR pourrait lire le mot
de passe de la base. Les secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) sont
des secrets d'**environnement**, pas de dépôt. Le dépôt est public : aucun secret dans le code
(`check-naming` le contrôle déjà).

### 4. Ce qui reste manuel, dit clairement

Secrets absents ou job en échec : le job échoue **bruyamment** ; on applique alors à la main (éditeur SQL) et
on le note dans la PR. Une migration appliquée à la main n'est pas inscrite dans l'historique de la CLI : le
prochain `db push` la rejouera. **L'idempotence reste donc obligatoire.** Le code reste fail-open.

### 5. L'approbation porte sur les données

Une migration qui change des **données** (`UPDATE`, `INSERT`, `DELETE`) le dit en clair dans son en-tête :
c'est ce que le relecteur approuve (règle `.claude/rules/migrations.md`).

## La trace (bouclier)

- **Ce qui dira que la règle est fausse** : un job « Migrations » rouge ou jamais lancé alors qu'une
  migration a été fusionnée ; une migration appliquée à la main *et* par la CI avec un effet différent (un
  `UPDATE` de données rejoué) ; un relecteur qui approuve sans lire (approbation systématique en moins d'une
  minute) ; la connexion depuis GitHub qui échoue (le réseau des exécuteurs n'est pas documenté par Supabase).
- Le résumé de chaque exécution contient la liste des migrations en attente (essai à blanc).
- **Le premier vrai essai** est le lancement manuel à blanc (`Run workflow`), puis la première vraie migration.

## Conséquences

- Trois dossiers de migrations dans l'historique (gelés, gelés, actif) ; les ADR gardent leurs renvois.
- Deux manipulations humaines uniques : créer l'environnement `production` avec un relecteur et y mettre les
  trois secrets.
- Ce qui n'est pas vérifié : le comportement transactionnel de `db push` par fichier ; la connectivité depuis
  les exécuteurs GitHub ; le comportement de la CLI avec le fichier `.gitkeep` du dossier. Chacun se voit au
  premier lancement à blanc.

## Alternatives rejetées

**Ranger les 40 anciennes migrations dans `supabase/migrations/` et rattraper l'historique.** Renomme 40 fichiers,
casse des renvois d'ADR, et oblige à déclarer appliquées 5 migrations sans preuve.

**Rejouer tout (`db push --include-all`).** Les `UPDATE` de données écraseraient des valeurs changées depuis.

**Un essai à blanc sur chaque PR contre la production.** Exposerait le mot de passe de la base à tout workflow
modifiable dans une PR.

**Application automatique sans approbation.** Une migration qui touche des données doit être lue par un humain
juste avant.

**Rester à la main.** L'historique reste invisible et le copier-coller reste fragile.
