-- ============================================================
-- Suivi des offres de la page de commande (ADR 0110, Trace ; articles : ADR 0112). LECTURE SEULE.
-- Tables : migration 20261127-1400-site-offers. Jours au fuseau de Bruxelles. Aucune donnée personnelle.
--
-- Seuils de l'ADR (des défauts, à recalibrer) :
--   - UN SEUL « pas appliquée » → l'équipe Boosteats le lit et appelle le gérant (requête 2) ;
--   - plus d'une commande concernée sur deux SANS réponse du comptoir → la mesure est aveugle (requête 3) ;
--   - un arrêt « équipe pas au courant » → la case à cocher ne suffit pas (requête 4) ;
--   - un établissement ouvert sans aucune offre publiée en 60 jours → la saisie ou le besoin est à revoir (requête 5).
-- Les affichages comptent une fois par visite et peuvent inclure des robots. On montre des chiffres, jamais « grâce à
-- l'offre » (ADR 0064).
-- ============================================================

-- 1. Par offre : affichages, ouvertures, commandes reçues pendant l'offre (annulées à part), réponses du comptoir.
WITH vues AS (
  SELECT offer_id,
         count(*) FILTER (WHERE kind = 'affichee')      AS affichages,
         count(*) FILTER (WHERE kind = 'ouverte')       AS ouvertures,
         count(*) FILTER (WHERE kind = 'appliquee')     AS appliquees,
         count(*) FILTER (WHERE kind = 'pas_appliquee') AS pas_appliquees
  FROM site_offer_events
  GROUP BY offer_id
),
commandes AS (
  SELECT x.offer_id,
         count(*) FILTER (WHERE s.status <> 'annulee') AS commandes,
         count(*) FILTER (WHERE s.status = 'annulee')  AS annulees
  FROM site_orders s, unnest(s.offer_ids) AS x(offer_id)
  GROUP BY x.offer_id
)
SELECT o.restaurant_id,
       o.title                         AS offre,
       o.state                         AS etat,
       o.first_day                     AS du,
       o.last_day                      AS au,
       coalesce(v.affichages, 0)       AS affichages,
       coalesce(v.ouvertures, 0)       AS ouvertures,
       coalesce(c.commandes, 0)        AS commandes_recues,
       coalesce(c.annulees, 0)         AS commandes_annulees,
       coalesce(v.appliquees, 0)       AS appliquees,
       coalesce(v.pas_appliquees, 0)   AS pas_appliquees
FROM site_offers o
LEFT JOIN vues v ON v.offer_id = o.id
LEFT JOIN commandes c ON c.offer_id = o.id
WHERE o.state <> 'brouillon'
ORDER BY o.restaurant_id, o.first_day DESC;

-- 2. Chaque « pas appliquée » (28 jours) : quelle offre, quelle commande. À lire une par une.
SELECT e.restaurant_id,
       o.title                                                    AS offre,
       s.order_day                                                AS jour,
       s.number                                                   AS numero,
       (e.created_at AT TIME ZONE 'Europe/Brussels')              AS repondu_le
FROM site_offer_events e
JOIN site_offers o ON o.id = e.offer_id
LEFT JOIN site_orders s ON s.id = e.order_id
WHERE e.kind = 'pas_appliquee' AND e.created_at >= now() - interval '28 days'
ORDER BY e.created_at DESC;

-- 3. Commandes RETIRÉES qui avaient une offre (28 jours) : combien ont une réponse du comptoir.
SELECT s.restaurant_id,
       count(*)                                                                   AS commandes_concernees,
       count(e.id)                                                                AS avec_reponse,
       count(*) - count(e.id)                                                     AS sans_reponse,
       round(100.0 * (count(*) - count(e.id)) / nullif(count(*), 0))              AS pct_sans_reponse
FROM site_orders s
CROSS JOIN LATERAL unnest(s.offer_ids) AS x(offer_id)
LEFT JOIN site_offer_events e ON e.offer_id = x.offer_id AND e.order_id = s.id AND e.kind IN ('appliquee', 'pas_appliquee')
WHERE s.status = 'retiree' AND s.created_at >= now() - interval '28 days'
GROUP BY s.restaurant_id
ORDER BY pct_sans_reponse DESC NULLS LAST;

-- 4. Offres arrêtées avant leur fin : par motif (stock, equipe, erreur, autre), et au bout de combien de temps.
SELECT restaurant_id,
       stop_reason                                                                            AS motif,
       count(*)                                                                               AS arrets,
       round(avg(extract(epoch FROM stopped_at - published_at) / 3600)::numeric, 1)           AS heures_en_ligne_en_moyenne,
       max(stopped_at AT TIME ZONE 'Europe/Brussels')                                         AS dernier
FROM site_offers
WHERE state = 'arretee'
GROUP BY restaurant_id, stop_reason
ORDER BY (stop_reason = 'equipe') DESC, arrets DESC;

-- 5. Établissements au forfait Pro sans aucune offre publiée en 60 jours. Seuls ceux que liste SITE_ORDER_RESTAURANTS
--    (variable d'environnement, hors base) ont l'espace de commande ouvert : ne lire que ceux-là.
SELECT r.id                                                           AS restaurant_id,
       r.name                                                         AS etablissement,
       max(o.published_at AT TIME ZONE 'Europe/Brussels')             AS derniere_offre_publiee
FROM restaurants r
JOIN restaurant_subscriptions sub ON sub.restaurant_id = r.id AND sub.plan = 'pro' AND sub.status = 'active'
LEFT JOIN site_offers o ON o.restaurant_id = r.id AND o.published_at IS NOT NULL
WHERE NOT coalesce(r.is_demo, false)
GROUP BY r.id, r.name
HAVING max(o.published_at) IS NULL OR max(o.published_at) < now() - interval '60 days'
ORDER BY derniere_offre_publiee NULLS FIRST;

-- 6. Les articles d'offre (ADR 0112) : une ligne par offre publiée, ce qu'est devenu son article. « aucun » : pas encore
--    préparé, « Mes promos » pas coché, ou aucun jour assez tôt (offre d'un seul jour publiée après 17 h la veille).
--    Seuil : plus d'une offre sur quatre écartée pour « controle » → les titres que les restaurants écrivent ne passent
--    pas le contrôle des textes : à rouvrir.
SELECT o.restaurant_id,
       o.title                                    AS offre,
       coalesce(a.status, 'aucun')                AS article,
       a.reason                                   AS raison,
       a.reason_detail                            AS detail,
       a.publish_day                              AS jour_prevu
FROM site_offers o
LEFT JOIN restaurant_post_occasions a ON a.restaurant_id = o.restaurant_id AND a.source_key = 'promo:' || o.id::text
WHERE o.published_at >= now() - interval '60 days'
ORDER BY o.restaurant_id, o.published_at DESC;

-- 7. Articles d'offre retirés parce que l'offre a été arrêtée.
SELECT restaurant_id, count(*) AS retires, max(created_at AT TIME ZONE 'Europe/Brussels') AS dernier
FROM restaurant_post_events
WHERE kind = 'retire' AND reason = 'offre_arretee'
GROUP BY restaurant_id
ORDER BY restaurant_id;

-- 8. Anomalie : un article d'offre encore « en ligne » alors que son offre est arrêtée. La page le cache déjà ; une ligne
--    ici veut dire que le retrait n'a pas pu s'écrire (voir les journaux).
SELECT p.restaurant_id, p.id AS article, o.id AS offre, o.stopped_at
FROM restaurant_posts p
JOIN site_offers o ON o.id = p.offer_id
WHERE p.status = 'en_ligne' AND o.state = 'arretee';
