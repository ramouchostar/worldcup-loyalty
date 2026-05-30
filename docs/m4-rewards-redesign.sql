-- M4 : Refonte paliers récompenses
-- Ajoute restaurant_id et min_member_count à rewards
-- Remplace les 4 paliers (dont doublon) par 5 paliers progressifs

-- 1. Nouvelles colonnes
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS restaurant_id TEXT NOT NULL DEFAULT 'molenbeek';
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS min_member_count INTEGER NOT NULL DEFAULT 0;

-- 2. Index pour filtrage par restaurant
CREATE INDEX IF NOT EXISTS idx_rewards_restaurant ON rewards(restaurant_id);

-- 3. Vider les anciens paliers (doublon palier 3/4)
TRUNCATE TABLE rewards RESTART IDENTITY;

-- 4. Seed 5 paliers pour Belchicken Kraainem
-- Score = member_count × total_spent (colonne générée)
-- Palier 5 verrouillé jusqu'à 15 membres actifs minimum (anti-arnaque famille)
INSERT INTO rewards (level, score_threshold, title, description, gift_details, cost_euros, requires_purchase, is_active, restaurant_id, min_member_count) VALUES
(1,  500,   'Sauce XXL au choix',          'Premier palier — votre communauté est en route !',             'Sauce BBQ, Mayo, Ketchup ou Piquante au choix',           0.30,  false, true, 'kraainem', 0),
(2,  3000,  'Nuggets 6 pcs',               'La machine est lancée — nuggets pour tout le monde.',           '6 Nuggets Belchicken croustillants',                       1.80,  false, true, 'kraainem', 0),
(3,  9000,  'Burger + Frites',             'Votre équipe monte en puissance.',                              'Burger Classic + Frites Medium',                           4.50,  false, true, 'kraainem', 0),
(4,  22000, 'Repas complet grande taille', 'Les demi-finales approchent — vous le méritez.',                'Burger + Frites Large + Boisson 50cl',                     6.80,  false, true, 'kraainem', 0),
(5,  45000, 'Family Bucket — Finale',      'Réservé à l''équipe championne. Minimum 15 membres actifs.', 'Family Bucket : 12 pcs + 4 frites + 4 boissons',           28.00, false, true, 'kraainem', 15);
