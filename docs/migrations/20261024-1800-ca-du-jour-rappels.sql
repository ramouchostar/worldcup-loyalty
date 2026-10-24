-- ============================================================
-- Rappels du CA du jour (ADR 0087 §4)
--
-- Quoi :
--   daily_revenue_reminders   un rappel parti pour UN jour de ventes et UN moment
--                             (soir, 10h, 15h, 18h, semaine). La clé primaire est le
--                             verrou : la tâche horaire réserve la ligne AVANT
--                             d'envoyer, un second passage ne renvoie jamais.
--                             C'est aussi la trace « noté après quel rappel ».
--   restaurants.closing_times  dernière fermeture par jour de la semaine (0 =
--                             dimanche), en minutes depuis l'ouverture du jour (au-delà
--                             de 1440 : après minuit), null = fermé ce jour-là ; lue
--                             sur la fiche Google, rafraîchie chaque semaine.
--   restaurants.hours_synced_at  date de la dernière lecture de la fiche.
--
-- Pourquoi : rappeler le soir après la fermeture, puis le lendemain à 10 h, 15 h et
-- 18 h, et le dimanche à 15 h, jusqu'à la saisie — jamais deux fois le même rappel.
--
-- Sécurité : RLS activée SANS policy = service-role uniquement.
--
-- Idempotent. Sans la migration : la tâche horaire ne réserve rien et n'envoie RIEN
-- (fail-closed : sans verrou, un rappel pourrait partir à chaque passage) et le dit
-- dans sa réponse ; la saisie et « À faire » marchent comme avant.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_revenue_reminders (
  restaurant_id  text        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sales_day      date        NOT NULL,
  slot           text        NOT NULL CHECK (slot IN ('soir', '10h', '15h', '18h', 'semaine')),
  sent_at        timestamptz NOT NULL DEFAULT now(),
  recipients     int         NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, sales_day, slot)
);

ALTER TABLE daily_revenue_reminders ENABLE ROW LEVEL SECURITY;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS closing_times   jsonb,
  ADD COLUMN IF NOT EXISTS hours_synced_at timestamptz;
