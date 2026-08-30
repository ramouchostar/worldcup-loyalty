-- ============================================================
-- 2026-08-30 02:18 — Index sur les colonnes filtrées par RLS et sur les
-- clés étrangères non indexées (CLAUDE.md § Collab 5). Idempotente,
-- non-cassante : uniquement des CREATE INDEX, aucun changement de schéma.
--
-- POURQUOI. Audit RLS des 69 migrations : `orders.user_id` porte à la fois
-- la policy `orders_own_read` (auth.uid() = user_id) et 32 filtres
-- `.eq("user_id", …)` répartis dans 9 fichiers (dashboard membre, cron
-- notifications, lib/rewards, lib/feedback, lib/member-strategies,
-- lib/receipt-scans). `orders` n'a pourtant que deux index :
-- idx_orders_restaurant (m3) et idx_orders_order_number (m6). Chaque
-- affichage du dashboard membre fait donc un Seq Scan sur `orders`.
--
-- Les autres colonnes ci-dessous sont des FK sans index. Douze d'entre
-- elles pointent vers profiles(id) ON DELETE CASCADE : une suppression de
-- compte RGPD (data_requests) déclenche un Seq Scan sur chaque table
-- enfant, avec les verrous associés.
--
-- CONCURRENTLY : ces tables sont en production. CREATE INDEX CONCURRENTLY
-- ne prend pas de verrou d'écriture mais NE PEUT PAS tourner dans une
-- transaction — appliquer les instructions UNE PAR UNE dans l'éditeur SQL
-- Supabase, sans BEGIN/COMMIT. Si l'une échoue, elle laisse un index
-- INVALID qu'il faut DROP avant de la rejouer :
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--
-- NON TRAITÉ ICI (PR séparée) : les 29 appels `auth.uid()` des policies ne
-- sont pas enveloppés dans (SELECT auth.uid()), donc réévalués par ligne.
-- Impact faible aujourd'hui (le chemin chaud passe par le service role qui
-- contourne RLS), à corriger avant tout déplacement de lectures vers le
-- client anon.
-- ============================================================

-- ── orders : policy orders_own_read + 32 filtres .eq("user_id") ──────────
-- submitted_at en 2e position : 3 des 4 tris associés à un filtre user_id
-- utilisent submitted_at (orders n'a PAS de colonne created_at — les colonnes
-- de temps sont order_date, order_time, submitted_at, validated_at).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user
  ON orders (user_id, submitted_at DESC);

-- FK orders.team_id -> teams. Partiel : team_id est nullable depuis m57
-- (commandes sans équipe).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_team
  ON orders (team_id) WHERE team_id IS NOT NULL;

-- ── transfers : policy transfers_own_read + 3 FK sans index ──────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_user
  ON transfers (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_from_team
  ON transfers (from_team_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_to_team
  ON transfers (to_team_id);

-- ── FK -> orders : jointures et cascade de suppression ───────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_point_tx_order
  ON point_transactions (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_feedback_order
  ON quality_feedback (order_id);

-- ── FK -> profiles ON DELETE CASCADE (coût de la suppression RGPD) ───────
-- receipt_scans a bien 4 index (m58) mais aucun en tête sur user_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipt_scans_user
  ON receipt_scans (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_redemption_tokens_user
  ON redemption_tokens (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_requests_user
  ON data_requests (user_id);
