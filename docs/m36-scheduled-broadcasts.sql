-- m36 — Broadcasts programmés (ADR 0023)
-- Une promo suggérée par la page Opportunités vise un jour précis (jour creux,
-- jour de rush). L'annonce aux membres part à J-1/J-2, pas au moment où le
-- restaurateur accepte la suggestion : la ligne attend ici jusqu'à sa date
-- d'envoi, puis le cron quotidien la pousse via le pipeline broadcast normal
-- (enveloppe anti-spam ADR 0014 incluse).

CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  message       TEXT NOT NULL,
  target        JSONB NOT NULL DEFAULT '{"kind":"all"}',
  send_on       DATE NOT NULL,             -- jour d'envoi de l'annonce (J-1/J-2)
  promo_on      DATE,                      -- jour de la promo (planning + stock)
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,               -- NULL tant que le cron n'a pas envoyé
  result        JSONB                      -- { targeted, sent, skipped } après envoi
);

-- File du cron : les lignes dues non envoyées
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_due
  ON scheduled_broadcasts (send_on)
  WHERE sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_restaurant
  ON scheduled_broadcasts (restaurant_id, send_on DESC);

-- RLS sans policy : service-role uniquement (mêmes raisons que
-- restaurant_receipt_config, m32) — la cible et le message passent par les
-- routes admin qui vérifient requireAdmin.
ALTER TABLE scheduled_broadcasts ENABLE ROW LEVEL SECURITY;
