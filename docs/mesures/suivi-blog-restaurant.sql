-- ============================================================
-- Suivi des articles de blog des restaurants (ADR 0111, Trace). LECTURE SEULE.
-- Tables : migration 20261126-1300-restaurant-posts. Jours au fuseau de Bruxelles.
--
-- Seuils proposés par l'ADR, APRÈS 8 SEMAINES d'espace de commande ouvert :
--   - moins de 2 articles publiés par établissement        → l'outil ne sert pas ;
--   - moins de 30 lectures par article                     → personne ne les voit : retirer le bloc ou
--                                                            rouvrir la question de l'indexation ;
--   - (deuxième tranche) plus de la moitié des brouillons de Nina abandonnés → consigne à revoir.
-- Les lectures comptées peuvent inclure des robots. L'effet sur les ventes n'est pas mesuré.
-- L'ouverture d'un espace n'est pas datée en base : les requêtes partent du premier article créé, à comparer
-- à la date d'ouverture réelle de l'établissement (SITE_ORDER_RESTAURANTS).
-- ============================================================

-- 1. Par établissement : publiés, en ligne, retirés, supprimés, et depuis quand on écrit.
--    (« publiés » = articles distincts publiés au moins une fois ; un article supprimé garde ses traces mais
--    perd son identifiant : il est compté à part.)
WITH articles AS (
  SELECT restaurant_id,
         min(created_at)::date AS premier_brouillon,
         count(*) FILTER (WHERE first_published_at IS NOT NULL) AS articles_publies,
         count(*) FILTER (WHERE status = 'en_ligne') AS en_ligne,
         count(*) FILTER (WHERE status = 'brouillon') AS brouillons
  FROM restaurant_posts
  GROUP BY restaurant_id
), gestes AS (
  SELECT restaurant_id,
         count(*) FILTER (WHERE kind = 'publie') AS gestes_publier,
         count(*) FILTER (WHERE kind = 'retire') AS gestes_retirer,
         count(*) FILTER (WHERE kind = 'supprime') AS supprimes,
         count(*) FILTER (WHERE kind = 'supprime' AND reason <> 'brouillon') AS supprimes_apres_publication
  FROM restaurant_post_events
  GROUP BY restaurant_id
)
SELECT *
FROM articles
FULL OUTER JOIN gestes USING (restaurant_id)
ORDER BY restaurant_id;

-- 2. Par article : lectures, appuis sur « Voir la carte », part des lecteurs qui reviennent à la carte.
SELECT p.restaurant_id,
       p.slug,
       p.published_title AS titre,
       p.status,
       (p.first_published_at AT TIME ZONE 'Europe/Brussels')::date AS publie_le,
       coalesce(sum(d.reads), 0) AS lectures,
       coalesce(sum(d.menu_taps), 0) AS appuis_voir_la_carte,
       round(100.0 * coalesce(sum(d.menu_taps), 0) / nullif(sum(d.reads), 0), 1) AS pct_vers_la_carte,
       coalesce(sum(d.reads), 0) < 30 AS sous_le_seuil_30
FROM restaurant_posts p
LEFT JOIN restaurant_post_daily d ON d.post_id = p.id
WHERE p.first_published_at IS NOT NULL
GROUP BY p.id
ORDER BY p.restaurant_id, p.first_published_at DESC;

-- 3. Refus au contrôle, par motif (une ligne par motif et par version du brouillon) : 8 dernières semaines.
--    Un motif très fréquent suivi d'aucune publication = un mot refusé à tort, ou une consigne incomprise.
SELECT e.restaurant_id,
       e.reason AS motif,
       count(*) AS refus,
       count(DISTINCT e.post_id) AS articles_concernes,
       count(DISTINCT e.post_id) FILTER (WHERE p.first_published_at IS NOT NULL) AS publies_ensuite
FROM restaurant_post_events e
LEFT JOIN restaurant_posts p ON p.id = e.post_id
WHERE e.kind = 'refuse' AND e.created_at >= now() - interval '56 days'
GROUP BY e.restaurant_id, e.reason
ORDER BY refus DESC;

-- 4. Signalements à relire (aucun écran : c'est ici, et dans les journaux « [blog] article signalé »).
--    Pour masquer : POST /api/admin/restaurant-posts/moderation (super-admin), avec post_id et un motif.
SELECT e.restaurant_id,
       p.id AS post_id,
       p.slug,
       p.published_title AS titre,
       p.status,
       count(*) AS signalements,
       max(e.created_at) AS dernier
FROM restaurant_post_events e
JOIN restaurant_posts p ON p.id = e.post_id
WHERE e.kind = 'signale'
GROUP BY e.restaurant_id, p.id
ORDER BY (p.status = 'en_ligne') DESC, dernier DESC;

-- 5. Masquages et levées, avec le motif.
SELECT e.created_at, e.restaurant_id, e.post_id, e.kind, e.reason
FROM restaurant_post_events e
WHERE e.kind IN ('masque', 'demasque')
ORDER BY e.created_at DESC;

-- 6. Brouillons de Nina (deuxième tranche, aucune ligne aujourd'hui) : publiés tels quels, modifiés, en attente.
--    « Publié tel quel » = la version publiée est la première version enregistrée.
SELECT restaurant_id,
       count(*) AS brouillons_nina,
       count(*) FILTER (WHERE published_revision = 1) AS publies_tels_quels,
       count(*) FILTER (WHERE published_revision > 1) AS publies_modifies,
       count(*) FILTER (WHERE first_published_at IS NULL AND created_at < now() - interval '14 days') AS abandonnes
FROM restaurant_posts
WHERE origin = 'nina'
GROUP BY restaurant_id;
