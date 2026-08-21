---
name: new-migration
description: Créer une nouvelle migration SQL Supabase au format horodaté anti-collision docs/migrations/YYYYMMDD-HHMM-slug.sql, avec l'en-tête standard du projet (quoi, pourquoi, ADR, RLS). Utiliser dès qu'on doit ajouter une table, une colonne, une RPC, une policy — ne jamais créer de fichier docs/mNN-*.sql (numérotation figée).
argument-hint: "<slug-en-minuscules> [ADR concerné]"
---

# /new-migration — migration horodatée (docs/migrations/README.md)

La numérotation `docs/mNN-*.sql` est **figée** (collisions à deux : m8, m15, m28, m29, m36,
m37, m48, m50). Le CI (`scripts/check-naming.mjs`) refuse tout nouveau `mNN`.

## Étapes

1. **Nom** : `docs/migrations/YYYYMMDD-HHMM-<slug>.sql` — date/heure **Europe/Brussels** de
   maintenant, slug = `$ARGUMENTS` (minuscules, tirets, ex. `stripe-subscription-columns`).
   Sous PowerShell : `Get-Date -Format "yyyyMMdd-HHmm"` ; sous bash : `date +%Y%m%d-%H%M`.
2. **Contenu** — en-tête commenté obligatoire, puis SQL **idempotent** :

   ```sql
   -- ============================================================
   -- <Titre court> (ADR 00XX §n)
   --
   -- Quoi / pourquoi en 3-5 lignes. Tables sensibles : RLS activée sans policy
   -- (= service-role only). Idempotent (IF NOT EXISTS / OR REPLACE). Non-cassant
   -- pour les lignes existantes (défauts, nullable).
   -- ============================================================
   CREATE TABLE IF NOT EXISTS ... ;
   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
   ```

3. **Code tolérant** : tant que les migrations sont appliquées à la main, le code qui lit la
   nouvelle table doit être **fail-open** (erreur → comportement par défaut, jamais de crash ;
   cf. `lib/entitlements.ts`, `lib/scan-meter.ts`).
4. **Vérifier** : `npm run check:naming` (format + unicité de l'horodatage).
5. **Documenter** : si l'app dépend de la migration, l'écrire dans CONTEXT.md / l'ADR ; dans la PR,
   une ligne « À APPLIQUER dans Supabase : docs/migrations/<fichier> ».
6. **Livrer** avec `/ship`. **L'auteur de la PR applique la migration en prod dès la fusion** et
   le note dans la PR.

## Interdits

- `docs/m61-*.sql` ou tout `mNN` : refusé par le CI.
- Deux migrations avec le même `YYYYMMDD-HHMM` : décaler d'une minute.
- `DROP` sans sauvegarde/justification dans l'en-tête.
