-- ============================================================
-- Le compte derrière une commande du site (ADR 0108 §2 et §5)
--
-- Pour envoyer une commande du site, il faut désormais un compte Boosteats (e-mail ou Google). La commande garde le LIEN avec
-- ce compte : c'est ce qui permettra de créditer des points à la remise (tranche suivante), et de compter les nouveaux membres
-- venus par l'espace de commande (rapport de Nina). Le prénom et le téléphone restent purgés au bout de SITE_ORDER_PURGE_DAYS
-- (ADR 0099 §7) ; le lien avec le compte, lui, reste : c'est une ligne d'historique du membre, comme un ticket.
--
-- `member_id` : l'identifiant du compte. Nullable (les commandes d'avant n'en ont pas ; un compte supprimé vide la colonne :
-- ON DELETE SET NULL). Pas de lien « téléphone », pas de croisement avec d'autres données (ADR 0025).
--
-- Idempotente, non cassante. Si elle n'est pas appliquée : la commande est enregistrée SANS lien avec le compte (le code
-- réessaie sans la colonne et le dit dans les journaux), rien ne casse. Le drapeau SITE_ORDER_RESTAURANTS (vide au départ)
-- garde toute la fonction fermée.
-- ============================================================

ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS site_orders_member_idx ON site_orders (member_id, created_at DESC) WHERE member_id IS NOT NULL;

COMMENT ON COLUMN site_orders.member_id IS
  'Compte Boosteats qui a passé la commande (ADR 0108). NULL = commande d''avant les comptes, ou compte supprimé. Le prénom et le téléphone sont purgés, pas ce lien.';
