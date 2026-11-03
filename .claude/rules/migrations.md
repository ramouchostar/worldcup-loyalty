---
paths:
  - "supabase/migrations/**"
  - "docs/migrations/**"
  - "docs/*.sql"
---

# Règles migrations SQL (chargées quand on touche à une migration)

- **Nouvelle migration = `supabase/migrations/YYYYMMDDHHMMSS_slug.sql`** (`/new-migration`, ADR 0074) :
  le format de la CLI Supabase, version à 14 chiffres, postérieure à `20260929110000`.
  `docs/migrations/` (2026-08-21 → 2026-09-29) et `docs/mNN-*.sql` (m1…m60) sont **gelés** : le CI refuse tout
  nouveau fichier dedans.
- **Idempotente** : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`. Rejouable sans casser.
- **Non-cassante** pour les lignes existantes : colonnes nullable ou avec défaut, jamais de
  `NOT NULL` sans backfill.
- **Sécurité par défaut** : tables sensibles → `ENABLE ROW LEVEL SECURITY` **sans policy**
  (= service-role only) ; RPC sensibles → `SECURITY DEFINER` + `REVOKE ... FROM anon, authenticated`.
  Jamais d'euros/CA exposés côté client (ADR 0007) via une nouvelle policy ou vue.
- **En-tête commenté** obligatoire : quoi, pourquoi, ADR concerné, ce que l'app fait si la
  migration n'est pas appliquée.
- **Application par la CI, avec approbation** : à la fusion sur `master`, le workflow « Migrations »
  attend l'approbation d'un relecteur (environnement `production`) puis lance `supabase db push`.
  Jamais d'application depuis une PR. Si les secrets ne sont pas configurés, le job échoue bruyamment :
  appliquer alors à la main (éditeur SQL) et le noter dans la PR. Le code qui dépend d'une migration
  reste **fail-open** jusqu'à son application.
- **Une migration qui touche des DONNÉES** (`UPDATE`, `INSERT`, `DELETE`) le dit dans l'en-tête, en
  clair, avec ce qu'elle change : l'approbation doit porter sur ça.
- Ne jamais modifier une migration déjà fusionnée : en créer une nouvelle (la CLI ne rejoue pas ce
  qu'elle a déjà appliqué).
