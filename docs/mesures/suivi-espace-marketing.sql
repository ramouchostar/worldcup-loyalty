-- ============================================================
-- Suivi de l'ESPACE MARKETING (ADR 0104 §1) — LECTURE SEULE.
-- L'onglet « Marketing » doit pousser à agir : on compte les actions lancées par établissement
-- et par mois (annonces envoyées, demandes de pub, idées marketing de la brigade acceptées).
--
-- Ce qui dirait que la règle est fausse :
-- * moins d'un établissement actif sur deux lance au moins une action dans le mois →
--   la recommandation du haut ne convainc pas : revoir ses règles (lib/marketing-space.ts) ;
-- * les annonces ne sont jamais suivies de plus de tickets que la semaine d'avant (section
--   « Ce que tes actions ont donné ») → revoir les messages proposés.
-- ============================================================

WITH actions AS (
  SELECT restaurant_id, date_trunc('month', sent_at AT TIME ZONE 'Europe/Brussels') AS mois, 'annonce' AS sorte,
         count(DISTINCT (sent_at AT TIME ZONE 'Europe/Brussels')::date || '|' || COALESCE(message_body, '')) AS n
    FROM notification_log
   WHERE trigger_type IN ('admin_broadcast', 'admin_service')
   GROUP BY 1, 2
  UNION ALL
  SELECT restaurant_id, date_trunc('month', created_at AT TIME ZONE 'Europe/Brussels'), 'pub', count(*)
    FROM ad_requests
   WHERE status <> 'annulee'
   GROUP BY 1, 2
  UNION ALL
  SELECT restaurant_id, date_trunc('month', decided_at AT TIME ZONE 'Europe/Brussels'), 'idee_' || assistant, count(*)
    FROM agent_proposals
   WHERE status IN ('acceptee', 'executee')
     AND assistant IN ('hugo', 'emma', 'louis', 'max')
     AND decided_at IS NOT NULL
   GROUP BY 1, 2, assistant
)
SELECT r.id AS restaurant_id,
       r.name,
       to_char(a.mois, 'YYYY-MM') AS mois,
       COALESCE(sum(a.n) FILTER (WHERE a.sorte = 'annonce'), 0)        AS annonces,
       COALESCE(sum(a.n) FILTER (WHERE a.sorte = 'pub'), 0)            AS demandes_de_pub,
       COALESCE(sum(a.n) FILTER (WHERE a.sorte LIKE 'idee_%'), 0)      AS idees_marketing_acceptees
  FROM restaurants r
  LEFT JOIN actions a ON a.restaurant_id = r.id
 WHERE r.status = 'active' AND r.is_demo = false
 GROUP BY r.id, r.name, a.mois
 ORDER BY mois DESC NULLS LAST, r.name;
