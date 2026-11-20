-- ============================================================
-- Le numéro WhatsApp de commande d'un établissement (ADR 0107 §10, secours du client)
--
-- Quand une commande du site ne peut pas partir (panne, pas de réseau, plus tard imprimante hors ligne), le client GARDE son
-- panier et l'envoie lui-même au restaurateur par un message WhatsApp ordinaire. Il lui faut le numéro du restaurateur.
--
-- Pourquoi une table à part et pas `restaurants.phone` : ce téléphone vient de la fiche Google et peut être un fixe (pas de
-- WhatsApp). Le numéro de commande est CHOISI par le restaurateur, et il sera montré aux clients : il ne doit pas se mélanger
-- au reste de la fiche, lisible plus largement. Pourquoi pas une colonne de `restaurants` : ses colonnes se lisent par les
-- règles de cette table ; ici, RLS activée SANS policy = service role uniquement, et seul le serveur décide de ce qui sort.
--
-- `whatsapp` : chiffres seuls, indicatif compris, sans « + » ni « 0 » de tête (« 32470123456 »), la forme que `wa.me` attend.
-- NULL = pas de secours WhatsApp : la page dit alors d'appeler le restaurant.
--
-- Idempotente, non cassante. Si elle n'est pas appliquée : aucun numéro, le secours n'affiche pas de bouton WhatsApp,
-- rien ne casse. Le drapeau SITE_ORDER_RESTAURANTS (vide au départ) garde toute la fonction fermée.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_order_settings (
  restaurant_id  TEXT         PRIMARY KEY,
  whatsapp       TEXT         CHECK (whatsapp IS NULL OR whatsapp ~ '^[1-9][0-9]{8,14}$'),
  updated_by     UUID,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE site_order_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE site_order_settings IS
  'Réglages de la commande du site par établissement (ADR 0107). whatsapp = numéro où le client envoie sa commande quand le site ne peut pas la prendre (chiffres seuls, indicatif compris).';
