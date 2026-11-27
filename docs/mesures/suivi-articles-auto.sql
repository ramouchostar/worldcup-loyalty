-- ============================================================
-- Suivi des articles publiés automatiquement (ADR 0112, Trace). LECTURE SEULE.
-- Tables : migrations 20261126-1300-restaurant-posts et 20261126-2330-restaurant-posts-auto.
-- Jours au fuseau de Bruxelles.
--
-- Seuils proposés par l'ADR, APRÈS 8 SEMAINES :
--   - plus d'un article publié sur cinq retiré après coup, ou un refus sur trois → revenir à « Oui, publier » ;
--   - plus d'un préavis sur dix sans message délivré                              → le canal ne tient pas ;
--   - moins de 30 lectures par article d'occasion                                 → personne ne les lit.
-- Les lectures comptées peuvent inclure des robots. L'effet sur les ventes n'est pas mesuré.
-- ============================================================

-- 0. Qui a activé, quand, quelle phrase ; qui a arrêté.
SELECT restaurant_id, enabled, kinds, accepted_at, terms_version, disabled_at
FROM restaurant_post_auto_settings
ORDER BY restaurant_id;

-- 1. Par établissement et par type : prévenus, publiés sans réaction, publiés à la main, refusés, retirés après coup.
--    « retiré après coup » = une personne l'a retiré avant sa fin (la fin automatique ne compte pas).
WITH retraits AS (
  SELECT DISTINCT post_id
  FROM restaurant_post_events
  WHERE kind IN ('retire', 'masque') AND reason IS DISTINCT FROM 'fin_automatique' AND post_id IS NOT NULL
)
SELECT o.restaurant_id,
       o.kind AS type,
       count(*) FILTER (WHERE o.notified_at IS NOT NULL) AS prevenus,
       count(*) FILTER (WHERE o.status = 'publie' AND o.published_mode = 'auto') AS publies_sans_reaction,
       count(*) FILTER (WHERE o.status = 'publie' AND o.published_mode = 'maintenant') AS publies_a_la_main,
       count(*) FILTER (WHERE o.status = 'publie' AND o.modified_at IS NOT NULL) AS publies_apres_modification,
       count(*) FILTER (WHERE o.status = 'refuse' AND o.refused_via = 'lien') AS refuses_par_le_lien,
       count(*) FILTER (WHERE o.status = 'refuse' AND o.refused_via = 'console') AS refuses_en_console,
       count(*) FILTER (WHERE o.status = 'publie' AND r.post_id IS NOT NULL) AS retires_apres_coup
FROM restaurant_post_occasions o
LEFT JOIN retraits r ON r.post_id = o.post_id
GROUP BY o.restaurant_id, o.kind
ORDER BY o.restaurant_id, o.kind;

-- 2. Écartées : pourquoi, et combien avaient déjà été annoncées au restaurateur.
SELECT restaurant_id,
       reason AS raison,
       count(*) AS ecartees,
       count(*) FILTER (WHERE notified_at IS NOT NULL) AS dont_deja_prevenues,
       max(publish_day) AS derniere
FROM restaurant_post_occasions
WHERE status = 'ecarte' AND publish_day >= (now() AT TIME ZONE 'Europe/Brussels')::date - 56
GROUP BY restaurant_id, reason
ORDER BY restaurant_id, ecartees DESC;

-- 3. Les préavis : délivrés ou non (journal des messages). « sent » sans accusé = le webhook est à vérifier.
SELECT date_trunc('week', created_at AT TIME ZONE 'Europe/Brussels')::date AS semaine,
       count(*) AS preavis,
       count(*) FILTER (WHERE delivered_at IS NOT NULL AND bounced_at IS NULL AND complained_at IS NULL) AS delivres,
       count(*) FILTER (WHERE status = 'sent') AS sans_accuse,
       count(*) FILTER (WHERE status = 'failed') AS non_partis,
       count(*) FILTER (WHERE bounced_at IS NOT NULL OR complained_at IS NOT NULL) AS revenus_ou_signales
FROM message_sends
WHERE message_key = 'article_auto_preavis'
GROUP BY 1
ORDER BY 1 DESC;

-- 4. Lectures par type d'occasion (articles publiés).
SELECT o.restaurant_id,
       o.kind AS type,
       count(DISTINCT o.post_id) AS articles,
       coalesce(sum(d.reads), 0) AS lectures,
       coalesce(sum(d.menu_taps), 0) AS appuis_voir_la_carte,
       round(coalesce(sum(d.reads), 0)::numeric / nullif(count(DISTINCT o.post_id), 0), 1) AS lectures_par_article
FROM restaurant_post_occasions o
LEFT JOIN restaurant_post_daily d ON d.post_id = o.post_id
WHERE o.status = 'publie' AND o.post_id IS NOT NULL
GROUP BY o.restaurant_id, o.kind
ORDER BY o.restaurant_id, o.kind;

-- 5. Occasions restées « prévues » ou « prévenu » après leur jour : la tâche planifiée ne passe pas.
SELECT restaurant_id, id, status, publish_day
FROM restaurant_post_occasions
WHERE status IN ('prevu', 'prevenu') AND publish_day < (now() AT TIME ZONE 'Europe/Brussels')::date
ORDER BY publish_day;

-- 6. Météo : la réserve des prévisions (migration 20261127-0930). Une ligne « ok = false » = pas d'article météo pour
--    ce point jusqu'à la prochaine demande ; la ligne « * » = toutes les demandes suspendues (429 ou 403).
SELECT key AS point, ok, status, error, confirmed_at, next_allowed_at
FROM weather_forecast_cache
ORDER BY ok, key;

-- 7. Météo : annoncées, publiées, écartées parce que la prévision a changé ou n'a pas pu être vérifiée.
--    Seuil : plus d'un préavis sur trois écarté pour « meteo_change » → revoir la règle.
SELECT facts->>'sky' AS ciel,
       facts->>'service' AS service,
       count(*) FILTER (WHERE notified_at IS NOT NULL) AS prevenus,
       count(*) FILTER (WHERE status = 'publie') AS publiees,
       count(*) FILTER (WHERE reason = 'meteo_change') AS prevision_changee,
       count(*) FILTER (WHERE reason = 'meteo_indisponible') AS non_verifiees
FROM restaurant_post_occasions
WHERE kind = 'meteo'
GROUP BY 1, 2
ORDER BY 1, 2;

-- 8. Horaires : les occasions écartées parce que le restaurant était fermé, ses horaires inconnus ou illisibles, ou ce
--    qu'il propose changé. Seuil : plus d'une sur dix pour « horaires_inconnus » ou « horaires_illisibles ».
SELECT restaurant_id,
       count(*) AS occasions,
       count(*) FILTER (WHERE reason = 'ferme_ce_jour')       AS ferme,
       count(*) FILTER (WHERE reason = 'horaires_inconnus')   AS horaires_inconnus,
       count(*) FILTER (WHERE reason = 'horaires_illisibles') AS horaires_illisibles,
       count(*) FILTER (WHERE reason = 'infos_changees')      AS infos_changees
FROM restaurant_post_occasions
WHERE created_at >= NOW() - INTERVAL '8 weeks'
GROUP BY restaurant_id
ORDER BY restaurant_id;
