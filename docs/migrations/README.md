# Migrations SQL — convention (à partir du 2026-08-21)

## Pourquoi ce dossier

La numérotation séquentielle `docs/mNN-*.sql` a produit **8 collisions** quand deux
personnes/agents ont travaillé en parallèle (m8, m15, m28, m29, m36, m37, m48, m50) :
choisir « le numéro suivant » exige de connaître l'état du voisin, ce qui est
impossible à deux. Les fichiers `m1…m60` restent là où ils sont (déjà appliqués en
prod), la numérotation `mNN` est **figée** — le script `scripts/check-naming.mjs`
(CI) refuse tout nouveau `m61+`.

## Règle

Toute nouvelle migration va ici, nommée par **horodatage** :

```
docs/migrations/YYYYMMDD-HHMM-slug-en-minuscules.sql
```

- `YYYYMMDD-HHMM` = date et heure (Europe/Brussels) de création → deux personnes ne
  peuvent pas collisionner ; l'ordre chronologique reste lisible.
- `slug` = ce que fait la migration (`add-stripe-columns`, `scan-meter`…), minuscules,
  tirets.
- Exemple : `20260821-1730-stripe-subscription-columns.sql`.

## Contenu — inchangé

- **Idempotente** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`) : rejouable sans casser.
- En-tête commenté : quoi, pourquoi, quel ADR, RLS/grants.
- Tables sensibles : `ENABLE ROW LEVEL SECURITY` sans policy = service-role only.

## Application

Les migrations sont encore appliquées **à la main** dans l'éditeur SQL Supabase.
Règle de collaboration : **l'auteur de la PR applique sa migration en prod dès la
fusion** et le note dans la PR (ou dans CONTEXT.md si l'app en dépend).
Tant que c'est manuel, le code qui dépend d'une migration reste **fail-open /
tolérant à son absence** (cf. `lib/entitlements.ts`, `lib/scan-meter.ts`).

Prochaine étape structurelle (chantier à part) : **Supabase CLI** (`supabase/migrations/`
+ `supabase db push`) — l'historique d'application est alors tenu par Supabase, plus
de « as-tu appliqué mXX ? », applicable en CI.
