-- ============================================================
-- Suivi des CORRECTIONS du CA du jour (ADR 0087) — LECTURE SEULE, aucun montant membre.
-- Contexte : un restaurateur (Mounir, 2026-11-14) s'était trompé et ne retrouvait plus le jour
-- à corriger. Depuis, chaque jour des 14 derniers est rouvrable (liste sur /admin/[id]/ca/[jour],
-- barres cliquables de l'accueil). Une correction = la même ligne réécrite par la console après
-- sa création (updated_at > created_at + 2 min ; l'upsert de save_daily_revenue_console pose
-- updated_at = now() à chaque réécriture).
--
-- Ce qui dirait que la règle est fausse :
-- * aucune correction après 4 semaines → soit personne ne se trompe (peu probable : un cas réel
--   dès la première semaine de saisie), soit le chemin reste introuvable → re-regarder l'écran ;
-- * des corrections en rafale sur le même jour (3+) → le formulaire prête à confusion.
-- ============================================================

-- Les corrections récentes, une ligne par jour corrigé
SELECT restaurant_id,
       sales_day,
       outcome,
       amount,
       to_char(created_at AT TIME ZONE 'Europe/Brussels', 'DD/MM HH24:MI') AS premiere_saisie,
       to_char(updated_at AT TIME ZONE 'Europe/Brussels', 'DD/MM HH24:MI') AS derniere_correction
  FROM daily_revenue_entries
 WHERE source = 'console'
   AND updated_at > created_at + INTERVAL '2 minutes'
 ORDER BY updated_at DESC
 LIMIT 50;

-- Volume par établissement et par semaine : saisies totales vs jours corrigés
SELECT restaurant_id,
       date_trunc('week', updated_at AT TIME ZONE 'Europe/Brussels')::date AS semaine,
       COUNT(*)                                                            AS jours_notes,
       COUNT(*) FILTER (WHERE updated_at > created_at + INTERVAL '2 minutes') AS jours_corriges
  FROM daily_revenue_entries
 WHERE source = 'console'
 GROUP BY 1, 2
 ORDER BY 2 DESC, 1;
