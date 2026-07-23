-- ============================================================
-- M38 : ADR 0023 — Canal qualité privé (« note inversée »)
--
-- 1. quality_feedback : retour d'un membre à SON établissement.
--    Intention d'abord (jamais mitigé) :
--      - 'encouragement' (positif)  → prénom visible côté resto
--      - 'incident'      (négatif)  → anonyme par défaut, contexte grossi
--    Rattaché à une commande validée (anti-faux-avis). occurred_at =
--    quand l'expérience a eu lieu (dérivé de la commande côté API).
-- 2. feedback_messages : fil de "service recovery" MÉDIÉ par la
--    plateforme — le resto n'obtient JAMAIS le contact brut du membre.
--
-- Écritures : service role uniquement (API serveur, createAdminClient).
-- Lecture membre : own-read (ses retours / les messages de ses fils).
-- Le resto accède aux données côté serveur, borné à son restaurant_id
-- et réservé à l'admin établissement/owner (requireAdmin, admin-guard.ts).
-- Idempotent, non-cassant.
-- ============================================================

CREATE TABLE IF NOT EXISTS quality_feedback (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restaurant_id     TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id          UUID        REFERENCES orders(id) ON DELETE SET NULL,  -- la commande à l'origine du retour
  sentiment         TEXT        NOT NULL CHECK (sentiment IN ('encouragement','incident')),
  dimensions        TEXT[]      NOT NULL DEFAULT '{}',      -- axes cochés (incident) : accuracy|wait|quality|welcome
  comment           TEXT,                                   -- commentaire libre optionnel, modéré
  is_anonymous      BOOLEAN     NOT NULL DEFAULT true,      -- posé à l'insert : false pour un encouragement, true pour un incident (le membre peut forcer true)
  contact_opt_in    BOOLEAN     NOT NULL DEFAULT false,     -- le membre accepte d'être recontacté sur CE retour
  occurred_at       TIMESTAMPTZ,                            -- moment de l'expérience (dérivé de la commande) ; NULL si inconnu
  status            TEXT        NOT NULL DEFAULT 'new'     CHECK (status IN ('new','acknowledged','resolved')),
  moderation_status TEXT        NOT NULL DEFAULT 'visible' CHECK (moderation_status IN ('visible','flagged','hidden')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quality_feedback ENABLE ROW LEVEL SECURITY;

-- Le membre lit UNIQUEMENT ses propres retours. Aucune policy INSERT/UPDATE/
-- DELETE → écritures réservées au service role (API). Le resto lit côté
-- serveur (service role) borné à son restaurant_id (jamais via ce client).
DROP POLICY IF EXISTS "quality_feedback_own_read" ON quality_feedback;
CREATE POLICY "quality_feedback_own_read" ON quality_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_quality_feedback_restaurant
  ON quality_feedback (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_feedback_user
  ON quality_feedback (user_id, created_at DESC);

-- Fil de service recovery médié : messages échangés membre ↔ établissement,
-- toujours via la plateforme. body = texte ; sender identifie l'émetteur.
CREATE TABLE IF NOT EXISTS feedback_messages (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id   UUID        NOT NULL REFERENCES quality_feedback(id) ON DELETE CASCADE,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sender        TEXT        NOT NULL CHECK (sender IN ('member','establishment')),
  body          TEXT        NOT NULL,
  channel       TEXT        NOT NULL DEFAULT 'in_app',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feedback_messages ENABLE ROW LEVEL SECURITY;

-- Le membre lit les messages de SES fils (via quality_feedback.user_id).
-- Écritures : service role uniquement (API — le resto n'a jamais le contact).
DROP POLICY IF EXISTS "feedback_messages_own_read" ON feedback_messages;
CREATE POLICY "feedback_messages_own_read" ON feedback_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quality_feedback qf
      WHERE qf.id = feedback_messages.feedback_id AND qf.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_feedback_messages_feedback
  ON feedback_messages (feedback_id, created_at);
