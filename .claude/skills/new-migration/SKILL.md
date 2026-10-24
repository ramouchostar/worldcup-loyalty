---
name: new-migration
description: Créer une nouvelle migration SQL Supabase au format de la CLI supabase/migrations/YYYYMMDDHHMMSS_slug.sql, avec l'en-tête standard du projet (quoi, pourquoi, ADR, RLS). Utiliser dès qu'on doit ajouter une table, une colonne, une RPC, une policy — ne jamais créer de fichier dans docs/migrations/ ni docs/mNN-*.sql (gelés).
argument-hint: "<slug_en_minuscules> [ADR concerné]"
---

# /new-migration — migration de la CLI Supabase (ADR 0074, docs/migrations/README.md)

`docs/mNN-*.sql` (m1…m60) et `docs/migrations/` (jusqu'au 2026-09-29) sont **gelés** : appliqués à la
main, la CLI ne les voit pas. Le CI (`scripts/check-naming.mjs`) refuse tout nouveau fichier dedans.

## Étapes

1. **Nom** : `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql` — date/heure de maintenant, slug =
   `$ARGUMENTS` (minuscules et tirets bas, ex. `stripe_subscription_columns`).
   Avec la CLI : `npx supabase migration new <slug>` crée le fichier au bon nom.
   À la main : `Get-Date -Format "yyyyMMddHHmmss"` (PowerShell) ou `date +%Y%m%d%H%M%S` (bash).
2. **Contenu** — en-tête commenté obligatoire, puis SQL **idempotent** :

   ```sql
   -- ============================================================
   -- <Titre court> (ADR 00XX §n)
   --
   -- Quoi / pourquoi en 3-5 lignes. Tables sensibles : RLS activée sans policy
   -- (= service-role only). Idempotent (IF NOT EXISTS / OR REPLACE). Non-cassant
   -- pour les lignes existantes (défauts, nullable).
   -- Si elle change des DONNÉES (UPDATE / INSERT / DELETE) : le dire ici, en clair.
   -- Ce que l'app fait tant qu'elle n'est pas appliquée : …
   -- ============================================================
   CREATE TABLE IF NOT EXISTS ... ;
   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
   ```

3. **Code tolérant** : tant que la migration n'est pas appliquée (la CI attend une approbation), le
   code qui lit la nouvelle table ou colonne doit être **fail-open** (erreur → comportement par défaut,
   jamais de crash ; cf. `lib/entitlements.ts`, `lib/scan-meter.ts`).
4. **Vérifier** : `npm run check:naming` (format, unicité de la version, postérieure à 20260929110000).
5. **Documenter** : si l'app dépend de la migration, l'écrire dans CONTEXT.md / l'ADR ; dans la PR,
   une ligne « Migration : supabase/migrations/<fichier> — appliquée par la CI après approbation ».
6. **Livrer** avec `/ship`. À la fusion, le workflow « Migrations » attend l'approbation d'un relecteur
   (environnement `production`) puis applique. **L'auteur vérifie que l'application a réussi** (onglet
   Actions) et le note dans la PR. Secrets absents ou échec → appliquer à la main dans l'éditeur SQL.

## Interdits

- Un fichier dans `docs/migrations/` ou `docs/mNN-*.sql` : refusé par le CI.
- Une version (14 chiffres) déjà prise ou antérieure à `20260929110000`.
- `DROP` sans sauvegarde/justification dans l'en-tête.
- Modifier une migration déjà fusionnée.
