-- ============================================================
-- 2026-09-21 21:19 — Arrêt d'une séquence par le destinataire
-- (ADR 0063 §2, PR 3/5)
--
-- « Ne plus recevoir ces rappels » (lien en pied de chaque e-mail de
-- séquence) et l'arrêt en un clic des messageries (en-tête
-- List-Unsubscribe-Post, RFC 8058) coupent UNE séquence pour UNE personne —
-- jamais le programme, jamais les informations de service (ADR 0039).
--
-- Quoi : `message_optouts` (personne, séquence, date, d'où vient l'arrêt).
-- Le moteur des séquences (lib/sequence-runner.ts) n'envoie jamais une
-- séquence arrêtée. Données personnelles : parties avec le compte (ON DELETE
-- CASCADE), dans l'export et l'effacement (lib/gdpr.ts).
--
-- RLS activée SANS policy = service role uniquement.
--
-- Sans cette migration : le moteur ne peut pas lire les arrêts, il n'envoie
-- donc AUCUNE séquence (fail-closed : mieux vaut se taire qu'écrire à
-- quelqu'un qui a dit stop). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS message_optouts (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_key  TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'lien' CHECK (source IN ('lien', 'un_clic', 'compte')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, message_key)
);

ALTER TABLE message_optouts ENABLE ROW LEVEL SECURITY; -- service-role only
