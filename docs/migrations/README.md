# Migrations SQL — trois ères, une seule règle aujourd'hui (ADR 0074)

| Ère | Où | Statut |
|---|---|---|
| Séquentielle | `docs/m1…m60-*.sql` | **Gelée** (8 collisions à deux : m8, m15, m28, m29, m36, m37, m48, m50). Appliquées à la main. |
| Horodatée, à la main | `docs/migrations/YYYYMMDD-HHMM-slug.sql` (2026-08-21 → 2026-09-29, 40 fichiers) | **Gelée**. Appliquées à la main. La CLI ne les voit pas. |
| **CLI Supabase** | `supabase/migrations/YYYYMMDDHHMMSS_slug.sql` | **Seule voie pour toute nouvelle migration.** Appliquée par la CI avec approbation. |

`scripts/check-naming.mjs` (CI) refuse tout nouveau fichier dans les deux dossiers gelés et vérifie le nom
et l'unicité de la version dans `supabase/migrations/`.

## Pourquoi on n'a PAS rangé les 40 anciennes dans `supabase/migrations/`

La CLI tient l'historique de ce qu'elle a appliqué (`supabase_migrations.schema_migrations`). Y ranger les
anciennes obligerait à les déclarer « appliquées » sans les rejouer (`supabase migration repair`) — or **5 sur 40
ne se vérifient pas par le schéma** (index, `GRANT`, `UPDATE` de données : `20260830-0218`, `20260918-0330`,
`20260918-0400`, `20260918-0530`, `20260925-1530`), et en déclarer une à tort la cacherait pour toujours.
Les rejouer serait pire : des `UPDATE` de données (coûts à la pièce, conversion des soldes) écraseraient des
valeurs changées depuis. Donc : on **gèle et on part de maintenant**. Sonde du 2026-09-29 : sur les 28
migrations vérifiables, tous les objets sont présents en base ; les migrations d'avant restent lisibles ici,
sous leurs noms d'origine (les ADR y renvoient).

## Ajouter une migration

`/new-migration <slug>` — ou `npx supabase migration new <slug>` — crée
`supabase/migrations/YYYYMMDDHHMMSS_slug.sql`. La version (14 chiffres) doit être **postérieure à
`20260929110000`** et unique.

- **Idempotente** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
  `CREATE INDEX IF NOT EXISTS`).
- **En-tête commenté** : quoi, pourquoi, quel ADR, RLS/grants, ce que l'app fait tant qu'elle n'est pas
  appliquée. **Si elle change des données** (`UPDATE`, `INSERT`, `DELETE`), l'en-tête le dit en clair :
  l'approbation porte dessus.
- Tables sensibles : `ENABLE ROW LEVEL SECURITY` sans policy = service-role only.
- Le code qui en dépend reste **fail-open** (cf. `lib/entitlements.ts`, `lib/scan-meter.ts`).

## Application : la CI, avec approbation

`.github/workflows/migrations.yml`. À la fusion sur `master` d'un fichier de `supabase/migrations/` :

1. le job « appliquer sur la production » **attend l'approbation** d'un relecteur (environnement `production`) ;
2. il lie le projet, affiche l'historique distant contre les fichiers locaux (`supabase migration list`),
   fait un **essai à blanc** (`supabase db push --dry-run`, visible dans le résumé du job) ;
3. puis applique (`supabase db push`). En cas d'erreur le job devient rouge : lire le journal avant de relancer.
   (Le comportement transactionnel exact par fichier n'a pas été vérifié : à confirmer sur la première
   migration réelle, et d'ici là écrire chaque migration pour qu'un rejeu soit sans danger.)

**Jamais de connexion à la production pendant une PR** (le mot de passe de la base ne doit pas être lisible
par un workflow modifiable dans une PR) : les secrets vivent dans l'environnement `production`.

Lancement manuel : Actions → Migrations → Run workflow (par défaut, **essai à blanc** : coche « Essai à
blanc » à faux pour appliquer).

**Secrets absents, ou job en échec** : le job échoue bruyamment (jamais un « vert » qui n'a rien appliqué).
Appliquer alors la migration à la main dans l'éditeur SQL Supabase, et le noter dans la PR. À la main, la
migration n'est **pas** inscrite dans l'historique de la CLI : le prochain `db push` la rejouerait (elle est
idempotente) — d'où la règle d'idempotence.

## Mise en place (une fois, par un humain)

1. **Jeton d'accès** : Supabase → Account → Access Tokens → nouveau jeton (lecture/écriture du projet). Jamais
   dans le dépôt ni dans une conversation.
2. **Référence du projet** : la partie de l'URL Supabase avant `.supabase.co`.
3. **Mot de passe de la base** : Project Settings → Database (à réinitialiser si perdu).
4. GitHub → Settings → **Environments** → nouvel environnement `production` → **Required reviewers**
   (au moins un humain) ; y ajouter les trois **secrets d'environnement** `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.
5. **Premier essai** : Actions → Migrations → Run workflow (essai à blanc). Il doit lier le projet et
   répondre « Remote database is up to date » (aucune migration dans `supabase/migrations/` pour l'instant).
   C'est aussi la preuve que la connexion depuis GitHub fonctionne (à vérifier : les documents Supabase ne
   disent rien du réseau des exécuteurs GitHub ; si la connexion directe échoue, utiliser la chaîne du pooler).
6. Facultatif, en local : `npx supabase login` puis `npx supabase link --project-ref <réf>` pour lancer
   `supabase migration list` ou `db push --dry-run` soi-même.

La première vraie migration passée par ce chemin sert de test grandeur nature : choisir une migration simple.
