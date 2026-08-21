---
paths:
  - "docs/migrations/**"
  - "docs/*.sql"
---

# Règles migrations SQL (chargées quand on touche à une migration)

- **Nouvelle migration = `docs/migrations/YYYYMMDD-HHMM-slug.sql`** (`/new-migration`). La
  numérotation `docs/mNN-*.sql` est **figée à m60** — ne jamais créer `m61+` (le CI refuse).
- **Idempotente** : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`. Rejouable sans casser.
- **Non-cassante** pour les lignes existantes : colonnes nullable ou avec défaut, jamais de
  `NOT NULL` sans backfill.
- **Sécurité par défaut** : tables sensibles → `ENABLE ROW LEVEL SECURITY` **sans policy**
  (= service-role only) ; RPC sensibles → `SECURITY DEFINER` + `REVOKE ... FROM anon, authenticated`.
  Jamais d'euros/CA exposés côté client (ADR 0007) via une nouvelle policy ou vue.
- **En-tête commenté** obligatoire : quoi, pourquoi, ADR concerné, ce que l'app fait si la
  migration n'est pas appliquée.
- **Application manuelle** (éditeur SQL Supabase) par **l'auteur de la PR dès la fusion**, noté
  dans la PR. Le code qui en dépend reste **fail-open** jusque-là.
- Ne jamais modifier une migration déjà fusionnée : en créer une nouvelle.
